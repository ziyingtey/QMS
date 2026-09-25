"""HTTP sidecar that loads wait_model.joblib and serves POST /predict.

C# API cannot load sklearn joblib natively — this process is the bridge.

  cd ml && .venv/bin/python serve_wait_model.py --port 5099

POST /predict  JSON body = feature dict (same columns as training)
Response: {"minutes": 12.4, "source": "ml"}

GET /health → {"ok": true, "model": "..."}
"""
from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import joblib
import pandas as pd

ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = ROOT / "wait_model.joblib"


def load_bundle(path: Path):
    bundle = joblib.load(path)
    if isinstance(bundle, dict) and "pipeline" in bundle:
        return bundle
    # Older dumps may be bare pipeline
    return {
        "pipeline": bundle,
        "feature_numeric": [],
        "feature_categorical": [],
        "target": "WaitingMinutes",
    }


class Handler(BaseHTTPRequestHandler):
    bundle = None
    model_path = DEFAULT_MODEL

    def log_message(self, fmt, *args):  # quieter
        pass

    def _send(self, code: int, obj: dict):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/health"):
            self._send(
                200,
                {
                    "ok": Handler.bundle is not None,
                    "model": str(Handler.model_path),
                },
            )
            return
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/predict":
            self._send(404, {"error": "not found"})
            return
        if Handler.bundle is None:
            self._send(503, {"error": "model not loaded"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send(400, {"error": "invalid json"})
            return

        # Accept single object or {"features": {...}}
        feats = payload.get("features", payload)
        if not isinstance(feats, dict):
            self._send(400, {"error": "features must be object"})
            return

        numeric = Handler.bundle.get("feature_numeric") or []
        categorical = Handler.bundle.get("feature_categorical") or []
        cols = list(numeric) + list(categorical)
        if not cols:
            # Infer from payload keys only — pipeline will fail clearly if wrong
            row = {k: feats.get(k) for k in feats}
        else:
            row = {c: feats.get(c) for c in cols}

        try:
            X = pd.DataFrame([row])
            # Fill Tier-B defaults if missing
            defaults = {
                "CrossLaneQueueLength": row.get("QueueLength", 0) or 0,
                "PeopleAheadCallNext": row.get("PeopleAhead", row.get("QueueLength", 0)) or 0,
                "ListeningCounters": row.get("ActiveCounters", 1) or 1,
                "SlotActive": 0,
                "CallNextPriority": 1,
                "TicketPrefix": str(row.get("ServiceCode", "X"))[:1].upper(),
                "EntryType": 0,
                "CheckedIn": 0,
                "EnqueueSequence": 1,
                "BranchCode": 0,
                "IsPeakHour": 0,
            }
            for k, v in defaults.items():
                if k in X.columns and (X.at[0, k] is None or (isinstance(X.at[0, k], float) and pd.isna(X.at[0, k]))):
                    X.at[0, k] = v
                elif k in cols and k not in feats:
                    X[k] = v
            pred = float(Handler.bundle["pipeline"].predict(X)[0])
            pred = max(0.0, pred)
            self._send(200, {"minutes": round(pred, 2), "source": "ml"})
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": str(exc)})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5099)
    args = ap.parse_args()
    Handler.model_path = args.model
    Handler.bundle = load_bundle(args.model)
    print(f"Loaded {args.model}")
    print(f"Serving on http://{args.host}:{args.port}  POST /predict  GET /health")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
