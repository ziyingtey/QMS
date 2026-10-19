"""
Wait-time regression pipeline for QMS (v2).

Lifecycle: Ingestion → Cleaning → Feature Engineering → Modeling → Evaluation

Predicts WaitingMinutes (QueueEligibleAt → CalledAt, i.e. until a counter calls the ticket)
using all 26 features aligned with MlHttpWaitTimeEstimator.BuildPayload / WaitTimeFeatureBuilder.

Data sources (first match wins):
  1. --csv path (synthetic from generate_seed_data.py or real export)
  2. SQL Server via --connection-string or env QMS_SQL_CONNECTION
  3. --external-dir to merge Hospital/College datasets (NaN for missing features)

Outputs:
  model_metrics.json   — MAE/RMSE, baseline comparison, feature importance
  wait_model.joblib    — sklearn pipeline (HistGradientBoosting + encoders)

Usage:
  python train_wait_model.py --csv data/wait_training.csv
  python train_wait_model.py --csv data/wait_training.csv --external-dir external_datasets
  python train_wait_model.py --connection-string "Server=localhost,1433;..."
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
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import cross_val_score, TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder

ROOT = Path(__file__).resolve().parent
DEFAULT_CSV = ROOT / "data" / "wait_training.csv"
EXTERNAL_DIR = ROOT / "external_datasets"
METRICS_PATH = ROOT / "model_metrics.json"
MODEL_PATH = ROOT / "wait_model.joblib"

# ── Feature definitions (matching BuildPayload in MlHttpWaitTimeEstimator.cs) ──

# Features that HistGBR handles natively (supports NaN)
FEATURE_NUMERIC = [
    # Queue state
    "QueueLength",
    "CrossLaneQueueLength",
    "PeopleAheadCallNext",
    "NowServing",
    # Capacity
    "ActiveCounters",
    "ListeningCounters",
    # Time
    "HourOfDay",
    "DayOfWeek",
    "IsPeakHour",
    # Service duration
    "DefaultAvgServiceMinutes",
    "RollingAvgServiceMinutes",
    # Entry
    "EnqueueSequence",
    "EntryType",
    "CheckedIn",
    # Slot features (NaN for walk-ins / external datasets — HistGBR handles natively)
    "SlotActive",
    "CallNextPriority",
    "SlotDurationMinutes",
    "EarlyCallMinutes",  # Branch.OnlineEarlyCallMinutes (NaN for external datasets)
    "MinutesUntilSlotEnd",
    "MinutesSinceSlotStart",
    "OnlineSlotsPerSlot",
    "OnlineBookedInSlot",
    "WalkInInSlot",
    # Identity (numeric)
    "BranchCode",
]

FEATURE_CATEGORICAL = ["ServiceCode", "TicketPrefix"]

ALL_FEATURES = FEATURE_NUMERIC + FEATURE_CATEGORICAL
TARGET = "WaitingMinutes"

# ── SQL export query (ML_TRAINING_DATA v3; every model feature is stored, nothing reconstructed) ──
# Only FeatureSchemaVersion = 'v3' rows: older 'v2' rows used Sun=0 DayOfWeek, snapshotted online
# tickets at SlotStart (even if never checked in), stored CrossLane == QueueLength and ended the
# target at ServingStartedAt. Target = CalledAt - QueueEligibleAt (same as the simulation).
EXPORT_QUERY = """
SELECT
    o.QueueEntryId AS TicketId,
    o.BranchId,
    o.BranchCode,
    o.ServiceTypeId,
    o.ServiceCode,
    o.TicketPrefix,
    o.DefaultAvgServiceMinutes,
    o.RollingAvgServiceMinutes,
    o.EntryType,
    o.EnqueueSequence,
    CAST(o.CheckedIn AS INT) AS CheckedIn,
    o.QueueLength,
    o.CrossLaneQueueLength,
    o.PeopleAhead AS PeopleAheadCallNext,
    o.NowServing,
    o.ActiveCounters,
    o.ServiceEligibleActiveCounters AS ListeningCounters,
    o.HourOfDay,
    o.DayOfWeek,
    CAST(o.IsPeakHour AS INT) AS IsPeakHour,
    o.SlotActive,
    o.CallNextPriority,
    o.SlotDurationMinutes,
    o.EarlyCallMinutes,
    o.MinutesUntilSlotEnd,
    o.MinutesSinceSlotStart,
    o.OnlineSlotsPerSlot,
    o.OnlineBookedInSlot,
    o.WalkInInSlot,
    o.ActualWaitingMinutes AS WaitingMinutes,
    o.SnapshotAt,
    o.CalledAt
