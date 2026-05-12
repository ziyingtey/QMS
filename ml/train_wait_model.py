"""
Offline training script for wait-time / service-duration baselines.
Reads historical SERVICE durations from SQL Server (ServiceSessionLogs or BDS_QMS_AUDIT export),
fits a simple model, and writes JSON metrics for the .NET API to consume (file or DB update).

This is a minimal, assignment-friendly skeleton — wire your real connection string and query.
"""

from __future__ import annotations

import json
from pathlib import Path


def main() -> None:
    # Placeholder: replace with pandas.read_sql from BDS_QMS_AUDIT / ServiceSessionLogs.
    sample_rows = [
        {"service_code": "ACC", "duration_min": 11},
        {"service_code": "ACC", "duration_min": 13},
        {"service_code": "LOAN", "duration_min": 22},
        {"service_code": "CASH", "duration_min": 7},
    ]

    by_service: dict[str, list[float]] = {}
    for row in sample_rows:
        by_service.setdefault(row["service_code"], []).append(float(row["duration_min"]))

    moving_avg = {k: sum(v) / len(v) for k, v in by_service.items()}
    out = Path(__file__).resolve().parent / "model_metrics.json"
    out.write_text(json.dumps({"moving_avg_minutes_by_service": moving_avg}, indent=2))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
