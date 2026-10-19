"""
Generate synthetic seed data for QMS wait-time model training.

Discrete-event simulation of Malaysian bank branches matching production logic:
  - Production service codes / names / ticket prefixes / default minutes
    (database/insert-service-types-all-branches.sql + insert-service-queues-all-branches.sql;
    1 service = 1 queue = 1 prefix, e.g. A = Account Opening, D = Deposit, W = Withdraw)
  - Production branch codes and branch settings (60-min slots aligned to opening time,
    Mon-Fri 09:30-16:00; OnlineSlotsPerSlot = manager setting per service, drawn per branch-day from 2..8)
  - CreatedAt FIFO call ordering (matches QueueCallNextSelector)
  - Multi-counter drain with per-counter service assignments (matches CounterSimulationEstimator)
  - Online bookings with slot features + walk-ins
  - All 26 features aligned with MlHttpWaitTimeEstimator.BuildPayload / WaitTimeFeatureBuilder
  - Check-in time for online bookings: 80% arrive 0-20 min early, 20% arrive 0-15 min late;
    QueueEligibleAt = max(CheckInAt, SlotStart - EarlyCall)
  - EnqueueSequence = per branch-day rank by CreatedAt across all services
  - Target = CalledAt - QueueEligibleAt, where CalledAt is the moment a counter picks the ticket
    (matches MlTrainingObservation.ActualWaitingMinutes; never negative)

The regions between "# >>> NB-CELL <name>" and "# <<< NB-CELL" are copied verbatim into
ml/QMS_WaitTime_ML_Pipeline.ipynb; edit both together.

Output: ml/data/wait_training.csv

Usage:
    python generate_seed_data.py
    python generate_seed_data.py --rows 40000
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "data" / "wait_training.csv"

# >>> NB-CELL config
# ── Branch & Service configs (matching the production seed scripts in database/) ──

# Real production BranchCodes (insert-branches-from-paste.sql: BranchCode = 101000 + row).
# Production branch settings: SlotDurationMinutes = 60, OnlineEarlyCallMinutes = 10 (the simulator
# draws early call per branch-day from EARLY_CALL_CHOICES instead), Mon-Fri 09:30-16:00.
BRANCHES = [
    {"BranchCode": 101033, "name": "Bandar Sri Permaisuri", "base_traffic": 1.0, "slot_duration": 60, "early_call": 10},
    {"BranchCode": 101038, "name": "Taman Midah",           "base_traffic": 0.8, "slot_duration": 60, "early_call": 10},
    {"BranchCode": 101008, "name": "Bangsar",               "base_traffic": 1.3, "slot_duration": 60, "early_call": 10},
    {"BranchCode": 101039, "name": "Taman Connaught",       "base_traffic": 0.9, "slot_duration": 60, "early_call": 10},
    {"BranchCode": 101036, "name": "Wangsa Maju",           "base_traffic": 1.1, "slot_duration": 60, "early_call": 10},
]

# Branch service window (BRANCH_OPERATING_HOURS seed / BranchOperatingHoursBackfill): 09:30-16:00.
# Slots are aligned to opening time (QmsQueueService.AlignSlot anchor), so 60-min slots are
# 09:30, 10:30, ... 14:30; a slot must end by closing time, so 14:30-15:30 is the last bookable slot.
OPEN_MIN = 9 * 60 + 30    # 570
CLOSE_MIN = 16 * 60       # 960
DRAIN_END_MIN = CLOSE_MIN + 90  # counters keep calling the remaining queue until 17:30

# Production services: code, name, prefix (SERVICE_QUEUES.TicketPrefix) and DefaultAvgServiceMinutes.
# "weight" = share of arrivals (sim only). OnlineSlotsPerSlot is not fixed here: it is a manager setting
# per service (ServiceType.OnlineSlotsPerSlot), so it is drawn per branch-day below.
SERVICES = [
    {"code": "ACC_OPEN", "name": "Account Opening",           "prefix": "A", "avg_min": 15, "weight": 0.08},
    {"code": "DEPOSIT",  "name": "Deposit Services",          "prefix": "D", "avg_min": 3,  "weight": 0.16},
    {"code": "WITHDRAW", "name": "Withdrawal Services",       "prefix": "W", "avg_min": 4,  "weight": 0.06},
    {"code": "LOAN",     "name": "Loan / Financing",          "prefix": "L", "avg_min": 30, "weight": 0.08},
    {"code": "CCARD",    "name": "Credit Card Services",      "prefix": "C", "avg_min": 10, "weight": 0.10},
    {"code": "FDEP",     "name": "Fixed Deposit",             "prefix": "F", "avg_min": 15, "weight": 0.06},
    {"code": "INVUT",    "name": "Investment / Unit Trust",   "prefix": "I", "avg_min": 30, "weight": 0.04},
    {"code": "BANCA",    "name": "Insurance / Bancassurance", "prefix": "B", "avg_min": 25, "weight": 0.06},
    {"code": "ATMCDM",   "name": "ATM / CDM Services",        "prefix": "T", "avg_min": 5,  "weight": 0.10},
    {"code": "ONLBANK",  "name": "Online Banking Support",    "prefix": "O", "avg_min": 5,  "weight": 0.05},
    {"code": "BIZBANK",  "name": "Business Banking",          "prefix": "S", "avg_min": 20, "weight": 0.06},
    {"code": "REMIT",    "name": "Remittance / Transfer",     "prefix": "R", "avg_min": 15, "weight": 0.05},
    {"code": "CUSTSVC",  "name": "Queue / Customer Service",  "prefix": "Q", "avg_min": 10, "weight": 0.14},
]

# Counter profiles: which prefixes (= services) a counter listens to (COUNTER_ALLOWED_SERVICES).
# The production seed creates counters with no allowed services (the manager assigns them), so these
# are realistic teller groupings; every prefix is covered by at least one profile.
PROFILES = [
    ["D", "W", "Q"],            # cash teller: deposit, withdraw, customer service
    ["D", "W", "T"],            # cash teller: deposit, withdraw, ATM/CDM
    ["L", "C"],                 # credit: loan, credit card
    ["A", "F", "I", "B"],       # sales: account opening, fixed deposit, investment, bancassurance
    ["S", "O", "R"],            # business banking, online banking, remittance
    ["D", "W", "L", "C", "Q"],  # multi-skill
]

# Realistic manager settings for Branch.OnlineEarlyCallMinutes (drawn per branch-day)
EARLY_CALL_CHOICES = [0, 5, 10, 15, 20, 30]

# Manager setting ServiceType.OnlineSlotsPerSlot (max online bookings per slot for one service; the same
# value applies to every slot of that service). Drawn per branch-day per service, uniform integer 2..8.
ONLINE_SLOTS_MIN = 2
ONLINE_SLOTS_MAX = 8
# <<< NB-CELL


# >>> NB-CELL classes
@dataclass
class Ticket:
    """A simulated queue ticket."""
    ticket_id: int
    branch_code: int
    service_code: str
    prefix: str
    default_avg_min: float
    online_slots_per_slot: int
    entry_type: int  # 0=OnlineBooked, 1=WalkIn
    checked_in: bool
    created_at: float  # minutes from midnight (online = booking time, may be hours earlier)
    slot_start: float | None = None  # for online bookings
    slot_end: float | None = None
    queue_eligible_at: float = 0.0  # walk-in=created_at, online=max(checkin_at, slot_start - early_call)
    serving_started_at: float | None = None  # = CalledAt: the moment a counter picks the ticket
    service_end_at: float | None = None  # actual end time (observable: counter becomes free)
    abandoned: bool = False
    enqueue_seq: int = 0  # per branch-day rank by (created_at, ticket_id), across all services
    checkin_at: float | None = None  # physical check-in time (online) / created_at (walk-in)


@dataclass
class Counter:
    """A simulated service counter."""
    counter_id: int
    allowed_prefixes: list[str]
    free_at: float = 0.0  # when this counter becomes free
    currently_serving: Ticket | None = None


def hour_traffic(hour: int) -> float:
    return {9: 1.4, 10: 1.6, 11: 1.3, 12: 0.7, 13: 0.8, 14: 1.3, 15: 1.5, 16: 1.2}.get(hour, 0.5)


def day_traffic(dow: int) -> float:
    # 0=Mon..4=Fri, 5=Sat, 6=Sun (python weekday; live WaitTimeFeatureBuilder uses the same encoding)
    return {0: 1.4, 1: 1.1, 2: 1.0, 3: 1.0, 4: 1.3}.get(dow, 0.0)
# <<< NB-CELL


# >>> NB-CELL simulate
def simulate_day(
    rng: np.random.Generator,
    branch: dict,
    day_of_week: int,
    n_profiles: int,
) -> list[dict]:
    """Simulate one full day at one branch using discrete-event Call Next drain."""

    svc_codes = [s["code"] for s in SERVICES]
    svc_weights = np.array([s["weight"] for s in SERVICES], dtype=float)
    svc_weights /= svc_weights.sum()
    svc_by_code = {s["code"]: s for s in SERVICES}

    slot_dur = branch["slot_duration"]
    # Last bookable slot must end by closing time (QmsQueueService rejects slotEnd > window end)
    last_slot_idx = (CLOSE_MIN - OPEN_MIN) // slot_dur - 1
    # Manager-configurable Branch.OnlineEarlyCallMinutes: draw per branch-day so the
    # model sees the full realistic range (0..30) instead of a fixed per-branch value.
    early_call = int(rng.choice(EARLY_CALL_CHOICES))
    # Manager-configurable ServiceType.OnlineSlotsPerSlot: one value per service for this branch-day.
    online_cap = {
        s["code"]: int(rng.integers(ONLINE_SLOTS_MIN, ONLINE_SLOTS_MAX + 1))
        for s in SERVICES
    }

    # Set up counters
    profile_indices = rng.choice(len(PROFILES), size=n_profiles, replace=False)
    counters = [
        Counter(counter_id=i, allowed_prefixes=PROFILES[idx])
        for i, idx in enumerate(profile_indices)
    ]

    day_mult = day_traffic(day_of_week)
    if day_mult == 0:
        return []

    tickets: list[Ticket] = []
    ticket_id = 0
    online_used: dict[tuple[str, int], int] = {}  # (service_code, slot_idx) -> online bookings

    # Seeded before arrivals so the RNG draw order matches the notebook.
    # Rolling avg service times per prefix (each production service has its own prefix/queue).
    # Each entry is (completion_time, duration) so snapshots can filter by time.
    # Seed with 10 baseline durations per prefix (time=0 = before day starts).
    completed_durations: dict[str, list[tuple[float, float]]] = {
        s["prefix"]: [(0.0, s["avg_min"] * rng.uniform(0.6, 1.4)) for _ in range(10)]
        for s in SERVICES
    }

    # Generate arrivals inside the service window 09:30-16:00 (first/last hour are partial)
    for hour in range(OPEN_MIN // 60, (CLOSE_MIN + 59) // 60):
        lo = max(hour * 60, OPEN_MIN)
        hi = min(hour * 60 + 60, CLOSE_MIN)
        if hi <= lo:
            continue
        h_mult = hour_traffic(hour)
        lam = branch["base_traffic"] * h_mult * day_mult * 8 * (hi - lo) / 60  # ~8 per base hour
        n_arrivals = max(0, rng.poisson(lam))

        for _ in range(n_arrivals):
            created_at = rng.uniform(lo, hi)

            svc_code = str(rng.choice(svc_codes, p=svc_weights))
            svc = svc_by_code[svc_code]

            # 35% try to book online, 65% walk-in
            entry_type = 0 if rng.random() < 0.35 else 1

            slot_start = None
            slot_end = None
            queue_eligible_at = created_at
            checkin_at = created_at  # walk-in: check-in = ticket creation

            if entry_type == 0:
                # Slot aligned to opening time; clamp to the last bookable slot
                slot_idx = min(int((created_at - OPEN_MIN) // slot_dur), last_slot_idx)
                # Online capacity: OnlineSlotsPerSlot per service per slot; when full, the customer walks in
                if online_used.get((svc_code, slot_idx), 0) >= online_cap[svc_code]:
                    entry_type = 1
                else:
                    online_used[(svc_code, slot_idx)] = online_used.get((svc_code, slot_idx), 0) + 1

            if entry_type == 0:  # OnlineBooked
                # Online booking: created_at = booking time (hours earlier) -> CreatedAt FIFO priority
                booking_hours_before = rng.exponential(4)
                actual_created = created_at - booking_hours_before * 60
                slot_start = OPEN_MIN + slot_idx * slot_dur
                slot_end = slot_start + slot_dur
                created_at = actual_created  # booking time

                checked_in = rng.random() < 0.88
                # ~8% abandon (never check in or leave before called)
                abandoned = not checked_in and rng.random() < 0.6
                if checked_in:
                    # Arrival relative to slot start: 80% early (0-20 min), 20% late (0-15 min)
                    offset = -rng.uniform(0, 20) if rng.random() < 0.8 else rng.uniform(0, 15)
                    checkin_at = slot_start + offset
                    # Eligible once physically checked in AND early-call window has opened
                    queue_eligible_at = max(checkin_at, slot_start - early_call)
                else:
                    checkin_at = None
                    queue_eligible_at = slot_start  # never served; dropped in cleaning
            else:  # WalkIn
                checked_in = True
                abandoned = rng.random() < 0.05  # 5% walk-ins abandon

            ticket_id += 1
            tickets.append(Ticket(
                ticket_id=ticket_id,
                branch_code=branch["BranchCode"],
                service_code=svc_code,
                prefix=svc["prefix"],
                default_avg_min=svc["avg_min"],
                online_slots_per_slot=online_cap[svc_code],  # = capacity actually enforced above
                entry_type=entry_type,
                checked_in=checked_in,
                created_at=created_at,
                slot_start=slot_start,
                slot_end=slot_end,
                queue_eligible_at=queue_eligible_at,
                abandoned=abandoned,
                enqueue_seq=0,
                checkin_at=checkin_at,
            ))

    if not tickets:
        return []

    # EnqueueSequence: per branch-day across all services, ranked by CreatedAt (booking time for online,
    # take-number time for walk-in), ticket_id tiebreak. Same definition as live WaitTimeFeatureBuilder.
    for rank, t in enumerate(sorted(tickets, key=lambda x: (x.created_at, x.ticket_id)), start=1):
        t.enqueue_seq = rank

    # ── Discrete-event Call Next drain ──
    # Simulate counters pulling tickets in CreatedAt FIFO order (matching QueueCallNextSelector)
    waiting = [t for t in tickets if not t.abandoned]
    # For online: only eligible when checkin_at <= now and slot_start - early_call <= now
    # For walk-in: eligible when checked_in

    def rolling_avg(prefix: str, before: float | None = None) -> float:
        """Rolling avg of last 30 completed durations, optionally filtered to completions before a given time."""
        entries = completed_durations[prefix]
        if before is not None:
            entries = [(t, d) for t, d in entries if t <= before]
        durations = [d for _, d in entries[-30:]]
        return float(np.mean(durations)) if durations else 10.0

    def is_eligible(t: Ticket, now: float) -> bool:
        if t.serving_started_at is not None or t.abandoned:
            return False
        if t.entry_type == 1:  # walk-in
            # Walk-in only exists after they arrive (created_at = arrival time)
            return t.checked_in and t.created_at <= now
        # online
        if not t.checked_in or t.slot_start is None or t.checkin_at is None:
            return False
        # Must be physically checked in and within the early-call window
        return t.checkin_at <= now and (t.slot_start - early_call) <= now

    def get_eligible_pool(now: float) -> list[Ticket]:
        return [t for t in waiting if is_eligible(t, now) and t.serving_started_at is None]

    # Event-driven: find next counter free time, pull ticket
    current_time = float(OPEN_MIN)
    end_time = float(DRAIN_END_MIN)

    for c in counters:
        c.free_at = current_time

    guard = 0
    max_iterations = len(waiting) * 3 + 1000

    while guard < max_iterations:
        guard += 1

        # Find earliest free counter
        earliest_counter = min(counters, key=lambda c: c.free_at)
        now = earliest_counter.free_at

        if now > end_time:
            break

        # Find eligible tickets for this counter's prefixes
        pool = [t for t in get_eligible_pool(now)
                if t.prefix in earliest_counter.allowed_prefixes]

        if not pool:
            # No eligible tickets — advance time to the next moment something can become eligible
            next_eligible_time = end_time
            for t in waiting:
                if t.serving_started_at is not None or t.abandoned:
                    continue
                if t.entry_type == 0 and t.checked_in and t.slot_start is not None:
                    eligible_at = max(t.checkin_at, t.slot_start - early_call)
                    if eligible_at > now:
                        next_eligible_time = min(next_eligible_time, eligible_at)

            if next_eligible_time >= end_time:
                # Check if any other counter still has work
                all_free = all(c.free_at <= now for c in counters)
                if all_free:
                    break
                else:
                    earliest_counter.free_at = now + 1  # advance 1 min
                    continue

            earliest_counter.free_at = next_eligible_time
            continue

        # CreatedAt FIFO: pick earliest CreatedAt (matching QueueCallNextSelector)
        pool.sort(key=lambda t: (t.created_at, t.ticket_id))
        ticket = pool[0]

        # Service this ticket
        service_duration = ticket.default_avg_min * rng.uniform(0.5, 1.8)
        # Occasionally a "difficult customer" — long service
        if rng.random() < 0.03:
            service_duration *= rng.uniform(2.0, 4.0)

        ticket.serving_started_at = now  # counter picks the ticket = CalledAt (target end point)
        ticket.service_end_at = now + service_duration  # record actual end time
        earliest_counter.free_at = now + service_duration
        earliest_counter.currently_serving = ticket

        # Track completed duration for rolling avg (with completion time for temporal filtering)
        completed_durations[ticket.prefix].append((now + service_duration, service_duration))

    # ── Build snapshot rows for each served ticket ──
    # Snapshot at queue_eligible_at (when the person starts waiting)
    rows: list[dict] = []
    served_tickets = [t for t in tickets if t.serving_started_at is not None]

    for t in served_tickets:
        snap_time = t.queue_eligible_at
        hour = int(snap_time // 60)
        if hour < 0 or hour > 23:
            hour = max(0, min(23, hour))

        is_peak = 1 if (9 <= hour <= 11 or 14 <= hour <= 16) else 0

        # Queue state at snapshot time
        same_svc_waiting = [
            o for o in tickets
            if o.service_code == t.service_code
            and not o.abandoned
            and o.queue_eligible_at <= snap_time
            and (o.serving_started_at is None or o.serving_started_at > snap_time)
        ]
        queue_length = len(same_svc_waiting)

        # NowServing: tickets being served at snapshot time for this service.
        # Uses actual service_end_at (observable: counter is busy) instead of
        # default_avg_min * 1.2 estimate which would be a data leak.
        now_serving = sum(
            1 for o in tickets
            if o.service_code == t.service_code
            and o.serving_started_at is not None
            and o.service_end_at is not None
            and o.serving_started_at <= snap_time
            and o.service_end_at > snap_time
        )

        # Counter counts
        active_counters = len(counters)
        svc_eligible_counters = sum(
            1 for c in counters if t.prefix in c.allowed_prefixes
        )

        # Rolling avg at snapshot time (only completions before snap_time — no future leakage)
        roll_avg = rolling_avg(t.prefix, before=snap_time)

        # Slot features
        slot_duration = slot_dur
        minutes_since_slot_start = None
        minutes_until_slot_end = None
        online_booked_in_slot = 0
        walkin_in_slot = 0
        slot_active = 0

        if t.slot_start is not None and t.slot_end is not None:
            minutes_since_slot_start = max(0.0, snap_time - t.slot_start)
            minutes_until_slot_end = max(0.0, t.slot_end - snap_time)
            slot_active = 1 if t.slot_start <= snap_time < t.slot_end else 0

            # Count others in same slot
            for o in tickets:
                if (o.service_code == t.service_code
                        and o.slot_start == t.slot_start
                        and o.slot_end == t.slot_end
                        and not o.abandoned):
                    if o.entry_type == 0:
                        online_booked_in_slot += 1
                    else:
                        walkin_in_slot += 1
        else:
            # Walk-in: slot features are NaN (HistGBR handles natively)
            slot_duration = slot_dur  # branch-level, always known
            minutes_since_slot_start = None
            minutes_until_slot_end = None

        # CallNextPriority: P0 if online + checked_in + slot active
        call_priority = 0 if (t.entry_type == 0 and t.checked_in and slot_active == 1) else 1

        # Heard lanes S: union of the prefixes of every counter that can serve my prefix (includes mine).
        # Fallback S = {my prefix} if no counter serves it (live CallNextQueueMath does the same).
        heard_prefixes = set()
        for c in counters:
            if t.prefix in c.allowed_prefixes:
                heard_prefixes.update(c.allowed_prefixes)
        if not heard_prefixes:
            heard_prefixes = {t.prefix}
        # Waiting in S at snap time: queue-eligible and not yet picked by a counter
        heard_waiting = [
            o for o in tickets
            if o.prefix in heard_prefixes
            and not o.abandoned
            and o.queue_eligible_at <= snap_time
            and (o.serving_started_at is None or o.serving_started_at > snap_time)
        ]
        cross_lane = len(heard_waiting)

        # PeopleAheadCallNext (cross-lane): tickets in S that are Call Next eligible at snap time and that a
        # counter would pick before me by the pick key (created_at, ticket_id), which equals the live
        # QueueCallNextSelector key (CreatedAt, Id). Eligible at snap = checked in, not abandoned,
        # queue_eligible_at <= snap_time (excludes un-checked-in online bookings), not yet picked.
        # NOTE: the old code used is_eligible(o, snap_time), which returns False for any ticket the drain
        # later served, so PeopleAheadCallNext was always 0 in the training data.
        my_key = (t.created_at, t.ticket_id)
        people_ahead = sum(
            1 for o in heard_waiting
            if o is not t
            and o.checked_in
            and (o.created_at, o.ticket_id) < my_key
        )

        # Target: CalledAt (counter pick) - QueueEligibleAt
        wait_min = t.serving_started_at - t.queue_eligible_at

        rows.append({
            # Queue state
            "QueueLength": queue_length,
            "CrossLaneQueueLength": cross_lane,
            "PeopleAheadCallNext": people_ahead,
            "NowServing": now_serving,
            # Capacity
            "ActiveCounters": active_counters,
            "ListeningCounters": svc_eligible_counters,
            # Time
            "HourOfDay": hour,
            "DayOfWeek": day_of_week,
            "IsPeakHour": is_peak,
            # Service duration
            "DefaultAvgServiceMinutes": t.default_avg_min,
            "RollingAvgServiceMinutes": round(roll_avg, 2),
            # Entry
            "EnqueueSequence": t.enqueue_seq,
            "EntryType": t.entry_type,
            "CheckedIn": 1 if t.checked_in else 0,
            # Slot features
            "SlotActive": slot_active,
            "CallNextPriority": call_priority,
            "SlotDurationMinutes": slot_duration,
            "EarlyCallMinutes": early_call,
            "MinutesUntilSlotEnd": minutes_until_slot_end,
            "MinutesSinceSlotStart": minutes_since_slot_start,
            "OnlineSlotsPerSlot": t.online_slots_per_slot,
            "OnlineBookedInSlot": online_booked_in_slot,
            "WalkInInSlot": walkin_in_slot,
            # Identity
            "BranchCode": t.branch_code,
            "ServiceCode": t.service_code,
            "TicketPrefix": t.prefix,
            # Target
            "WaitingMinutes": round(wait_min, 2),
        })

    # Also emit abandoned tickets (for training cleaning practice)
    for t in tickets:
        if t.abandoned:
            rows.append({
                "QueueLength": 0,
                "CrossLaneQueueLength": 0,
                "PeopleAheadCallNext": 0,
                "NowServing": 0,
                "ActiveCounters": len(counters),
                "ListeningCounters": sum(1 for c in counters if t.prefix in c.allowed_prefixes),
                "HourOfDay": int(t.created_at // 60),
                "DayOfWeek": day_of_week,
                "IsPeakHour": 0,
                "DefaultAvgServiceMinutes": t.default_avg_min,
                "RollingAvgServiceMinutes": round(rolling_avg(t.prefix, before=t.created_at), 2),
                "EnqueueSequence": t.enqueue_seq,
                "EntryType": t.entry_type,
                "CheckedIn": 0,
                "SlotActive": 0,
                "CallNextPriority": 1,
                "SlotDurationMinutes": slot_dur,
                "EarlyCallMinutes": early_call,
                "MinutesUntilSlotEnd": None,
                "MinutesSinceSlotStart": None,
                "OnlineSlotsPerSlot": t.online_slots_per_slot,
                "OnlineBookedInSlot": 0,
                "WalkInInSlot": 0,
                "BranchCode": t.branch_code,
                "ServiceCode": t.service_code,
                "TicketPrefix": t.prefix,
                "WaitingMinutes": None,  # abandoned — no service
            })

    return rows
# <<< NB-CELL


def generate(n_rows: int = 30000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    all_rows: list[dict] = []

    # Simulate multiple days across branches until we have enough rows
    day_count = 0
    while len(all_rows) < n_rows:
        for br in BRANCHES:
            if len(all_rows) >= n_rows:
                break
            dow = day_count % 5  # Mon-Fri only
            n_profiles = min(len(PROFILES), max(2, int(rng.integers(3, 7))))
            day_rows = simulate_day(rng, br, dow, n_profiles)
            all_rows.extend(day_rows)
        day_count += 1

    df = pd.DataFrame(all_rows)

    # Winsorize extreme wait times at 99th percentile (instead of hard cap)
    served = df["WaitingMinutes"].notna()
    if served.sum() > 0:
        p99 = df.loc[served, "WaitingMinutes"].quantile(0.99)
        df.loc[served, "WaitingMinutes"] = df.loc[served, "WaitingMinutes"].clip(upper=p99)

    return df


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic QMS seed data (v3)")
    parser.add_argument("--rows", type=int, default=30000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    df = generate(n_rows=args.rows, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)

    served = df[df["WaitingMinutes"].notna()]
    abandoned = df[df["WaitingMinutes"].isna()]

    print(f"Generated {len(df)} rows ({len(served)} served, {len(abandoned)} abandoned) → {args.output}")
    print(f"  Branches: {sorted(df['BranchCode'].unique())}")
    print(f"  Services: {sorted(df['ServiceCode'].unique())}")
    print(f"  Online ratio: {(df['EntryType'] == 0).mean():.1%}")
    print(f"  P0 ratio: {(df['CallNextPriority'] == 0).mean():.1%}")
    if len(served) > 0:
        w = served["WaitingMinutes"]
        print(f"  Wait (served): mean={w.mean():.1f} median={w.median():.1f} "
              f"p95={w.quantile(0.95):.1f} max={w.max():.1f} min")
    print(f"  Features: {len(df.columns)} columns")


if __name__ == "__main__":
    main()