FROM dbo.ML_TRAINING_DATA AS o
WHERE o.FeatureSchemaVersion = 'v3'
  AND o.ActualWaitingMinutes IS NOT NULL
  AND o.ActualWaitingMinutes >= 0
ORDER BY o.SnapshotAt
"""


# ─────────────────────────────────────────────────────────
# 1. DATA INGESTION
# ─────────────────────────────────────────────────────────

def load_from_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path)


def load_from_sql(connection_string: str) -> pd.DataFrame:
    import pyodbc
    conn = pyodbc.connect(connection_string)
    df = pd.read_sql(EXPORT_QUERY, conn)
    conn.close()
    return df


def load_external_datasets(ext_dir: Path, target_median: float | None = None) -> pd.DataFrame:
    """Load Hospital + College external datasets and map to QMS feature names.

    External datasets won't have slot features → NaN (HistGBR handles natively).

    Scale normalization: external datasets have different wait-time distributions
    (hospital = hundreds of minutes, bank = ~20 minutes). We scale external wait
    times so their median matches the primary data, preserving relative patterns
    while aligning distributions.
    """
    frames = []

    # Hospital Queue
    hospital_path = ext_dir / "hospital_queue" / "hospital_engineered.csv"
    if hospital_path.exists():
        h = pd.read_csv(hospital_path)
        h = h.rename(columns={
            "queue_length": "QueueLength",
            "people_ahead": "PeopleAheadCallNext",
            "now_serving": "NowServing",
            "active_counters": "ActiveCounters",
            "hour": "HourOfDay",
            "is_peak": "IsPeakHour",
            "priority": "CallNextPriority",
            "default_avg_service_min": "DefaultAvgServiceMinutes",
            "wait_min": TARGET,
        })
        h["CrossLaneQueueLength"] = h["QueueLength"]
        h["ListeningCounters"] = h["ActiveCounters"]
        h["BranchCode"] = 900001  # external marker
        h["ServiceCode"] = "HOSPITAL"
        h["TicketPrefix"] = "H"
        h["EntryType"] = 1
        h["CheckedIn"] = 1
        h["EnqueueSequence"] = range(1, len(h) + 1)
        h["DayOfWeek"] = 2  # approximate
        h["DataSource"] = "hospital"
        # Option 1: Filter by operational regime — drop 1/2-counter scenarios
        # (chronic system collapse, not realistic for bank with 3-6 counters)
        n_before = len(h)
        h = h[h["ActiveCounters"] >= 3].copy()
        frames.append(h)
        print(f"  Loaded Hospital Queue: {len(h)} rows (filtered from {n_before}, "
              f"kept counters≥3, median wait={h[TARGET].median():.1f} min)")

    # College Admissions
    college_path = ext_dir / "college_admissions" / "college_engineered.csv"
    if college_path.exists():
        c = pd.read_csv(college_path)
        c = c.rename(columns={
            "queue_length": "QueueLength",
            "people_ahead": "PeopleAheadCallNext",
            "now_serving": "NowServing",
            "active_counters": "ActiveCounters",
            "hour": "HourOfDay",
            "day_of_week": "DayOfWeek",
            "is_peak": "IsPeakHour",
            "avg_service_min": "DefaultAvgServiceMinutes",
            "wait_min": TARGET,
        })
        c["CrossLaneQueueLength"] = c["QueueLength"]
        c["ListeningCounters"] = c["ActiveCounters"]
        c["BranchCode"] = 900002
        c["ServiceCode"] = "COLLEGE"
        c["TicketPrefix"] = "C"
        c["EntryType"] = 1
        c["CheckedIn"] = 1
        c["EnqueueSequence"] = range(1, len(c) + 1)
        c["DataSource"] = "college"
        frames.append(c)
        print(f"  Loaded College Admissions: {len(c)} rows "
              f"(median wait={c[TARGET].median():.1f} min)")

    if not frames:
        return pd.DataFrame()

    combined = pd.concat(frames, ignore_index=True)

    # Scale normalization: align external wait-time distribution to primary data
    if target_median is not None and target_median > 0:
        for source_name in combined["DataSource"].unique():
            mask = combined["DataSource"] == source_name
            src_median = combined.loc[mask, TARGET].median()
            if src_median > 0:
                scale = target_median / src_median
                combined.loc[mask, TARGET] *= scale
                combined["DefaultAvgServiceMinutes"] = combined["DefaultAvgServiceMinutes"].astype(float)
                combined.loc[mask, "DefaultAvgServiceMinutes"] *= scale
                print(f"  Scaled {source_name}: median {src_median:.1f} → "
                      f"{combined.loc[mask, TARGET].median():.1f} min (×{scale:.2f})")

    return combined


# ─────────────────────────────────────────────────────────
# 2. DATA CLEANSING
# ─────────────────────────────────────────────────────────

def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """Clean raw data following queue-specific best practices."""
    n_start = len(df)

    # Drop abandoned tickets (WaitingMinutes is null = never served)
    df = df.dropna(subset=[TARGET])

    # Drop negative service times (system glitches); keep 0 = instant service (empty queue)
    df = df[df[TARGET] >= 0].copy()

    # Winsorize outliers at 99th percentile per source (different domains have different scales)
    if "DataSource" in df.columns:
        for source in df["DataSource"].unique():
            mask = df["DataSource"] == source
            p99 = df.loc[mask, TARGET].quantile(0.99)
            p01 = df.loc[mask, TARGET].quantile(0.01)
            df.loc[mask, TARGET] = df.loc[mask, TARGET].clip(lower=p01, upper=p99)
    else:
        p99 = df[TARGET].quantile(0.99)
        p01 = df[TARGET].quantile(0.01)
        df[TARGET] = df[TARGET].clip(lower=p01, upper=p99)

    # Deduplication
    df = df.drop_duplicates()

    n_end = len(df)
    print(f"  Cleaning: {n_start} → {n_end} rows "
          f"(dropped {n_start - n_end}, {(n_start - n_end) / max(1, n_start):.1%})")
    print(f"  Target range: [{df[TARGET].min():.1f}, {df[TARGET].max():.1f}] min "
          f"(mean={df[TARGET].mean():.1f}, median={df[TARGET].median():.1f})")

    return df


# ─────────────────────────────────────────────────────────
# 3. FEATURE ENGINEERING
# ─────────────────────────────────────────────────────────

def ensure_features(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure all expected columns exist with correct types.

    Missing slot features stay as NaN — HistGBR handles this natively.
    This is the recommended approach for features that genuinely don't exist
    in certain data sources (external datasets, walk-in tickets).
    """
    for col in FEATURE_NUMERIC:
        if col not in df.columns:
            df[col] = np.nan  # HistGBR native NaN handling

    for col in FEATURE_CATEGORICAL:
        if col not in df.columns:
            df[col] = "UNKNOWN"

    # Ensure numeric types
    for col in FEATURE_NUMERIC:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


