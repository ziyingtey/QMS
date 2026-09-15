"""
Generate realistic synthetic seed data for QMS wait-time model training.

Simulates 6 months of Malaysian bank queue operations across multiple branches,
with realistic patterns:
  - Peak hours (9-11am, 2-4pm) have longer queues
  - Monday/Friday busier than mid-week
  - Different service types have different avg durations
  - Online vs walk-in have different wait patterns
  - More counters open during peak → but still longer waits due to demand
  - No-show effects on online bookings
  - Lunch hour dip (12-1pm)

Output: ml/data/wait_training.csv  (~20,000 rows)

Usage:
    python generate_seed_data.py
    python generate_seed_data.py --rows 50000
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "data" / "wait_training.csv"

# ── Branch configurations (based on real Malaysian bank branches) ──
BRANCHES = [
    {"BranchCode": 101033, "name": "Bandar Sri Permaisuri", "base_traffic": 1.0},
    {"BranchCode": 101045, "name": "Taman Midah", "base_traffic": 0.8},
    {"BranchCode": 101012, "name": "Bangsar", "base_traffic": 1.3},
    {"BranchCode": 101078, "name": "Cheras Selatan", "base_traffic": 0.9},
    {"BranchCode": 101056, "name": "Wangsa Maju", "base_traffic": 1.1},
]

# ── Service types with realistic avg durations ──
SERVICES = [
    {"code": "ACC_OPEN", "name": "Account Opening", "avg_min": 25, "weight": 0.08},
    {"code": "ATM_CDM", "name": "ATM / CDM Services", "avg_min": 8, "weight": 0.12},
    {"code": "INSURANCE", "name": "Insurance / Bancassurance", "avg_min": 20, "weight": 0.06},
    {"code": "BIZ_BANK", "name": "Business Banking", "avg_min": 18, "weight": 0.07},
    {"code": "CREDIT_CARD", "name": "Credit Card Services", "avg_min": 12, "weight": 0.10},
    {"code": "CUST_SVC", "name": "Queue / Customer Service", "avg_min": 10, "weight": 0.15},
    {"code": "DEPOSIT", "name": "Deposit Services", "avg_min": 6, "weight": 0.15},
    {"code": "FIXED_DEP", "name": "Fixed Deposit", "avg_min": 15, "weight": 0.05},
    {"code": "INVEST", "name": "Investment / Unit Trust", "avg_min": 22, "weight": 0.04},
    {"code": "LOAN", "name": "Loan / Financing", "avg_min": 30, "weight": 0.06},
    {"code": "ONLINE_SUP", "name": "Online Banking Support", "avg_min": 12, "weight": 0.04},
    {"code": "REMITTANCE", "name": "Remittance / Transfer", "avg_min": 10, "weight": 0.05},
    {"code": "WITHDRAW", "name": "Withdrawal Services", "avg_min": 5, "weight": 0.03},
]


def hour_traffic_multiplier(hour: int) -> float:
    """Traffic multiplier by hour of day (Malaysian bank pattern)."""
    pattern = {
        9: 1.4,   # Opening rush
        10: 1.6,  # Peak morning
        11: 1.3,  # Tapering
        12: 0.7,  # Lunch dip
        13: 0.8,  # Post-lunch
        14: 1.3,  # Afternoon pickup
        15: 1.5,  # Peak afternoon
        16: 1.2,  # Winding down
    }
    return pattern.get(hour, 0.5)


def day_traffic_multiplier(day: int) -> float:
    """Traffic multiplier by day of week (1=Mon, 7=Sun)."""
    pattern = {
        1: 1.4,   # Monday - busiest (post-weekend)
        2: 1.1,
        3: 1.0,   # Mid-week baseline
        4: 1.0,
        5: 1.3,   # Friday - pre-weekend
        6: 0.0,   # Saturday (closed or by-appointment)
        7: 0.0,   # Sunday (closed)
    }
    return pattern.get(day, 1.0)


def generate(n_rows: int = 20000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    svc_codes = [s["code"] for s in SERVICES]
    svc_weights = np.array([s["weight"] for s in SERVICES])
    svc_weights /= svc_weights.sum()
    svc_avg = {s["code"]: s["avg_min"] for s in SERVICES}

    rows = []
    generated = 0

    while generated < n_rows:
        # Pick branch
        br = rng.choice(BRANCHES)
        branch_code = br["BranchCode"]
        base_traffic = br["base_traffic"]

        # Pick day (weekday only)
        day_of_week = rng.choice([1, 2, 3, 4, 5], p=[0.25, 0.2, 0.18, 0.17, 0.2])
        day_mult = day_traffic_multiplier(day_of_week)
        if day_mult == 0:
            continue

        # Pick hour (operating hours 9-16)
        hour = rng.choice([9, 10, 11, 12, 13, 14, 15, 16],
                          p=[0.14, 0.16, 0.13, 0.08, 0.10, 0.13, 0.15, 0.11])
        hour_mult = hour_traffic_multiplier(hour)

        # Pick service
        svc_code = rng.choice(svc_codes, p=svc_weights)
        default_avg = svc_avg[svc_code]

        # Entry type: 70% walk-in, 30% online (typical Malaysian bank split)
        entry_type = 0 if rng.random() < 0.30 else 1  # 0=Online, 1=WalkIn
        checked_in = 1 if entry_type == 1 else (1 if rng.random() < 0.85 else 0)

        # Queue length — driven by traffic multipliers + randomness
        traffic = base_traffic * hour_mult * day_mult
        base_queue = rng.poisson(lam=max(0.5, traffic * 4))
        queue_length = max(0, base_queue + rng.integers(-1, 3))

        # Active counters — branches open more during peak
        total_counters = rng.choice([6, 7, 8], p=[0.3, 0.4, 0.3])
        if hour_mult >= 1.3:
            active_counters = min(total_counters, rng.integers(4, total_counters + 1))
        elif hour_mult >= 1.0:
            active_counters = min(total_counters, rng.integers(3, total_counters))
        else:
            active_counters = min(total_counters, rng.integers(2, 5))
        active_counters = max(1, active_counters)

        is_peak = 1 if (9 <= hour <= 11 or 14 <= hour <= 16) else 0

        # Enqueue sequence
        enqueue_seq = rng.integers(1, max(2, queue_length * 3 + 10))

        # ── Calculate realistic waiting time ──
        # Base: queue / counters * avg service duration
        if active_counters > 0 and queue_length > 0:
            base_wait = (queue_length * default_avg) / active_counters
        else:
            base_wait = 0.0

        # Add realistic variance
        # Peak hour effect: +10-25% longer due to complexity
        peak_effect = 1.0 + (0.15 * is_peak)

        # Service complexity variance: actual service time varies
        svc_variance = rng.normal(1.0, 0.25)
        svc_variance = max(0.5, min(1.8, svc_variance))

        # Online customers sometimes wait less (pre-scheduled)
        online_discount = 0.85 if entry_type == 0 and checked_in == 1 else 1.0

        # Monday morning effect
        monday_morning_effect = 1.15 if day_of_week == 1 and hour <= 10 else 1.0

        # Random noise (real world unpredictability)
        noise = rng.normal(0, max(1.0, base_wait * 0.15))

        wait_minutes = max(
            0,
            base_wait * peak_effect * svc_variance * online_discount * monday_morning_effect + noise,
        )

        # Cap extreme outliers (realistic: max ~90 min wait)
        wait_minutes = min(90, wait_minutes)

        # Very short waits for empty queues
        if queue_length == 0:
            wait_minutes = max(0, rng.normal(1.0, 0.5))

        rows.append({
            "BranchCode": branch_code,
            "ServiceCode": svc_code,
            "DefaultAvgServiceMinutes": default_avg,
            "EntryType": entry_type,
            "EnqueueSequence": enqueue_seq,
            "CheckedIn": checked_in,
            "QueueLength": queue_length,
            "ActiveCounters": active_counters,
            "HourOfDay": hour,
            "DayOfWeek": day_of_week,
            "IsPeakHour": is_peak,
            "WaitingMinutes": round(wait_minutes, 2),
        })
        generated += 1

    return pd.DataFrame(rows)


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic QMS seed data")
    parser.add_argument("--rows", type=int, default=20000, help="Number of rows to generate")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    df = generate(n_rows=args.rows, seed=args.seed)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)

    print(f"Generated {len(df)} rows → {args.output}")
    print(f"\nData summary:")
    print(f"  Branches: {df['BranchCode'].nunique()}")
    print(f"  Services: {df['ServiceCode'].nunique()}")
    print(f"  Wait time: mean={df['WaitingMinutes'].mean():.1f}m, "
          f"median={df['WaitingMinutes'].median():.1f}m, "
          f"max={df['WaitingMinutes'].max():.1f}m")
    print(f"  Online ratio: {(df['EntryType'] == 0).mean():.1%}")
    print(f"  Peak hour ratio: {(df['IsPeakHour'] == 1).mean():.1%}")

    print(f"\nWait by service type:")
    for svc, group in df.groupby("ServiceCode"):
        print(f"  {svc:12s}: avg={group['WaitingMinutes'].mean():5.1f}m  n={len(group)}")


if __name__ == "__main__":
    main()
