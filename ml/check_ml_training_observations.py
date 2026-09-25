"""Inspect ML_TRAINING_DATA (MlTrainingObservation) readiness for real-ticket retrain.

Reports:
  - total / labeled (ActualWaitingMinutes filled) / unlabeled
  - wait distribution for labeled rows
  - outlier counts (too long / non-positive)
  - rough feature health (PeopleAhead all-zero?, ActiveCounters)
  - by BranchCode / ServiceCode

Usage:
  cd ml
  export QMS_SQL_CONNECTION='Server=localhost,1433;Database=QMS;User Id=sa;Password=...;TrustServerCertificate=True'
  .venv/bin/python check_ml_training_observations.py
  .venv/bin/python check_ml_training_observations.py --json-out training_observation_report.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_JSON = ROOT / "training_observation_report.json"


def load_connection_string(cli: str | None) -> str:
    if cli:
        return cli
    env = os.environ.get("QMS_SQL_CONNECTION", "").strip()
    if env:
        return env
    # Fall back to API Development appsettings (local docker SQL)
    settings = ROOT.parent / "src" / "QMS.Api" / "appsettings.Development.json"
    if settings.exists():
        data = json.loads(settings.read_text())
        cs = (data.get("ConnectionStrings") or {}).get("Default") or ""
        if cs:
            return cs
    raise SystemExit(
        "No connection string. Set QMS_SQL_CONNECTION or pass --connection-string."
    )


def ado_to_odbc(ado: str) -> str:
    """Best-effort map ADO.NET-style string → ODBC Driver 18 for SQL Server."""
    if "Driver=" in ado or "DRIVER=" in ado:
        return ado
    parts = {}
    for piece in ado.split(";"):
        piece = piece.strip()
        if not piece or "=" not in piece:
            continue
        k, v = piece.split("=", 1)
        parts[k.strip().lower()] = v.strip()
    server = parts.get("server", "localhost,1433")
    database = parts.get("database", "QMS")
    uid = parts.get("user id") or parts.get("uid") or "sa"
    pwd = parts.get("password") or parts.get("pwd") or ""
    trust = parts.get("trustservercertificate", "true")
    return (
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={server};DATABASE={database};UID={uid};PWD={pwd};"
        f"TrustServerCertificate={trust};"
    )


def pct(series) -> dict:
    import numpy as np

    arr = np.asarray(list(series), dtype=float)
    if len(arr) == 0:
        return {"n": 0}
    return {
        "n": int(len(arr)),
        "mean": round(float(arr.mean()), 2),
        "p50": round(float(np.percentile(arr, 50)), 2),
        "p90": round(float(np.percentile(arr, 90)), 2),
        "p95": round(float(np.percentile(arr, 95)), 2),
        "max": round(float(arr.max()), 2),
        "min": round(float(arr.min()), 2),
    }


def main() -> None:
    import pandas as pd

    ap = argparse.ArgumentParser(description="Check MlTrainingObservation / ML_TRAINING_DATA")
    ap.add_argument("--connection-string", default=None)
    ap.add_argument("--json-out", type=Path, default=DEFAULT_JSON)
    ap.add_argument("--long-wait-minutes", type=float, default=180.0)
    args = ap.parse_args()

    ado = load_connection_string(args.connection_string)
    odbc = ado_to_odbc(ado)

    query = """
    SELECT
        Id,
        QueueEntryId,
        BranchId,
        ServiceTypeId,
        SnapshotAt,
        QueueEligibleAt,
        ServingStartedAt,
        ActualWaitingMinutes,
        EntryType,
        CheckedIn,
        QueueLength,
        PeopleAhead,
        ActiveCounters,
        ServiceEligibleActiveCounters,
        NowServing,
        RollingAvgServiceMinutes,
        DefaultAvgServiceMinutes,
        HourOfDay,
        DayOfWeek,
        IsPeakHour,
        BranchCode,
        ServiceCode,
        FeatureSchemaVersion
    FROM dbo.ML_TRAINING_DATA
    """

    def parse_ado(ado_cs: str) -> dict:
        parts = {}
        for piece in ado_cs.split(";"):
            piece = piece.strip()
            if not piece or "=" not in piece:
                continue
            k, v = piece.split("=", 1)
            parts[k.strip().lower()] = v.strip()
        server = parts.get("server", "localhost,1433")
        host, _, port = server.partition(",")
        return {
            "host": host or "localhost",
            "port": int(port or "1433"),
            "database": parts.get("database", "QMS"),
            "user": parts.get("user id") or parts.get("uid") or "sa",
            "password": parts.get("password") or parts.get("pwd") or "",
        }

    df = None
    errors: list[str] = []
    # 1) pymssql — no ODBC driver needed (good for local Docker SQL)
    try:
        import pymssql

        cfg = parse_ado(ado)
        conn = pymssql.connect(
            server=cfg["host"],
            port=cfg["port"],
            user=cfg["user"],
            password=cfg["password"],
            database=cfg["database"],
            login_timeout=8,
        )
        df = pd.read_sql(query, conn)
        conn.close()
    except Exception as exc:  # noqa: BLE001
        errors.append(f"pymssql: {exc}")

    # 2) pyodbc fallback when Driver 18 is installed
    if df is None:
        try:
            import pyodbc

            conn = pyodbc.connect(odbc, timeout=8)
            df = pd.read_sql(query, conn)
            conn.close()
        except Exception as exc:  # noqa: BLE001
            errors.append(f"pyodbc: {exc}")

    if df is None:
        cfg = parse_ado(ado)
        report = {
            "ok": False,
            "error": " | ".join(errors) if errors else "unknown",
            "hint": "Start local SQL (e.g. QMS docker SQL on localhost,1433), ensure API has run EnsureCreated so ML_TRAINING_DATA exists, then re-run this script.",
            "connection_server": f"{cfg['host']},{cfg['port']}",
            "database": cfg["database"],
        }
        args.json_out.write_text(json.dumps(report, indent=2))
        print(json.dumps(report, indent=2))
        raise SystemExit(1)

    total = len(df)
    labeled = df["ActualWaitingMinutes"].notna()
    n_labeled = int(labeled.sum())
    n_open = total - n_labeled

    waits = df.loc[labeled, "ActualWaitingMinutes"].astype(float)
    outliers_long = int((waits > args.long_wait_minutes).sum()) if n_labeled else 0
    outliers_nonpos = int((waits <= 0).sum()) if n_labeled else 0
    trainable = int(((waits > 0) & (waits <= args.long_wait_minutes)).sum()) if n_labeled else 0

    people_ahead_all_zero = bool((df["PeopleAhead"] == 0).all()) if total else True
    active_all_zero = bool((df["ActiveCounters"] == 0).all()) if total else True

    by_service = (
        df.groupby(df["ServiceCode"].fillna("?"))
        .agg(total=("Id", "count"), labeled=("ActualWaitingMinutes", lambda s: int(s.notna().sum())))
        .reset_index()
        .sort_values("total", ascending=False)
        .head(20)
        .to_dict(orient="records")
        if total
        else []
    )
    by_branch = (
        df.groupby("BranchCode")
        .agg(total=("Id", "count"), labeled=("ActualWaitingMinutes", lambda s: int(s.notna().sum())))
        .reset_index()
        .sort_values("total", ascending=False)
        .head(20)
        .to_dict(orient="records")
        if total
        else []
    )

    gaps: list[str] = []
    if total == 0:
        gaps.append("No rows in ML_TRAINING_DATA — is MlSnapshotHostedService running with waiting tickets?")
    if n_labeled == 0 and total > 0:
        gaps.append("Snapshots exist but ActualWaitingMinutes all NULL — tickets not reaching Serving yet, or StartService target fill failed.")
    if people_ahead_all_zero and total > 0:
        gaps.append("PeopleAhead is 0 on every row — feature builder / snapshot timing may be wrong for training.")
    if active_all_zero and total > 0:
        gaps.append("ActiveCounters is 0 on every row — counter snapshot at eligibility may be empty.")
    if trainable < 50:
        gaps.append(f"Only {trainable} trainable labeled rows (0 < wait ≤ {args.long_wait_minutes}) — need more completed tickets before retrain.")
    else:
        gaps.append(f"{trainable} trainable rows — enough to try a first real-data retrain (still prefer 2–4 weeks).")

    report = {
        "ok": True,
        "table": "dbo.ML_TRAINING_DATA",
        "counts": {
            "total": total,
            "labeled_actual_waiting": n_labeled,
            "unlabeled_still_open_or_unfilled": n_open,
            "trainable_after_outlier_filter": trainable,
            "outliers_wait_gt_long": outliers_long,
            "outliers_wait_le_0": outliers_nonpos,
        },
        "labeled_wait_minutes": pct(waits) if n_labeled else {"n": 0},
        "feature_health": {
            "people_ahead_all_zero": people_ahead_all_zero,
            "active_counters_all_zero": active_all_zero,
            "rolling_avg_non_null_rate": round(float(df["RollingAvgServiceMinutes"].notna().mean()), 3)
            if total
            else 0,
            "schema_versions": df["FeatureSchemaVersion"].value_counts().to_dict() if total else {},
        },
        "by_service_code_top": by_service,
        "by_branch_code_top": by_branch,
        "gaps_and_next_steps": gaps,
    }

    args.json_out.write_text(json.dumps(report, indent=2, default=str))
    print(json.dumps(report, indent=2, default=str))
    print(f"\nWrote {args.json_out}")


if __name__ == "__main__":
    main()