# ─────────────────────────────────────────────────────────
# 4. MODEL TRAINING
# ─────────────────────────────────────────────────────────

def build_model() -> Pipeline:
    """HistGradientBoosting pipeline matching production config.

    HistGBR natively supports NaN — no imputation needed for numeric features.
    Categorical features use OrdinalEncoder (HistGBR has native categorical support).
    """
    preprocessor = ColumnTransformer(
        transformers=[
            # HistGBR handles NaN natively — pass numeric through as-is
            ("num", "passthrough", FEATURE_NUMERIC),
            # Categorical: ordinal encode for HistGBR native categorical support
            ("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1),
             FEATURE_CATEGORICAL),
        ]
    )
    regressor = HistGradientBoostingRegressor(
        loss="quantile",       # asymmetric: under-prediction hurts UX more than over-prediction
        quantile=0.75,         # predict p75 — 75% of customers served within this estimate
        max_depth=6,
        learning_rate=0.08,
        max_iter=300,
        min_samples_leaf=8,
        categorical_features="from_dtype",
        random_state=42,
    )
    return Pipeline([
        ("preprocess", preprocessor),
        ("model", regressor),
    ])


def formula_baseline(df: pd.DataFrame) -> pd.Series:
    """Production formula: (PeopleAhead + NowServing) × EffectiveAvg / ListeningCounters.

    Matches WaitTimeEstimator.cs in production.
    """
    ahead = df.get("PeopleAheadCallNext", df.get("QueueLength", pd.Series(0, index=df.index))).fillna(0)
    now_serving = df.get("NowServing", pd.Series(0, index=df.index)).fillna(0)
    avg = df["DefaultAvgServiceMinutes"].fillna(10)
    counters = df.get("ListeningCounters", df.get("ActiveCounters", pd.Series(1, index=df.index))).fillna(1).clip(lower=1)
    return ((ahead + now_serving) * avg / counters).clip(lower=0)


