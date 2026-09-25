"""Build transitional wait-training CSV: Tier-B synthetic + Anonymous Bank (+ Ogun distribution check).

Primary rows stay QMS Tier-B synthetic (Call Next / multi-queue features).
Anonymous Bank (Technion 1999 phone center) is mapped into the same schema as a
cross-domain regularizer — features that do not exist get safe defaults.
Ogun State bank field sheets supply wait-minute distribution checks only
(X1 ≈ waiting, X2 ≈ service, X3 ≈ sojourn); they are NOT mixed into training.

Usage:
  cd ml && .venv/bin/python prepare_transitional_train.py
  .venv/bin/python train_wait_model.py --csv data/transitional_train.csv
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
SYNTH = DATA / "wait_training.csv"
ANON = DATA / "anonymous_bank_adapted.csv"
OUT = DATA / "transitional_train.csv"
OGUN_REPORT = ROOT / "ogun_distribution_check.json"
DEFAULT_OGUN = Path.home() / "Downloads" / "Supplementary DATA on Queues"

TIER_B_COLS = [
    "BranchCode",
    "ServiceCode",
    "TicketPrefix",
    "DefaultAvgServiceMinutes",
    "EntryType",
    "EnqueueSequence",
    "CheckedIn",
    "SlotActive",
    "CallNextPriority",
    "QueueLength",
    "CrossLaneQueueLength",
    "PeopleAheadCallNext",
    "ActiveCounters",
    "ListeningCounters",
    "HourOfDay",
    "DayOfWeek",
    "IsPeakHour",
    "WaitingMinutes",
]


def map_anonymous(df: pd.DataFrame, max_rows: int, seed: int) -> pd.DataFrame:
    """Map anonymous_bank_adapted.csv → Tier-B training schema."""
    work = df.copy()
    if "ActualWaitingMinutes" in work.columns:
        work["WaitingMinutes"] = pd.to_numeric(work["ActualWaitingMinutes"], errors="coerce")
    else:
        work["WaitingMinutes"] = pd.to_numeric(work.get("WaitingMinutes"), errors="coerce")

    work = work.dropna(subset=["WaitingMinutes"])
    work = work[work["WaitingMinutes"] >= 0]
    # Cap extreme phone-queue waits so they don't dominate tree leaves
    work = work[work["WaitingMinutes"] <= 120]

    if len(work) > max_rows:
        work = work.sample(n=max_rows, random_state=seed)

    ql = pd.to_numeric(work.get("QueueLength"), errors="coerce").fillna(0).astype(int)
    people = pd.to_numeric(work.get("PeopleAhead"), errors="coerce")
    people = people.fillna(ql).astype(int)
    counters = pd.to_numeric(work.get("ActiveCounters"), errors="coerce").fillna(1).clip(lower=1).astype(int)
    avg = pd.to_numeric(work.get("DefaultAvgServiceMinutes"), errors="coerce").fillna(10.0)
    # Anonymous service codes are PS/NW/... — keep as categorical; prefix = first letter
    svc = work.get("ServiceCode", "PS").astype(str).str.strip().str.upper()
    svc = svc.replace({"": "PS"})

    out = pd.DataFrame(
        {
            "BranchCode": pd.to_numeric(work.get("BranchCode"), errors="coerce").fillna(0).astype(int),
            "ServiceCode": svc,
            "TicketPrefix": svc.str[:1],
            "DefaultAvgServiceMinutes": avg,
            "EntryType": 0,
            "EnqueueSequence": pd.to_numeric(work.get("EnqueueSequence"), errors="coerce").fillna(1).astype(int),
            "CheckedIn": 0,
            "SlotActive": 0,
            "CallNextPriority": 1,
            "QueueLength": ql,
            "CrossLaneQueueLength": ql,
            "PeopleAheadCallNext": people,
            "ActiveCounters": counters,
            "ListeningCounters": counters,
            "HourOfDay": pd.to_numeric(work.get("HourOfDay"), errors="coerce").fillna(12).astype(int),
            "DayOfWeek": pd.to_numeric(work.get("DayOfWeek"), errors="coerce").fillna(1).astype(int),
            "IsPeakHour": pd.to_numeric(work.get("IsPeakHour"), errors="coerce").fillna(0).astype(int),
            "WaitingMinutes": work["WaitingMinutes"].astype(float),
            "DataSource": "anonymous_bank",
        }
    )
    return out


def ensure_synth_cols(df: pd.DataFrame) -> pd.DataFrame:
    work = df.copy()
    if "WaitingMinutes" not in work.columns:
        raise SystemExit("Synthetic CSV missing WaitingMinutes")
    for col in TIER_B_COLS:
        if col not in work.columns:
            if col == "CrossLaneQueueLength":
                work[col] = work["QueueLength"]
            elif col == "PeopleAheadCallNext":
                work[col] = work["QueueLength"]
            elif col == "ListeningCounters":
                work[col] = work.get("ActiveCounters", 1)
            elif col == "TicketPrefix":
                work[col] = work["ServiceCode"].astype(str).str[:1].str.upper()
            elif col in ("SlotActive",):
                work[col] = 0
            elif col == "CallNextPriority":
                work[col] = 1
            else:
                work[col] = 0
    work["DataSource"] = "tier_b_synthetic"
    return work[TIER_B_COLS + ["DataSource"]]


def load_ogun_waits(ogun_dir: Path) -> np.ndarray:
    waits: list[float] = []
    if not ogun_dir.is_dir():
        return np.array([], dtype=float)
    try:
        import openpyxl
    except ImportError:
        return np.array([], dtype=float)

    for path in sorted(ogun_dir.glob("*.xlsx")):
        try:
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            ws = wb.active
            header = None
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i == 0:
                    header = [str(c).strip().upper() if c is not None else "" for c in row]
                    # Prefer column named X1; else index 2
                    continue
                if not row or row[0] is None:
                    continue
                # Skip summary rows (MEAN / label junk)
                if isinstance(row[0], str):
                    continue
                val = row[2] if len(row) > 2 else None  # X1
                if header and "X1" in header:
                    idx = header.index("X1")
                    if idx < len(row):
                        val = row[idx]
                try:
                    f = float(val)
                except (TypeError, ValueError):
                    continue
                if 0 <= f <= 180:
                    waits.append(f)
            wb.close()
        except Exception as exc:  # noqa: BLE001
            print(f"Ogun skip {path.name}: {exc}")
    return np.asarray(waits, dtype=float)


def pct(arr: np.ndarray) -> dict:
    if len(arr) == 0:
        return {"n": 0}
    return {
        "n": int(len(arr)),
        "mean": round(float(np.mean(arr)), 2),
        "p50": round(float(np.percentile(arr, 50)), 2),
        "p75": round(float(np.percentile(arr, 75)), 2),
        "p90": round(float(np.percentile(arr, 90)), 2),
        "p95": round(float(np.percentile(arr, 95)), 2),
        "max": round(float(np.max(arr)), 2),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--synth", type=Path, default=SYNTH)
    ap.add_argument("--anonymous", type=Path, default=ANON)
    ap.add_argument("--ogun-dir", type=Path, default=DEFAULT_OGUN)
    ap.add_argument("--anon-max", type=int, default=40000, help="Max Anonymous rows to mix in")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    if not args.synth.exists():
        raise SystemExit(f"Missing synthetic CSV: {args.synth}")
    synth = ensure_synth_cols(pd.read_csv(args.synth))

    parts = [synth]
    anon_n = 0
    if args.anonymous.exists():
        anon = map_anonymous(pd.read_csv(args.anonymous), max_rows=args.anon_max, seed=args.seed)
        anon_n = len(anon)
        parts.append(anon[TIER_B_COLS + ["DataSource"]])
    else:
        print(f"WARNING: Anonymous CSV missing at {args.anonymous}")

    merged = pd.concat(parts, ignore_index=True)
    merged = merged.sample(frac=1.0, random_state=args.seed).reset_index(drop=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    merged.drop(columns=["DataSource"]).to_csv(args.out, index=False)

    ogun = load_ogun_waits(args.ogun_dir)
    report = {
        "synth_wait": pct(synth["WaitingMinutes"].to_numpy(dtype=float)),
        "anonymous_wait_in_merge": pct(
            merged.loc[merged["DataSource"] == "anonymous_bank", "WaitingMinutes"].to_numpy(dtype=float)
        )
        if anon_n
        else {"n": 0},
        "merged_wait": pct(merged["WaitingMinutes"].to_numpy(dtype=float)),
        "ogun_X1_wait": pct(ogun),
        "notes": [
            "Ogun X1 used only for distribution check — not trained on.",
            "Anonymous mapped with TicketPrefix=ServiceCode[0], SlotActive=0, CallNextPriority=1.",
            "Replace transitional mix with export_wait_training_data.sql / MlTrainingObservation when real tickets exist.",
        ],
        "row_counts": {
            "synth": int(len(synth)),
            "anonymous_sampled": anon_n,
            "merged": int(len(merged)),
            "ogun_observations": int(len(ogun)),
        },
    }
    # Simple shift note: compare p50
    if report["ogun_X1_wait"].get("n", 0) > 0 and report["merged_wait"].get("n", 0) > 0:
        report["p50_delta_merged_minus_ogun"] = round(
            report["merged_wait"]["p50"] - report["ogun_X1_wait"]["p50"], 2
        )

    OGUN_REPORT.write_text(json.dumps(report, indent=2))
    print(f"Wrote {args.out} ({len(merged)} rows: {len(synth)} synth + {anon_n} anonymous)")
    print(f"Wrote {OGUN_REPORT}")
    print(json.dumps(report["row_counts"], indent=2))
    print("Ogun X1:", report["ogun_X1_wait"])
    print("Merged wait:", report["merged_wait"])


if __name__ == "__main__":
    main()
