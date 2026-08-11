"""
Wait-time regression pipeline for QGo / IH-QMS.

Predicts WaitingMinutes (enqueue → start service) from queue context features.
Compares ML model against the production formula in WaitTimeEstimator:
    ETA ≈ (peopleAhead × avgServiceMinutes) / activeCounters

Data sources (first match wins):
  1. --csv path
  2. SQL Server via --connection-string or env QMS_SQL_CONNECTION
  3. Synthetic demo rows (pipeline smoke test only)

Outputs:
  model_metrics.json   — MAE/RMSE, baseline comparison, feature importance
  wait_model.joblib    — sklearn pipeline (HistGradientBoosting + encoders)

Usage:
  cd ml && pip install -r requirements.txt
  python train_wait_model.py --connection-string "Server=localhost,1433;..."
  python train_wait_model.py --csv data/wait_training.csv
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parent
DEFAULT_CSV = ROOT / "data" / "wait_training.csv"
METRICS_PATH = ROOT / "model_metrics.json"
MODEL_PATH = ROOT / "wait_model.joblib"

EXPORT_QUERY = """
SELECT
    q.Id AS TicketId,
    q.BranchId,
    b.BranchCode,
    q.ServiceTypeId,
    s.Code AS ServiceCode,
    s.DefaultAvgServiceMinutes,
    q.EntryType,
    q.EnqueueSequence,
    q.CheckedIn,
    (
        SELECT COUNT(*)
        FROM dbo.QUEUE_TICKETS AS q2
        WHERE q2.BranchId = q.BranchId
          AND q2.ServiceTypeId = q.ServiceTypeId
          AND q2.Id <> q.Id
          AND q2.CreatedAt < q.CreatedAt
          AND (q2.ServingStartedAt IS NULL OR q2.ServingStartedAt > q.CreatedAt)
    ) AS QueueLength,
    (
        SELECT COUNT(*)
        FROM dbo.COUNTERS AS co
        INNER JOIN dbo.COUNTER_ALLOWED_SERVICES AS cas ON cas.CounterId = co.Id
        WHERE co.BranchId = q.BranchId
          AND cas.ServiceTypeId = q.ServiceTypeId
          AND co.Mode = 0
    ) AS ActiveCounters,
    DATEPART(hour, DATEADD(minute, b.ServiceZoneOffsetMinutes, q.CreatedAt)) AS HourOfDay,
    DATEPART(weekday, DATEADD(minute, b.ServiceZoneOffsetMinutes, q.CreatedAt)) AS DayOfWeek,
    CASE
        WHEN DATEPART(hour, DATEADD(minute, b.ServiceZoneOffsetMinutes, q.CreatedAt)) BETWEEN 9 AND 11
          OR DATEPART(hour, DATEADD(minute, b.ServiceZoneOffsetMinutes, q.CreatedAt)) BETWEEN 14 AND 16
        THEN 1 ELSE 0
    END AS IsPeakHour,
    DATEDIFF(second, q.CreatedAt, q.ServingStartedAt) / 60.0 AS WaitingMinutes
FROM dbo.QUEUE_TICKETS AS q
INNER JOIN dbo.BRANCHES AS b ON b.Id = q.BranchId
INNER JOIN dbo.SERVICES AS s ON s.Id = q.ServiceTypeId
WHERE q.State = 3
  AND q.ServingStartedAt IS NOT NULL
  AND q.ServingStartedAt > q.CreatedAt
