"""
Phase 3.10: Anonymous Bank Call Center Dataset Adapter

Parses 12 monthly .txt files from the Anonymous Bank Call Center dataset (1999 Israel,
Technion) and reconstructs QGo-compatible features at each call's q_start snapshot.

Target: q_time / 60.0  (seconds → minutes, equivalent to QGo's ActualWaitingMinutes)

Feature Reconstruction:
  - QueueLength:       count of calls in queue at this call's q_start
  - PeopleAhead:       same as QueueLength for this implementation (calls ahead in queue)
  - NowServing:        count of calls being served at q_start
  - ActiveCounters:    count of distinct servers with active service at q_start (PROXY)
  - RollingAvgServiceMinutes:  rolling mean of ser_time for last N completed same-type calls
  - DefaultAvgServiceMinutes:  per-type overall mean of ser_time (computed on train set only)
  - HourOfDay:         hour(q_start)
  - DayOfWeek:         day.of.week field → int (0=Mon..6=Sun)
  - IsPeakHour:        empirically defined from arrival rate
  - EnqueueSequence:   chronological order of q_start within date+type
  - ServiceCode:       type field (PS/NW/NE/TT/IN/PE)

Leakage Prevention:
  - RollingAvgServiceMinutes uses ONLY calls completed BEFORE this call's q_start
  - DefaultAvgServiceMinutes computed ONLY on training set (Jan-Oct), applied to test set
  - Queue state reconstruction uses ONLY concurrent state (no future information)

Data Issues Handled:
  - Off-by-one: 19 fields per data row (field[0]=row_num), 18 header columns
  - Type cleanup: ' TT' → 'TT', 'AA' → dropped (5 rows, unknown type)
  - q_start = 0:00:00 means bypassed queue → valid zero-wait observation

Output: ml/data/anonymous_bank_adapted.csv  (one row per AGENT call with reconstructed features)

Usage:
  python ml/adapt_anonymous_bank.py --data-dir ~/Downloads --output ml/data/anonymous_bank_adapted.csv
  python ml/adapt_anonymous_bank.py --data-dir ~/Downloads --validate-only

NOTE: This script produces the adapted dataset. It does NOT train a model.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import NamedTuple

import numpy as np


# ── Data structures ──

class CallRecord(NamedTuple):
    """Parsed row from Anonymous Bank dataset."""
    row_num: int
    vru_line: str
    call_id: int
    customer_id: int
    priority: int
    service_type: str      # PS/NW/NE/TT/IN/PE
    date_str: str          # YYMMDD
    vru_entry: timedelta
    vru_exit: timedelta
    vru_time: int
    q_start: timedelta     # 0:00:00 = bypassed queue
    q_exit: timedelta
    q_time: int            # seconds in queue
    outcome: str           # AGENT/HANG/PHANTOM
    ser_start: timedelta
    ser_exit: timedelta
    ser_time: int          # seconds of service
    server: str
    day_of_week: str       # "sunday"..."saturday"
    # Computed
    date: datetime         # 1999-MM-DD
    q_start_dt: datetime   # full datetime of queue start
    ser_start_dt: datetime
    ser_exit_dt: datetime
    bypassed_queue: bool   # q_start == 0:00:00


MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

DAY_MAP = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}

# Peak hours: 9-11 and 14-16 (matching QGo IsPeakHour definition)
PEAK_HOURS = set(range(9, 12)) | set(range(14, 17))


# ── Parsing ──

def parse_time(t: str) -> timedelta:
    """Parse H:MM:SS or HH:MM:SS to timedelta."""
    parts = t.split(":")
    return timedelta(hours=int(parts[0]), minutes=int(parts[1]), seconds=int(parts[2]))


def parse_date(d: str) -> datetime:
    """Parse YYMMDD (99MMDD) to datetime(1999, M, D)."""
    return datetime(1999, int(d[2:4]), int(d[4:6]))


def parse_row(fields: list[str]) -> CallRecord | None:
    """Parse a 19-field row into a CallRecord. Returns None if unparseable."""
    if len(fields) < 19:
        return None

    try:
        row_num = int(fields[0])
        service_type = fields[5].strip()

        # Drop unknown type 'AA' (5 rows across all months)
        if service_type == "AA":
            return None

        date_str = fields[6]
        date = parse_date(date_str)

        vru_entry = parse_time(fields[7])
        vru_exit = parse_time(fields[8])
        vru_time = int(fields[9])
        q_start = parse_time(fields[10])
        q_exit = parse_time(fields[11])
        q_time = int(fields[12])
        outcome = fields[13]
        ser_start = parse_time(fields[14])
        ser_exit = parse_time(fields[15])
        ser_time = int(fields[16])
        server = fields[17]
        day_of_week = fields[18].strip().lower()

        bypassed = (q_start == timedelta(0))

        # Full datetime: for bypassed-queue calls that went to AGENT,
        # use ser_start as the effective snapshot time
        if bypassed:
            q_start_dt = date + ser_start if outcome == "AGENT" else date
        else:
            q_start_dt = date + q_start

        ser_start_dt = date + ser_start if ser_start != timedelta(0) else date
        ser_exit_dt = date + ser_exit if ser_exit != timedelta(0) else date

        return CallRecord(
            row_num=row_num,
            vru_line=fields[1],
            call_id=int(fields[2]),
            customer_id=int(fields[3]),
            priority=int(fields[4]),
            service_type=service_type,
            date_str=date_str,
            vru_entry=vru_entry,
            vru_exit=vru_exit,
            vru_time=vru_time,
            q_start=q_start,
            q_exit=q_exit,
            q_time=q_time,
            outcome=outcome,
            ser_start=ser_start,
            ser_exit=ser_exit,
            ser_time=ser_time,
            server=server,
            day_of_week=day_of_week,
            date=date,
            q_start_dt=q_start_dt,
            ser_start_dt=ser_start_dt,
            ser_exit_dt=ser_exit_dt,
            bypassed_queue=bypassed,
        )
    except (ValueError, IndexError):
        return None


def load_all_months(data_dir: Path) -> list[CallRecord]:
    """Load all 12 monthly files, return sorted by (date, q_start_dt)."""
    records: list[CallRecord] = []
    for month in MONTHS:
        path = data_dir / f"{month}.txt"
        if not path.exists():
            print(f"WARNING: {path} not found, skipping")
            continue
        count = 0
        with open(path, "r") as f:
            next(f)  # skip header
            for line in f:
                fields = line.strip().split("\t")
                rec = parse_row(fields)
                if rec is not None:
                    records.append(rec)
                    count += 1
        print(f"  Loaded {month}: {count} rows")

    # Sort by date then by q_start_dt for deterministic processing
    records.sort(key=lambda r: (r.date, r.q_start_dt))
    print(f"  Total: {len(records)} rows loaded")
    return records


# ── Feature Reconstruction ──

def _reconstruct_day(
    day_records: list[CallRecord],
    completed_by_type: dict[str, list[tuple[datetime, int]]],
    default_avg_by_type: dict[str, float],
    rolling_window: int,
) -> list[dict]:
    """Reconstruct features for all AGENT calls in a single day.

    Uses an event-sweep approach: sort all queue-enter, queue-exit, service-start,
    and service-exit events chronologically, then sweep through to maintain running
    counters. This is O(N log N) per day instead of O(N²).
    """
    from bisect import insort, bisect_left

    adapted: list[dict] = []

    # Sort day_records by q_start_dt for processing
    day_sorted = sorted(day_records, key=lambda r: r.q_start_dt)

    # For each AGENT call, we need state at time t = q_start_dt.
    # Instead of scanning all records, we maintain:
    #   - in_queue: set of records currently in queue
    #   - in_service: dict of server → record currently being served

    # Build timeline of events for sweep
    # Event types: ('q_enter', time, rec), ('q_exit', time, rec),
    #              ('s_enter', time, rec), ('s_exit', time, rec)
    events: list[tuple[datetime, int, str, CallRecord]] = []

    for rec in day_records:
        # Queue events (only for non-bypassed calls that actually entered queue)
        if not rec.bypassed_queue and rec.q_start != timedelta(0):
            q_start_dt = rec.date + rec.q_start
            q_exit_dt = rec.date + rec.q_exit
            events.append((q_start_dt, 0, "q_enter", rec))
            events.append((q_exit_dt, 1, "q_exit", rec))

        # Service events
        if rec.ser_start != timedelta(0) and rec.ser_exit != timedelta(0) and rec.server != "NO_SERVER":
            events.append((rec.ser_start_dt, 0, "s_enter", rec))
            events.append((rec.ser_exit_dt, 1, "s_exit", rec))

    # Sort: by time, then exits before enters (so at time t, exits happen first)
    events.sort(key=lambda e: (e[0], e[1]))

    # Now process each AGENT call: for each, advance the event sweep to time t
    # and read off the current state.
    # We need to handle AGENT calls in chronological order of their snapshot time.
    agent_calls = [r for r in day_sorted if r.outcome == "AGENT"]

    # Current state
    in_queue: set[int] = set()           # set of row_num in queue
    in_queue_by_type: dict[str, set[int]] = defaultdict(set)
    in_service: dict[str, int] = {}      # server_name → row_num
    active_servers: set[str] = set()
    now_serving_count = 0
    event_idx = 0

    # Map row_num to record for queue tracking
    rec_by_rownum: dict[int, CallRecord] = {r.row_num: r for r in day_records}

    for rec in agent_calls:
        t = rec.q_start_dt

        # Advance events up to (but not including) time t
        # Events AT time t with exit type (1) should be processed (they exit before this snapshot)
        # Events AT time t with enter type (0) should NOT be processed yet
        # Actually: at time t, someone entering queue at exactly t IS in queue.
        # But someone exiting at exactly t is NOT in queue anymore.
        # So: process all events with time < t, AND events at time t with type "exit"
        while event_idx < len(events):
            evt_time, evt_order, evt_type, evt_rec = events[event_idx]
            # Process events strictly before t
            # Also process exits at exactly t (they leave before our snapshot)
            if evt_time < t or (evt_time == t and evt_order == 1):
                if evt_type == "q_enter":
                    in_queue.add(evt_rec.row_num)
                    in_queue_by_type[evt_rec.service_type].add(evt_rec.row_num)
                elif evt_type == "q_exit":
                    in_queue.discard(evt_rec.row_num)
                    in_queue_by_type[evt_rec.service_type].discard(evt_rec.row_num)
                elif evt_type == "s_enter":
                    in_service[evt_rec.server] = evt_rec.row_num
                    active_servers.add(evt_rec.server)
                    now_serving_count += 1
                elif evt_type == "s_exit":
                    if evt_rec.server in in_service:
                        del in_service[evt_rec.server]
                    active_servers.discard(evt_rec.server)
                    now_serving_count -= 1
                event_idx += 1
            else:
                break

        # Now also process enters at exactly t (someone entering at same time IS in queue)
        # Save position to restore after
        temp_idx = event_idx
        while temp_idx < len(events):
            evt_time, evt_order, evt_type, evt_rec = events[temp_idx]
            if evt_time == t and evt_order == 0:
                if evt_type == "q_enter":
                    in_queue.add(evt_rec.row_num)
                    in_queue_by_type[evt_rec.service_type].add(evt_rec.row_num)
                elif evt_type == "s_enter":
                    in_service[evt_rec.server] = evt_rec.row_num
                    active_servers.add(evt_rec.server)
                    now_serving_count += 1
                temp_idx += 1
            else:
                break

        # Read current state
        # QueueLength: calls in queue (excluding self)
        queue_length = len(in_queue) - (1 if rec.row_num in in_queue else 0)

        # PeopleAhead: calls in queue that entered BEFORE this call
        people_ahead = 0
        for rn in in_queue:
            if rn == rec.row_num:
                continue
            other = rec_by_rownum.get(rn)
            if other and other.q_start_dt < t:
                people_ahead += 1

        # NowServing & ActiveCounters
        now_serving = max(0, now_serving_count)
        active_counters = len(active_servers)

        # Undo the temp enters at t (so they're properly processed for the next call)
        temp_idx2 = event_idx
        while temp_idx2 < len(events):
            evt_time, evt_order, evt_type, evt_rec = events[temp_idx2]
            if evt_time == t and evt_order == 0:
                if evt_type == "q_enter":
                    in_queue.discard(evt_rec.row_num)
                    in_queue_by_type[evt_rec.service_type].discard(evt_rec.row_num)
                elif evt_type == "s_enter":
                    if evt_rec.server in in_service:
                        del in_service[evt_rec.server]
                    active_servers.discard(evt_rec.server)
                    now_serving_count -= 1
                temp_idx2 += 1
            else:
                break

        # ── Rolling average service time ──
        type_completed = completed_by_type.get(rec.service_type, [])
        # Binary search for entries completed before t
        # completed_by_type is sorted by exit_dt (chronological)
        recent_svc = []
        for exit_dt, svc_time in reversed(type_completed):
            if exit_dt >= t:
                continue
            recent_svc.append(svc_time)
            if len(recent_svc) >= rolling_window:
                break

        if recent_svc:
            rolling_avg_service_min = np.mean(recent_svc) / 60.0
        else:
            rolling_avg_service_min = None

        default_avg = default_avg_by_type.get(rec.service_type, 10.0)

        # ── Temporal features ──
        if rec.bypassed_queue:
            hour = rec.ser_start.seconds // 3600
        else:
            hour = rec.q_start.seconds // 3600

        day_int = DAY_MAP.get(rec.day_of_week, 0)
        is_peak = 1 if hour in PEAK_HOURS else 0

        # ── EnqueueSequence: position among same-date, same-type calls up to time t ──
        seq = 0
        for other in day_sorted:
            if other.service_type == rec.service_type and other.q_start_dt <= t:
                seq += 1

        # ── Target ──
        target_minutes = rec.q_time / 60.0

        adapted.append({
            "SnapshotDate": rec.date_str,
            "SnapshotTime": str(rec.q_start) if not rec.bypassed_queue else str(rec.ser_start),
            "QueueLength": queue_length,
            "PeopleAhead": people_ahead,
            "NowServing": now_serving,
            "ActiveCounters": active_counters,
            "RollingAvgServiceMinutes": round(rolling_avg_service_min, 3) if rolling_avg_service_min is not None else "",
            "DefaultAvgServiceMinutes": round(default_avg, 3),
            "HourOfDay": hour,
            "DayOfWeek": day_int,
            "IsPeakHour": is_peak,
            "EnqueueSequence": seq,
            "ServiceCode": rec.service_type,
            "BranchCode": 0,  # single call center
            "Priority": rec.priority,
            "Server": rec.server,
            "BypassedQueue": 1 if rec.bypassed_queue else 0,
            "ActualWaitingMinutes": round(target_minutes, 4),
            "ActualWaitingSeconds": rec.q_time,
            "Month": int(rec.date_str[2:4]),
        })

    return adapted


def reconstruct_features(
    records: list[CallRecord],
    default_avg_by_type: dict[str, float],
    rolling_window: int = 50,
) -> list[dict]:
    """
    For each AGENT call, reconstruct QGo-compatible features at the q_start snapshot.

    Uses per-day event sweep for O(N log N) per day instead of O(N²).

    Feature reconstruction at snapshot time t = q_start_dt:
      - QueueLength:       count of calls in queue at t (excluding self)
      - PeopleAhead:       calls in queue that entered before t
      - NowServing:        calls currently being served at t
      - ActiveCounters:    distinct servers serving at t (PROXY for physical counters)
      - RollingAvgServiceMinutes:  rolling mean of last N completed same-type calls before t

    LEAKAGE PREVENTION:
      - All state queries use strict temporal bounds (< t or <= t as appropriate)
      - RollingAvg only uses calls that COMPLETED service before t
      - DefaultAvg is pre-computed on training set only
    """
    print("\n  Building daily index for queue state reconstruction...")

    # Index records by date
    by_date: dict[str, list[CallRecord]] = defaultdict(list)
    for r in records:
        by_date[r.date_str].append(r)

    # Track completed services per type across ALL days (for rolling avg)
    # Maintained chronologically as we process day by day
    completed_by_type: dict[str, list[tuple[datetime, int]]] = defaultdict(list)

    adapted_rows: list[dict] = []
    dates_sorted = sorted(by_date.keys())

    for di, date_str in enumerate(dates_sorted):
        day_records = by_date[date_str]

        if (di + 1) % 30 == 0 or di == 0:
            print(f"  Day {di+1}/{len(dates_sorted)} ({date_str}): "
                  f"{len(day_records)} records, {len(adapted_rows)} adapted rows so far")

        # Reconstruct features for this day
        day_adapted = _reconstruct_day(
            day_records, completed_by_type, default_avg_by_type, rolling_window
        )
        adapted_rows.extend(day_adapted)

        # After processing the day, add all completed services to the global tracker
        for rec in day_records:
            if rec.ser_time > 0 and rec.ser_exit != timedelta(0):
                completed_by_type[rec.service_type].append((rec.ser_exit_dt, rec.ser_time))

    agent_count = sum(1 for r in records if r.outcome == "AGENT")
    print(f"\n  AGENT calls in data: {agent_count}")
    print(f"  Adapted rows produced: {len(adapted_rows)}")
    return adapted_rows


# ── Validation & Sanity Checks ──

def compute_default_avg_from_train(records: list[CallRecord]) -> dict[str, float]:
    """
    Compute DefaultAvgServiceMinutes per type using ONLY training data (Jan-Oct).
    This prevents target leakage into test set.
    """
    sums: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)

    for rec in records:
        month = int(rec.date_str[2:4])
        if month > 10:  # Nov, Dec are test
            continue
        if rec.outcome == "AGENT" and rec.ser_time > 0:
            sums[rec.service_type] += rec.ser_time
            counts[rec.service_type] += 1

    result = {}
    for stype in sums:
        avg_sec = sums[stype] / counts[stype]
        result[stype] = avg_sec / 60.0

    print("\n  DefaultAvgServiceMinutes (from Jan-Oct train set):")
    for stype in sorted(result):
        print(f"    {stype}: {result[stype]:.2f} min ({counts[stype]} calls)")

    return result


def run_sanity_checks(adapted_rows: list[dict]) -> None:
    """Run sanity checks on the adapted dataset."""
    import statistics

    print("\n" + "=" * 60)
    print("SANITY CHECKS")
    print("=" * 60)

    n = len(adapted_rows)
    print(f"\n  Total adapted rows: {n}")

    # 1. Target distribution
    waits = [r["ActualWaitingMinutes"] for r in adapted_rows]
    zero_wait = sum(1 for w in waits if w == 0)
    print(f"\n  Target (ActualWaitingMinutes):")
    print(f"    Min:    {min(waits):.2f}")
    print(f"    Max:    {max(waits):.2f}")
    print(f"    Mean:   {statistics.mean(waits):.2f}")
    print(f"    Median: {statistics.median(waits):.2f}")
    print(f"    Zero-wait: {zero_wait} ({zero_wait/n*100:.1f}%)")

    # 2. BypassedQueue correlation with zero wait
    bypassed = [r for r in adapted_rows if r["BypassedQueue"] == 1]
    bp_zero = sum(1 for r in bypassed if r["ActualWaitingMinutes"] == 0)
    print(f"\n  Bypassed queue: {len(bypassed)} ({len(bypassed)/n*100:.1f}%)")
    print(f"    Of which zero-wait: {bp_zero} ({bp_zero/len(bypassed)*100:.1f}% — should be ~100%)")

    # 3. QueueLength / PeopleAhead ranges
    ql = [r["QueueLength"] for r in adapted_rows]
    pa = [r["PeopleAhead"] for r in adapted_rows]
    print(f"\n  QueueLength: min={min(ql)}, max={max(ql)}, mean={statistics.mean(ql):.1f}")
    print(f"  PeopleAhead: min={min(pa)}, max={max(pa)}, mean={statistics.mean(pa):.1f}")

    # 4. ActiveCounters range
    ac = [r["ActiveCounters"] for r in adapted_rows]
    print(f"  ActiveCounters: min={min(ac)}, max={max(ac)}, mean={statistics.mean(ac):.1f}")

    # 5. Temporal split
    train = [r for r in adapted_rows if r["Month"] <= 10]
    test = [r for r in adapted_rows if r["Month"] > 10]
    print(f"\n  Temporal split:")
    print(f"    Train (Jan-Oct): {len(train)} ({len(train)/n*100:.1f}%)")
    print(f"    Test  (Nov-Dec): {len(test)} ({len(test)/n*100:.1f}%)")

    # 6. Service type distribution
    print(f"\n  Service type distribution:")
    type_counts: dict[str, int] = defaultdict(int)
    for r in adapted_rows:
        type_counts[r["ServiceCode"]] += 1
    for t in sorted(type_counts, key=type_counts.get, reverse=True):
        print(f"    {t}: {type_counts[t]} ({type_counts[t]/n*100:.1f}%)")

    # 7. Correlation check: PeopleAhead vs ActualWaitingMinutes
    # For non-zero-wait calls only
    nonzero = [(r["PeopleAhead"], r["ActualWaitingMinutes"]) for r in adapted_rows if r["ActualWaitingMinutes"] > 0]
    if len(nonzero) > 100:
        pa_vals = [x[0] for x in nonzero]
        wait_vals = [x[1] for x in nonzero]
        corr = np.corrcoef(pa_vals, wait_vals)[0, 1]
        print(f"\n  Correlation (PeopleAhead vs Wait, nonzero-wait only): {corr:.3f}")
        print(f"    (Should be positive — more people ahead → longer wait)")

    # 8. Leakage spot check: RollingAvg should never use future info
    # The rolling avg is computed from completed calls before q_start,
    # so for the first call of a type on a day, it should come from previous days
    first_of_day = {}
    for r in adapted_rows:
        key = (r["SnapshotDate"], r["ServiceCode"])
        if key not in first_of_day:
            first_of_day[key] = r
    has_rolling = sum(1 for r in first_of_day.values() if r["RollingAvgServiceMinutes"] != "")
    print(f"\n  Leakage spot check:")
    print(f"    First call of each (date, type): {len(first_of_day)}")
    print(f"    Of which have RollingAvg: {has_rolling} (should be >0 after first day)")

    # 9. Hour distribution
    print(f"\n  Hour distribution (top 5):")
    hour_counts: dict[int, int] = defaultdict(int)
    for r in adapted_rows:
        hour_counts[r["HourOfDay"]] += 1
    for h in sorted(hour_counts, key=hour_counts.get, reverse=True)[:5]:
        print(f"    Hour {h:2d}: {hour_counts[h]} ({hour_counts[h]/n*100:.1f}%)")

    print("\n" + "=" * 60)
    print("SANITY CHECKS COMPLETE")
    print("=" * 60)


def run_spot_checks(records: list[CallRecord], adapted_rows: list[dict]) -> None:
    """Spot-check specific records for correctness."""
    print("\n" + "=" * 60)
    print("SPOT CHECKS (5 random AGENT calls)")
    print("=" * 60)

    rng = np.random.default_rng(42)
    nonzero_rows = [r for r in adapted_rows if r["ActualWaitingMinutes"] > 0 and r["QueueLength"] > 0]

    if len(nonzero_rows) < 5:
        print("  Not enough non-zero rows for spot checks")
        return

    indices = rng.choice(len(nonzero_rows), size=5, replace=False)
    for idx in indices:
        r = nonzero_rows[idx]
        print(f"\n  Date={r['SnapshotDate']} Time={r['SnapshotTime']} Type={r['ServiceCode']}")
        print(f"    QueueLength={r['QueueLength']} PeopleAhead={r['PeopleAhead']} "
              f"NowServing={r['NowServing']} ActiveCounters={r['ActiveCounters']}")
        print(f"    RollingAvg={r['RollingAvgServiceMinutes']} DefaultAvg={r['DefaultAvgServiceMinutes']:.2f}")
        print(f"    Wait={r['ActualWaitingMinutes']:.2f} min ({r['ActualWaitingSeconds']}s)")

        # Formula estimate
        avg_svc = float(r["RollingAvgServiceMinutes"]) if r["RollingAvgServiceMinutes"] != "" else r["DefaultAvgServiceMinutes"]
        counters = max(r["ActiveCounters"], 1)
        formula_est = r["PeopleAhead"] * avg_svc / counters
        print(f"    Formula estimate: {r['PeopleAhead']} × {avg_svc:.1f} / {counters} = {formula_est:.2f} min")
        print(f"    Actual: {r['ActualWaitingMinutes']:.2f} min  |  Error: {abs(formula_est - r['ActualWaitingMinutes']):.2f} min")


# ── Main ──

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Adapt Anonymous Bank Call Center data to QGo feature schema"
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path.home() / "Downloads",
        help="Directory containing January.txt ... December.txt",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "data" / "anonymous_bank_adapted.csv",
        help="Output CSV path",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Run validation checks without writing output",
    )
    parser.add_argument(
        "--rolling-window",
        type=int,
        default=50,
        help="Window size for rolling average service time (default: 50)",
    )
    parser.add_argument(
        "--sample",
        type=int,
        default=0,
        help="Process only first N days (0 = all). For quick testing.",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Anonymous Bank Dataset Adapter (Phase 3.10)")
    print("=" * 60)

    # 1. Load all monthly files
    print("\n[1/5] Loading monthly files...")
    records = load_all_months(args.data_dir)

    if not records:
        print("ERROR: No records loaded. Check --data-dir path.")
        sys.exit(1)

    # Optional: sample for quick testing
    if args.sample > 0:
        dates = sorted(set(r.date_str for r in records))
        sample_dates = set(dates[:args.sample])
        records = [r for r in records if r.date_str in sample_dates]
        print(f"\n  Sampling: keeping first {args.sample} days → {len(records)} records")

    # 2. Compute DefaultAvgServiceMinutes from training data only
    print("\n[2/5] Computing DefaultAvgServiceMinutes (train set: Jan-Oct)...")
    default_avg = compute_default_avg_from_train(records)

    # 3. Reconstruct features
    print("\n[3/5] Reconstructing features at each AGENT call's q_start snapshot...")
    print("  (This processes each call against same-day records — may take a few minutes)")
    adapted_rows = reconstruct_features(records, default_avg, args.rolling_window)

    if not adapted_rows:
        print("ERROR: No AGENT rows produced.")
        sys.exit(1)

    # 4. Sanity checks
    print("\n[4/5] Running sanity checks...")
    run_sanity_checks(adapted_rows)
    run_spot_checks(records, adapted_rows)

    # 5. Write output
    if args.validate_only:
        print("\n[5/5] --validate-only: skipping output write")
    else:
        output_path = args.output
        output_path.parent.mkdir(parents=True, exist_ok=True)

        fieldnames = [
            "SnapshotDate", "SnapshotTime",
            "QueueLength", "PeopleAhead", "NowServing", "ActiveCounters",
            "RollingAvgServiceMinutes", "DefaultAvgServiceMinutes",
            "HourOfDay", "DayOfWeek", "IsPeakHour",
            "EnqueueSequence", "ServiceCode", "BranchCode",
            "Priority", "Server", "BypassedQueue",
            "ActualWaitingMinutes", "ActualWaitingSeconds", "Month",
        ]

        with open(output_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(adapted_rows)

        print(f"\n[5/5] Wrote {len(adapted_rows)} rows to {output_path}")

        # Summary stats
        train_rows = sum(1 for r in adapted_rows if r["Month"] <= 10)
        test_rows = sum(1 for r in adapted_rows if r["Month"] > 10)
        print(f"  Train (Jan-Oct): {train_rows} rows")
        print(f"  Test  (Nov-Dec): {test_rows} rows")

    print("\nDone. Do NOT train a model with this data yet — validate the output first.")


if __name__ == "__main__":
    main()