def temporal_split(df: pd.DataFrame, test_ratio: float = 0.2) -> tuple:
    """Time-based split per data source, then combine.

    Each source is split temporally (later rows → test) to prevent data leakage.
    This handles mixed sources (synthetic + external) correctly.
    """
    sort_col = "SnapshotAt" if "SnapshotAt" in df.columns else "EnqueueSequence"

    if "DataSource" not in df.columns:
        df["DataSource"] = "primary"

    train_parts = []
    test_parts = []

    for source, group in df.groupby("DataSource"):
        group = group.sort_values(sort_col)
        split_idx = int(len(group) * (1 - test_ratio))
        train_parts.append(group.iloc[:split_idx])
        test_parts.append(group.iloc[split_idx:])

    train = pd.concat(train_parts, ignore_index=True)
    test = pd.concat(test_parts, ignore_index=True)

    print(f"  Temporal split (per-source): train={len(train)}, test={len(test)} "
          f"({test_ratio:.0%} test)")
    for source in df["DataSource"].unique():
        n_train = (train.get("DataSource") == source).sum() if "DataSource" in train.columns else 0
        n_test = (test.get("DataSource") == source).sum() if "DataSource" in test.columns else 0
        print(f"    {source}: train={n_train}, test={n_test}")

    return train, test