"""

FEATURE_NUMERIC = [
    "QueueLength",
    "ActiveCounters",
    "HourOfDay",
    "DayOfWeek",
    "IsPeakHour",
    "DefaultAvgServiceMinutes",
    "EnqueueSequence",
    "EntryType",
    "CheckedIn",
    "BranchCode",
]
FEATURE_CATEGORICAL = ["ServiceCode"]
TARGET = "WaitingMinutes"

NUMERIC_PIPELINE = Pipeline(
    steps=[
        ("imputer", SimpleImputer(strategy="median")),
    ]
)

CATEGORICAL_PIPELINE = Pipeline(
    steps=[
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ]
)


def load_from_sql(connection_string: str) -> pd.DataFrame:
    import pyodbc

    conn = pyodbc.connect(connection_string)
    df = pd.read_sql(EXPORT_QUERY, conn)
    conn.close()
    return df


def synthetic_demo_rows() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    n = 400
    queue = rng.integers(0, 12, size=n)
    counters = rng.integers(1, 5, size=n)
    avg_svc = rng.choice([8, 10, 15, 20, 25], size=n)
    hour = rng.integers(9, 17, size=n)
    service = rng.choice(["DEPOSIT", "WITHDRAW", "LOAN", "ACC_OPEN"], size=n)
    noise = rng.normal(0, 3, size=n)
    wait = np.maximum(0, (queue * avg_svc / counters) + noise)
    return pd.DataFrame(
        {
            "TicketId": [f"syn-{i}" for i in range(n)],
            "BranchId": ["00000000-0000-0000-0000-000000000001"] * n,
            "BranchCode": [101001] * n,
            "ServiceTypeId": ["00000000-0000-0000-0000-000000000002"] * n,
            "ServiceCode": service,
            "DefaultAvgServiceMinutes": avg_svc,
            "EntryType": rng.integers(0, 2, size=n),
            "EnqueueSequence": rng.integers(1, 50, size=n),
            "CheckedIn": rng.integers(0, 2, size=n),
            "QueueLength": queue,
            "ActiveCounters": counters,
            "HourOfDay": hour,
            "DayOfWeek": rng.integers(1, 6, size=n),
            "IsPeakHour": ((hour >= 9) & (hour <= 11) | (hour >= 14) & (hour <= 16)).astype(int),
            "WaitingMinutes": wait,
        }
    )


def formula_baseline_minutes(row: pd.Series) -> float:
    """Same idea as QMS.Application.Waiting.WaitTimeEstimator."""
    ahead = float(row.get("QueueLength", 0) or 0)
    avg = float(row.get("DefaultAvgServiceMinutes", 10) or 10)
    counters = int(row.get("ActiveCounters", 0) or 0)
    if counters <= 0:
        return float("inf")
    if ahead <= 0:
        return 0.0
    return ahead * avg / counters


def build_model() -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", NUMERIC_PIPELINE, FEATURE_NUMERIC),
            ("cat", CATEGORICAL_PIPELINE, FEATURE_CATEGORICAL),
        ]
    )
    regressor = HistGradientBoostingRegressor(
        max_depth=6,
        learning_rate=0.08,
        max_iter=300,
        min_samples_leaf=8,
        random_state=42,
    )
    return Pipeline(
        steps=[
            ("preprocess", preprocessor),
            ("model", regressor),
        ]
    )


def evaluate(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    mae = mean_absolute_error(y_true, y_pred)
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    return {"mae_minutes": round(mae, 3), "rmse_minutes": round(rmse, 3)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Train wait-time regression model for QGo")
    parser.add_argument("--csv", type=Path, default=None, help="CSV from export_wait_training_data.sql")
    parser.add_argument(
        "--connection-string",
        default=os.environ.get("QMS_SQL_CONNECTION", ""),
        help="ADO-style SQL connection string (or set QMS_SQL_CONNECTION)",
    )
    parser.add_argument("--test-size", type=float, default=0.2)
    args = parser.parse_args()

    if args.csv and args.csv.exists():
        df = pd.read_csv(args.csv)
        source = str(args.csv)
    elif args.connection_string:
        df = load_from_sql(args.connection_string)
        source = "sql"
    elif DEFAULT_CSV.exists():
        df = pd.read_csv(DEFAULT_CSV)
        source = str(DEFAULT_CSV)
    else:
        print("No CSV / SQL data found — using synthetic demo rows (FYP: replace with real exports).")
        df = synthetic_demo_rows()
        source = "synthetic"

    df = df.dropna(subset=[TARGET])
    df = df[df[TARGET] >= 0]
    if len(df) < 30:
        print(f"Warning: only {len(df)} rows — model will be weak; collect more Completed QUEUE_TICKETS.")

    for col in FEATURE_NUMERIC:
        if col not in df.columns:
            df[col] = 0
    if "ServiceCode" not in df.columns:
        df["ServiceCode"] = "UNKNOWN"

    y = df[TARGET].astype(float)
    baseline_pred = df.apply(formula_baseline_minutes, axis=1)
    valid_baseline = baseline_pred.replace([np.inf], np.nan)
    baseline_mask = valid_baseline.notna()

    X = df[FEATURE_NUMERIC + FEATURE_CATEGORICAL]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=42
    )

    pipeline = build_model()
    pipeline.fit(X_train, y_train)

    ml_pred_test = pipeline.predict(X_test)
    ml_metrics = evaluate(y_test, ml_pred_test)

    baseline_test = baseline_pred.loc[y_test.index]
    baseline_metrics = evaluate(y_test[baseline_mask.loc[y_test.index]], baseline_test[baseline_mask.loc[y_test.index]])

    cv_mae = -cross_val_score(
        pipeline, X, y, cv=min(5, len(df) // 10 or 2), scoring="neg_mean_absolute_error"
    )
    cv_mae_mean = float(np.mean(cv_mae))

    # Feature importance (tree on transformed features — approximate via permutation on numeric subset)
    feature_importance: dict[str, float] = {
        "QueueLength": 0.0,
        "ActiveCounters": 0.0,
        "HourOfDay": 0.0,
        "DefaultAvgServiceMinutes": 0.0,
        "ServiceCode": 0.0,
    }
    try:
        from sklearn.inspection import permutation_importance

        perm = permutation_importance(
            pipeline, X_test, y_test, n_repeats=5, random_state=42, n_jobs=1
        )
        for name, imp in zip(X.columns, perm.importances_mean):
            key = name if name in feature_importance else name
            feature_importance[str(key)] = round(float(imp), 4)
    except Exception:
        pass

    metrics = {
        "data_source": source,
        "row_count": len(df),
        "target": TARGET,
        "features_numeric": FEATURE_NUMERIC,
        "features_categorical": FEATURE_CATEGORICAL,
        "baseline_formula": "QueueLength * DefaultAvgServiceMinutes / ActiveCounters",
        "test_ml": ml_metrics,
        "test_baseline_formula": baseline_metrics,
        "cv_mae_mean": round(cv_mae_mean, 3),
        "feature_importance_permutation": feature_importance,
        "notes": [
            "ActiveCounters in export SQL is a lane snapshot proxy, not full historical counter state.",
            "API does not load wait_model.joblib yet — integrate in WaitTimeEstimator for production ETA.",
        ],
    }

    joblib.dump(
        {
            "pipeline": pipeline,
            "feature_numeric": FEATURE_NUMERIC,
            "feature_categorical": FEATURE_CATEGORICAL,
            "target": TARGET,
        },
        MODEL_PATH,
    )
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))

    print(f"Trained on {len(df)} rows from {source}")
    print(f"ML test MAE: {ml_metrics['mae_minutes']} min | Baseline formula MAE: {baseline_metrics['mae_minutes']} min")
    print(f"CV MAE (mean): {cv_mae_mean:.3f} min")
    print(f"Wrote {MODEL_PATH}")
    print(f"Wrote {METRICS_PATH}")


if __name__ == "__main__":
    main()
