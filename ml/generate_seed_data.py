"""
Generate Tier-B synthetic seed data for QMS wait-time model training.

Simulates Malaysian bank branches with:
  - Per-service letter queues (A/B/…) and daily sequence
  - Online vs walk-in; online P0 when checked-in and slot active
  - Multi-counter work profiles listening to several queues
  - WaitingMinutes ≈ Call Next drain (longest-wait among queue heads)

Output: ml/data/wait_training.csv

Usage:
    python generate_seed_data.py
    python generate_seed_data.py --rows 40000
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "data" / "wait_training.csv"

BRANCHES = [
    {"BranchCode": 101033, "name": "Bandar Sri Permaisuri", "base_traffic": 1.0},
    {"BranchCode": 101045, "name": "Taman Midah", "base_traffic": 0.8},
    {"BranchCode": 101012, "name": "Bangsar", "base_traffic": 1.3},
    {"BranchCode": 101078, "name": "Cheras Selatan", "base_traffic": 0.9},
    {"BranchCode": 101056, "name": "Wangsa Maju", "base_traffic": 1.1},
]

# Each service owns a queue prefix (档 B). Some counters listen to several prefixes.
SERVICES = [
    {"code": "DEPOSIT", "prefix": "A", "avg_min": 6, "weight": 0.16},
    {"code": "WITHDRAW", "prefix": "A", "avg_min": 5, "weight": 0.06},  # shares A with deposit
    {"code": "LOAN", "prefix": "B", "avg_min": 30, "weight": 0.08},
    {"code": "CREDIT_CARD", "prefix": "C", "avg_min": 12, "weight": 0.10},
    {"code": "ACC_OPEN", "prefix": "D", "avg_min": 25, "weight": 0.08},
    {"code": "CUST_SVC", "prefix": "E", "avg_min": 10, "weight": 0.14},
    {"code": "ATM_CDM", "prefix": "F", "avg_min": 8, "weight": 0.10},
    {"code": "FIXED_DEP", "prefix": "G", "avg_min": 15, "weight": 0.06},
    {"code": "INSURANCE", "prefix": "H", "avg_min": 20, "weight": 0.06},
    {"code": "BIZ_BANK", "prefix": "I", "avg_min": 18, "weight": 0.06},
    {"code": "ONLINE_SUP", "prefix": "J", "avg_min": 12, "weight": 0.05},
    {"code": "REMITTANCE", "prefix": "K", "avg_min": 10, "weight": 0.05},
]

# Counter work profiles: which prefixes a counter listens to
PROFILES = [
    ["A", "E"],           # teller: deposit/withdraw lane + CS
    ["A", "F"],           # cashier + ATM support
    ["B", "C"],           # loan + cards
    ["D", "G", "H"],      # account/products
    ["I", "J", "K"],      # biz / online / remittance
    ["A", "B", "C", "E"], # flexible multi-queue
]


def hour_traffic_multiplier(hour: int) -> float:
    pattern = {9: 1.4, 10: 1.6, 11: 1.3, 12: 0.7, 13: 0.8, 14: 1.3, 15: 1.5, 16: 1.2}
    return pattern.get(hour, 0.5)


def day_traffic_multiplier(day: int) -> float:
    pattern = {1: 1.4, 2: 1.1, 3: 1.0, 4: 1.0, 5: 1.3, 6: 0.0, 7: 0.0}
    return pattern.get(day, 1.0)


def simulate_call_next_wait(
    rng: np.random.Generator,
    my_priority: int,
    my_wait_start_rank: float,
    queue_prefix: str,
    listening_profiles: list[list[str]],
    queue_depths: dict[str, int],
    avg_by_prefix: dict[str, float],
    n_active: int,
) -> tuple[float, int]:
    """
    Approximate Call Next drain wait for 'me'.
    Among counters listening to my prefix, each free counter repeatedly picks
    longest-wait head among its queues (P0 heads beat P1).
    Returns (wait_minutes, people_ahead_in_drain_order).
    """
    # Counters that can hear my queue
    able = [p for p in listening_profiles if queue_prefix in p]
    if not able:
        able = listening_profiles[:1]
    n_able = max(1, min(n_active, len(able)))

    # Build competing heads: for each listened prefix, invent head wait ranks
    # People ahead ≈ how many Call Next picks happen before me on able counters.
    competitors = []
    for pref, depth in queue_depths.items():
        if depth <= 0:
            continue
        # tickets in this queue ahead of a typical position
        for i in range(depth):
            # earlier in queue = longer wait already (smaller rank = earlier eligible)
            wait_rank = i + rng.uniform(0, 0.5)
            pri = 0 if (pref == queue_prefix and my_priority == 0 and i == 0) else (
                0 if rng.random() < 0.12 else 1
            )
            competitors.append((pri, wait_rank, pref))

    # Insert me
    competitors.append((my_priority, my_wait_start_rank, queue_prefix))
    # Sort like successive Call Next across one pooled set of able counters:
    # group by queue take head, then P0 pool then longest wait — approximate by
    # sorting all with (priority, wait_rank) but only counting tickets on prefixes
    # that share at least one able counter with me.
    relevant_prefs = set()
    for p in able:
        relevant_prefs.update(p)

    pool = [c for c in competitors if c[2] in relevant_prefs]
    # Drain order: P0 first by wait_rank, then P1 by wait_rank
    pool.sort(key=lambda x: (x[0], x[1]))

    my_idx = None
    for i, c in enumerate(pool):
        if c[2] == queue_prefix and abs(c[1] - my_wait_start_rank) < 1e-9 and c[0] == my_priority:
            my_idx = i
            break
    if my_idx is None:
        my_idx = len(pool) // 2

    people_ahead = my_idx
    # Service time for each ahead ticket depends on its queue avg
    total_work = 0.0
    for c in pool[:my_idx]:
        total_work += avg_by_prefix.get(c[2], 10.0) * rng.uniform(0.7, 1.3)

    wait = total_work / n_able
    return max(0.0, wait), people_ahead


def generate(n_rows: int = 30000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    svc_codes = [s["code"] for s in SERVICES]
    svc_weights = np.array([s["weight"] for s in SERVICES], dtype=float)
    svc_weights /= svc_weights.sum()
    svc_by_code = {s["code"]: s for s in SERVICES}
    avg_by_prefix: dict[str, float] = {}
    for s in SERVICES:
        avg_by_prefix.setdefault(s["prefix"], s["avg_min"])
        # if shared prefix, blend
        avg_by_prefix[s["prefix"]] = 0.5 * avg_by_prefix[s["prefix"]] + 0.5 * s["avg_min"]

    rows: list[dict] = []
    while len(rows) < n_rows:
        br = rng.choice(BRANCHES)
        day_of_week = int(rng.choice([1, 2, 3, 4, 5], p=[0.25, 0.2, 0.18, 0.17, 0.2]))
        day_mult = day_traffic_multiplier(day_of_week)
        if day_mult == 0:
            continue

        hour = int(rng.choice([9, 10, 11, 12, 13, 14, 15, 16],
                              p=[0.14, 0.16, 0.13, 0.08, 0.10, 0.13, 0.15, 0.11]))
        hour_mult = hour_traffic_multiplier(hour)
        traffic = br["base_traffic"] * hour_mult * day_mult

        svc_code = str(rng.choice(svc_codes, p=svc_weights))
        svc = svc_by_code[svc_code]
        prefix = svc["prefix"]
        default_avg = svc["avg_min"]

        # EntryType: 0=OnlineBooked, 1=WalkIn (match QMS enum)
        entry_type = 0 if rng.random() < 0.35 else 1
        if entry_type == 1:
            checked_in = 1
            slot_active = 0
            # walk-in always eligible P1 (unless we invent VIP — keep P1)
            call_priority = 1
        else:
            checked_in = 1 if rng.random() < 0.88 else 0
            # among checked-in online, ~40% currently in active slot → P0
            slot_active = 1 if checked_in and rng.random() < 0.40 else 0
            call_priority = 0 if slot_active else 1

        # Depths per prefix at this branch snapshot
        prefixes = sorted({s["prefix"] for s in SERVICES})
        queue_depths = {
            p: int(max(0, rng.poisson(lam=max(0.4, traffic * (2.2 if p == prefix else 1.2)))))
            for p in prefixes
        }
        # Ensure my queue has at least me
        queue_depths[prefix] = max(1, queue_depths[prefix])

        # Active counters + which profiles are open
        n_profiles = min(len(PROFILES), max(2, int(rng.integers(3, 7))))
        listening = [PROFILES[i] for i in rng.choice(len(PROFILES), size=n_profiles, replace=False)]
        if hour_mult >= 1.3:
            active_counters = int(rng.integers(max(2, n_profiles - 1), n_profiles + 1))
        else:
            active_counters = int(rng.integers(2, max(3, n_profiles)))
        active_counters = max(1, min(active_counters, n_profiles))

        # Listening counters that include my prefix
        listening_counters = sum(1 for p in listening[:active_counters] if prefix in p)
        listening_counters = max(1, listening_counters)

        queue_length = int(queue_depths[prefix])  # same-queue length (legacy feature)
        # Cross-lane pressure: total people on queues my counters hear
        heard = set()
        for p in listening[:active_counters]:
            heard.update(p)
        cross_lane_queue_length = int(sum(queue_depths[p] for p in heard))

        is_peak = 1 if (9 <= hour <= 11 or 14 <= hour <= 16) else 0
        enqueue_seq = int(rng.integers(1, max(2, queue_length + 5)))

        # My position in own queue (0 = head)
        my_pos = int(rng.integers(0, queue_length))
        my_wait_rank = float(my_pos) + rng.uniform(0, 0.3)

        wait_minutes, people_ahead = simulate_call_next_wait(
            rng,
            call_priority,
            my_wait_rank,
            prefix,
            listening[:active_counters],
            queue_depths,
            avg_by_prefix,
            listening_counters,
        )

        # Peak / Monday effects + noise
        wait_minutes *= 1.0 + 0.12 * is_peak
        if day_of_week == 1 and hour <= 10:
            wait_minutes *= 1.12
        wait_minutes += float(rng.normal(0, max(0.8, wait_minutes * 0.12)))
        wait_minutes = float(np.clip(wait_minutes, 0, 90))
        if queue_length <= 1 and call_priority == 0:
            wait_minutes = min(wait_minutes, float(rng.uniform(0.5, 4.0)))

        rows.append({
            "BranchCode": br["BranchCode"],
            "ServiceCode": svc_code,
            "TicketPrefix": prefix,
            "DefaultAvgServiceMinutes": default_avg,
            "EntryType": entry_type,
            "EnqueueSequence": enqueue_seq,
            "CheckedIn": checked_in,
            "SlotActive": slot_active,
            "CallNextPriority": call_priority,
            "QueueLength": queue_length,
            "CrossLaneQueueLength": cross_lane_queue_length,
            "PeopleAheadCallNext": people_ahead,
            "ActiveCounters": active_counters,
            "ListeningCounters": listening_counters,
            "HourOfDay": hour,
            "DayOfWeek": day_of_week,
            "IsPeakHour": is_peak,
            "WaitingMinutes": round(wait_minutes, 2),
        })

    return pd.DataFrame(rows)


def main():
    parser = argparse.ArgumentParser(description="Generate Tier-B synthetic QMS seed data")
    parser.add_argument("--rows", type=int, default=30000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    df = generate(n_rows=args.rows, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)

    print(f"Generated {len(df)} Tier-B rows → {args.output}")
    print(f"  Prefixes: {sorted(df['TicketPrefix'].unique())}")
    print(f"  P0 ratio: {(df['CallNextPriority'] == 0).mean():.1%}")
    print(f"  Wait mean/median/max: {df['WaitingMinutes'].mean():.1f} / "
          f"{df['WaitingMinutes'].median():.1f} / {df['WaitingMinutes'].max():.1f} m")
    print(f"  Online ratio: {(df['EntryType'] == 0).mean():.1%}")


if __name__ == "__main__":
    main()