def evaluate(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    mae = mean_absolute_error(y_true, y_pred)
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = r2_score(y_true, y_pred)
    return {
        "mae_minutes": round(mae, 3),
        "rmse_minutes": round(rmse, 3),
        "r2": round(r2, 4),
    }


# ─────────────────────────────────────────────────────────
# 5. MAIN PIPELINE
# ─────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Train QMS wait-time model (v2)")
    parser.add_argument("--csv", type=Path, default=None)
    parser.add_argument("--connection-string",
                        default=os.environ.get("QMS_SQL_CONNECTION", ""))
    parser.add_argument("--external-dir", type=Path, default=EXTERNAL_DIR,
                        help="Directory with Hospital/College datasets to merge")
    parser.add_argument("--no-external", action="store_true",
                        help="Skip merging external datasets")
    parser.add_argument("--test-size", type=float, default=0.2)
    args = parser.parse_args()

    # ── Stage 1: Ingestion ──
    print("=" * 60)
    print("Stage 1: Data Ingestion")
    print("=" * 60)

    if args.csv and args.csv.exists():
        df = load_from_csv(args.csv)
        df["DataSource"] = "primary"
        source = str(args.csv)
    elif args.connection_string:
        df = load_from_sql(args.connection_string)
        df["DataSource"] = "sql"
        source = "sql"
    elif DEFAULT_CSV.exists():
        df = load_from_csv(DEFAULT_CSV)
        df["DataSource"] = "primary"
        source = str(DEFAULT_CSV)
    else:
        print("ERROR: No data source found. Run generate_seed_data.py first.")
        return

    print(f"  Primary data: {len(df)} rows from {source}")

    # Merge external datasets for richer training (scale-normalized, capped at 50% of primary)
    if not args.no_external and args.external_dir.exists():
        primary_median = df[TARGET].dropna().median()
        ext_df = load_external_datasets(args.external_dir, target_median=primary_median)
        if len(ext_df) > 0:
            # Cap external data so it doesn't dominate primary data
            max_external = int(len(df) * 0.5)
            if len(ext_df) > max_external:
                ext_df = ext_df.sample(n=max_external, random_state=42)
                print(f"  Downsampled external to {max_external} rows (50% of primary)")
            df = pd.concat([df, ext_df], ignore_index=True)
            print(f"  Combined total: {len(df)} rows")

    # ── Stage 2: Cleaning ──
    print(f"\n{'=' * 60}")
    print("Stage 2: Data Cleansing")
    print("=" * 60)
    df = clean_data(df)

    # ── Stage 3: Feature Engineering ──
    print(f"\n{'=' * 60}")
    print("Stage 3: Feature Engineering")
    print("=" * 60)
    df = ensure_features(df)

    # Report NaN coverage (expected for slot features on walk-ins / external data)
    nan_counts = df[FEATURE_NUMERIC].isna().sum()
    nan_features = nan_counts[nan_counts > 0]
    if len(nan_features) > 0:
        print(f"  Features with NaN (handled natively by HistGBR):")
        for feat, count in nan_features.items():
            print(f"    {feat}: {count} ({count / len(df):.1%})")

    print(f"  Total features: {len(ALL_FEATURES)} "
          f"({len(FEATURE_NUMERIC)} numeric + {len(FEATURE_CATEGORICAL)} categorical)")

    # ── Stage 4: Model Training ──
    print(f"\n{'=' * 60}")
    print("Stage 4: Model Training")
    print("=" * 60)

    X = df[ALL_FEATURES].copy()
    y = df[TARGET].astype(float)

    # Temporal split (not random — prevents data leakage)
    train_df, test_df = temporal_split(df, test_ratio=args.test_size)
    X_train = train_df[ALL_FEATURES]
    y_train = train_df[TARGET].astype(float)
    X_test = test_df[ALL_FEATURES]
    y_test = test_df[TARGET].astype(float)

    pipeline = build_model()

    # Option 3: Sample weighting — prioritize primary data, discount external
    train_weights = train_df["DataSource"].map(
        lambda s: 1.0 if s == "primary" or s == "sql" else 0.1
    ).values
    pipeline.fit(X_train, y_train, model__sample_weight=train_weights)
    print(f"  Sample weights: primary=1.0, external=0.1")

    # Cross-validation with TimeSeriesSplit (respects temporal order)
    # Sort by DataSource → BranchCode → EnqueueSequence so TimeSeriesSplit
    # respects temporal order within each branch. EnqueueSequence alone is
    # independently numbered per branch/source — mixing them destroys ordering.
    cv_sort_cols = ["DataSource", "BranchCode", "EnqueueSequence"]
    cv_sort_cols = [c for c in cv_sort_cols if c in df.columns]
    if not cv_sort_cols:
        cv_sort_cols = ["EnqueueSequence"]
    df_sorted = df.sort_values(cv_sort_cols)
    X_cv = df_sorted[ALL_FEATURES].copy()
    y_cv = df_sorted[TARGET].astype(float)
    tscv = TimeSeriesSplit(n_splits=min(5, max(2, len(df) // 500)))
    cv_mae = -cross_val_score(
        pipeline, X_cv, y_cv, cv=tscv, scoring="neg_mean_absolute_error"
    )
    cv_mae_mean = float(np.mean(cv_mae))

    # ── Stage 5: Evaluation ──
    print(f"\n{'=' * 60}")
    print("Stage 5: Evaluation")
    print("=" * 60)

    # ML predictions
    ml_pred = np.maximum(0, pipeline.predict(X_test))
    ml_metrics = evaluate(y_test.values, ml_pred)

    # Formula baseline
    fm_pred = formula_baseline(test_df).values
    fm_metrics = evaluate(y_test.values, fm_pred)

    improvement = fm_metrics["mae_minutes"] / ml_metrics["mae_minutes"] if ml_metrics["mae_minutes"] > 0 else float("inf")

    print(f"  ML model:        MAE={ml_metrics['mae_minutes']:.2f} min  "
          f"RMSE={ml_metrics['rmse_minutes']:.2f}  R²={ml_metrics['r2']:.4f}")
    print(f"  Formula baseline: MAE={fm_metrics['mae_minutes']:.2f} min  "
          f"RMSE={fm_metrics['rmse_minutes']:.2f}  R²={fm_metrics['r2']:.4f}")
    print(f"  CV MAE (mean):   {cv_mae_mean:.2f} min")
    print(f"  ML is {improvement:.1f}x more accurate than formula")

    # Feature importance
    feature_importance = {}
    try:
        from sklearn.inspection import permutation_importance
        perm = permutation_importance(
            pipeline, X_test, y_test, n_repeats=5, random_state=42, n_jobs=-1
        )
        for name, imp in sorted(zip(X.columns, perm.importances_mean),
                                key=lambda x: -x[1]):
            feature_importance[str(name)] = round(float(imp), 4)

        print(f"\n  Top 10 features (permutation importance):")
        for i, (name, imp) in enumerate(feature_importance.items()):
            if i >= 10:
                break
            print(f"    {name:<30} {imp:.4f}")
    except Exception as e:
        print(f"  Feature importance skipped: {e}")

    # ── Save outputs ──
    metrics = {
        "data_source": source,
        "row_count": len(df),
        "data_sources_breakdown": df["DataSource"].value_counts().to_dict() if "DataSource" in df.columns else {},
        "target": TARGET,
        "features_numeric": FEATURE_NUMERIC,
        "features_categorical": FEATURE_CATEGORICAL,
        "feature_count": len(ALL_FEATURES),
        "split_method": "temporal (TimeSeriesSplit)",
        "baseline_formula": "(PeopleAhead + NowServing) × EffectiveAvg / ListeningCounters",
        "test_ml": ml_metrics,
        "test_formula_baseline": fm_metrics,
        "ml_vs_formula_improvement": f"{improvement:.1f}x",
        "cv_mae_mean": round(cv_mae_mean, 3),
        "feature_importance": feature_importance,
        "model_config": {
            "algorithm": "HistGradientBoostingRegressor",
            "loss": "quantile (p75)",
            "quantile": 0.75,
            "max_depth": 6,
            "learning_rate": 0.08,
            "max_iter": 300,
            "min_samples_leaf": 8,
            "nan_handling": "native (no imputation needed)",
        },
    }

    joblib.dump(
        {
            "pipeline": pipeline,
            "feature_numeric": FEATURE_NUMERIC,
            "feature_categorical": FEATURE_CATEGORICAL,
            "target": TARGET,
            "version": "v2",
        },
        MODEL_PATH,
    )
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))

    print(f"\nSaved: {MODEL_PATH}")
    print(f"Saved: {METRICS_PATH}")


if __name__ == "__main__":
    main()
