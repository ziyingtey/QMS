"""
A/B evaluation: Counter Simulation vs Formula wait-time predictions.

Reads from WAIT_PREDICTIONS table (joined with QUEUE_TICKETS for actual wait),
computes MAE (Mean Absolute Error) per prediction source.

Usage:
    python evaluate_ab.py --connection-string "Server=...;Database=QMS;..."
    python evaluate_ab.py --sqlite path/to/qms.db
"""

import argparse
import sys

try:
    import pandas as pd
except ImportError:
    print("pip install pandas pyodbc  (or pandas sqlite3 for SQLite)")
    sys.exit(1)


PREDICTION_SOURCES = {0: "ML", 1: "FormulaFallback", 2: "CounterSimulation"}

QUERY = """
SELECT
    wp.PredictionSource,
    wp.PredictedWaitMinutes,
    wp.PredictedAt,
    wp.ActualWaitingMinutes,
    wp.PredictionError
FROM WAIT_PREDICTIONS wp
WHERE wp.ActualWaitingMinutes IS NOT NULL
  AND wp.PredictedWaitMinutes >= 0
"""


def load_data(args) -> pd.DataFrame:
    if args.sqlite:
        import sqlite3

        conn = sqlite3.connect(args.sqlite)
        df = pd.read_sql_query(QUERY, conn)
        conn.close()
        return df
    elif args.connection_string:
        import pyodbc

        conn = pyodbc.connect(args.connection_string)
        df = pd.read_sql_query(QUERY, conn)
        conn.close()
        return df
    else:
        print("Provide --sqlite or --connection-string")
        sys.exit(1)


def evaluate(df: pd.DataFrame):
    df["Source"] = df["PredictionSource"].map(PREDICTION_SOURCES).fillna("Unknown")
    df["AbsError"] = (df["PredictedWaitMinutes"] - df["ActualWaitingMinutes"]).abs()

    print("=" * 60)
    print("Wait-Time Prediction A/B Evaluation")
    print("=" * 60)

    summary = (
        df.groupby("Source")
        .agg(
            Count=("AbsError", "count"),
            MAE=("AbsError", "mean"),
            MedianAE=("AbsError", "median"),
            P90_AE=("AbsError", lambda x: x.quantile(0.9)),
            MeanPredicted=("PredictedWaitMinutes", "mean"),
            MeanActual=("ActualWaitingMinutes", "mean"),
        )
        .round(2)
    )

    print(summary.to_string())
    print()

    if "CounterSimulation" in summary.index and "FormulaFallback" in summary.index:
        sim_mae = summary.loc["CounterSimulation", "MAE"]
        form_mae = summary.loc["FormulaFallback", "MAE"]
        diff = form_mae - sim_mae
        pct = (diff / form_mae * 100) if form_mae > 0 else 0
        winner = "CounterSimulation" if diff > 0 else "FormulaFallback"
        print(f"Simulation MAE: {sim_mae:.2f} min | Formula MAE: {form_mae:.2f} min")
        print(f"Difference: {abs(diff):.2f} min ({abs(pct):.1f}%) in favour of {winner}")
    else:
        print("Need both CounterSimulation and FormulaFallback predictions for A/B comparison.")


def main():
    parser = argparse.ArgumentParser(description="A/B evaluation of wait-time predictions")
    parser.add_argument("--sqlite", help="Path to SQLite database file")
    parser.add_argument("--connection-string", help="SQL Server connection string")
    args = parser.parse_args()

    df = load_data(args)
    if df.empty:
        print("No predictions with actual wait times found yet.")
        return

    evaluate(df)


if __name__ == "__main__":
    main()
