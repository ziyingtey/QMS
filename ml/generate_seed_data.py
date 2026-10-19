"""
Generate synthetic seed data for QMS wait-time model training.

Discrete-event simulation of Malaysian bank branches matching production logic:
  - Production service codes / names / ticket prefixes / default minutes
    (database/insert-service-types-all-branches.sql + insert-service-queues-all-branches.sql;
    1 service = 1 queue = 1 prefix, e.g. A = Account Opening, D = Deposit, W = Withdraw)
  - Production branch setup: 8 counters per branch (insert-counters-8-closed-per-branch.sql, the manager
    opens counters and assigns their services), 60-min slots aligned to opening time, Mon-Fri 09:30-16:00
    (sometimes other opening hours), OnlineSlotsPerSlot drawn per branch-day per service from 2..8
  - Per branch-day randomized coverage: 1..8 Active counters (1-2 counters often), each counter with a
    realistic grouping, a random subset, a single service or all services; counters may open late, close
    early or take a break; load from very quiet to over capacity
  - CreatedAt FIFO call ordering (matches QueueCallNextSelector), walk-ins + online bookings (early check-in
    before the early-call window, on time, late), walk-ins that left still get called (then missed)
  - Features at snapshot time exactly as live WaitTimeFeatureBuilder + MlHttpWaitTimeEstimator.BuildPayload
    (People Ahead / CrossLane = CallNextQueueMath, RollingAvg = RollingServiceAverage rule,
    CounterSimEtaMinutes = CounterSimulationEstimator, IdleListeningCounters)
  - Snapshot at QueueEligibleAt (walk-in: creation; online: max(CheckInAt, SlotStart - EarlyCall)) with
    target = CalledAt - QueueEligibleAt (= MlTrainingObservation.ActualWaitingMinutes), plus extra
    "display-time" snapshots while the customer waits (also before the early-call window opens) with
    target = CalledAt - snapshot time, because the live ETA is predicted at any moment of the wait

The regions between "# >>> NB-CELL <name>" and "# <<< NB-CELL" are copied verbatim into
ml/QMS_WaitTime_ML_Pipeline.ipynb; edit both together.

Output: ml/data/wait_training.csv

Usage:
    python generate_seed_data.py
    python generate_seed_data.py --rows 40000
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "data" / "wait_training.csv"

# >>> NB-CELL config
# ── Branch & Service configs (matching the production seed scripts in database/) ──

# Real production BranchCodes: insert-branches-from-paste.sql gives 251 branches, BranchCode = 101000 + row.
# Each simulated branch-day draws a random code, so BranchCode carries no simulated signal (live branches
# the simulation never named would otherwise get arbitrary tree splits).
BRANCH_CODE_MIN = 101001
BRANCH_CODE_MAX = 101251

# Branch service window (BRANCH_OPERATING_HOURS seed): Mon-Fri 09:30-16:00. Managers can change the hours
# (Schedule & capacity), so some branch-days use other windows. Slots are aligned to opening time
# (QmsQueueService.AlignSlot anchor) and a booked slot must end by closing time.
OPEN_MIN = 9 * 60 + 30    # 570 = 09:30
CLOSE_MIN = 16 * 60       # 960 = 16:00
HOURS_CHOICES = [  # (open, close) in minutes from midnight, probability
    ((570, 960), 0.80),   # 09:30-16:00 (seed)
    ((570, 990), 0.06),   # 09:30-16:30
    ((540, 1020), 0.05),  # 09:00-17:00
    ((540, 960), 0.04),   # 09:00-16:00
    ((570, 1050), 0.03),  # 09:30-17:30
    ((600, 1080), 0.02),  # 10:00-18:00
]
DRAIN_AFTER_CLOSE_MIN = 90  # open counters keep calling the remaining queue for up to 90 min after closing
SLOT_DURATION = 60          # Branch.SlotDurationMinutes

# Production services: code, name, prefix (SERVICE_QUEUES.TicketPrefix) and DefaultAvgServiceMinutes.
# "weight" = share of arrivals (sim only, jittered per branch-day).
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
ALL_PREFIXES = [s["prefix"] for s in SERVICES]

# Counters: the seed creates 8 Closed counters per branch with no allowed services; the manager opens some
# and ticks their services (COUNTER_ALLOWED_SERVICES). The real groupings are unknown, so each counter gets
# one of: a realistic teller grouping, a random subset, a single service, or all services.
MAX_COUNTERS = 8
N_COUNTER_WEIGHTS = [0.16, 0.16, 0.15, 0.14, 0.12, 0.10, 0.09, 0.08]  # P(1..8 Active counters)
PROFILES = [
    ["D", "W", "Q"],                 # cash teller: deposit, withdraw, customer service
    ["D", "W", "T"],                 # cash teller: deposit, withdraw, ATM/CDM
    ["D", "W"],                      # cash only
    ["L", "C"],                      # credit: loan, credit card
    ["A", "F", "I", "B"],            # sales: account opening, fixed deposit, investment, bancassurance
    ["A", "B"],                      # account opening + bancassurance
    ["A", "F"],                      # account opening + fixed deposit
    ["S", "O", "R"],                 # business banking, online banking, remittance
    ["Q", "T", "O"],                 # customer service desk
    ["D", "W", "L", "C", "Q"],       # multi-skill
    ["A", "D", "W", "F", "Q", "R"],  # universal teller
]
COUNTER_MODE_WEIGHTS = {"profile": 0.40, "random": 0.30, "single": 0.15, "all": 0.15}

# Counter availability changes during the day (manager opens a counter late, closes it early, or a break).
P_COUNTER_LATE_OPEN = 0.20
P_COUNTER_EARLY_CLOSE = 0.12
P_COUNTER_BREAK = 0.25

# Load = arrival rate relative to the open counters' capacity (rho), from very quiet to over capacity.
LOAD_LEVELS = [  # (rho_low, rho_high, probability)
    (0.02, 0.15, 0.18),   # very quiet
    (0.15, 0.45, 0.24),   # quiet
    (0.45, 0.80, 0.30),   # normal
    (0.80, 1.05, 0.20),   # busy
    (1.05, 1.40, 0.08),   # very busy (queue builds up)
]

# Realistic manager settings for Branch.OnlineEarlyCallMinutes (drawn per branch-day)
EARLY_CALL_CHOICES = [0, 5, 10, 15, 20, 30]

# Manager setting ServiceType.OnlineSlotsPerSlot (max online bookings per slot for one service). Drawn per
# branch-day per service, uniform integer 2..8.
ONLINE_SLOTS_MIN = 2
ONLINE_SLOTS_MAX = 8

# RollingAvgServiceMinutes = RollingServiceAverage rule (C#): mean of the last 30 completed services of the
# service with completion <= snapshot, ignoring durations < 30 s; fewer than 5 valid -> DefaultAvgServiceMinutes.
ROLLING_WINDOW = 30
ROLLING_MIN_SAMPLES = 5
ROLLING_MIN_DURATION_MIN = 0.5
HISTORY_MODE_WEIGHTS = {"none": 0.30, "few": 0.20, "full": 0.50}  # SERVICE_LOGS before the day starts

# Teller reaction time between a counter becoming free (or a ticket becoming eligible) and Call Next.
CALL_LATENCY_MEAN_MIN = 0.3
# Walk-ins that left: still Waiting, get called, counter waits / marks Missed (no SERVICE_LOGS row).
P_WALKIN_LEFT = 0.04
# Display-time snapshots: probability of one extra snapshot at a random moment of the wait.
EXTRA_SNAPSHOT_PROB = 0.35
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
    slot_start: float | None = None  # online: booked slot; walk-in: assigned bucket (AssignedSlotStart)
    slot_end: float | None = None
    checkin_at: float | None = None  # physical check-in (online) / created_at (walk-in)
    queue_eligible_at: float | None = None  # walk-in = created_at, online = max(checkin_at, slot_start - early_call)
    left: bool = False  # walk-in left before being called (still Waiting, gets called then Missed)
    called_at: float | None = None  # CalledAt: a counter picks the ticket (target end point)
    service_end_at: float | None = None  # counter becomes free again
    counter_id: int | None = None
    enqueue_seq: int = 0  # per branch-day rank by (created_at, ticket_id), across all services


@dataclass
class Counter:
    """A simulated service counter (Active while inside one of its intervals)."""
    counter_id: int
    allowed_prefixes: list[str]
    intervals: list[tuple[float, float]] = field(default_factory=list)
    next_free: float = 0.0
    retired: bool = False

    def is_active(self, t: float) -> bool:
        return any(a <= t < b for a, b in self.intervals)


def hour_traffic(hour: int) -> float:
    return {8: 0.8, 9: 1.4, 10: 1.6, 11: 1.3, 12: 0.7, 13: 0.8, 14: 1.3, 15: 1.5, 16: 1.2, 17: 0.9}.get(hour, 0.5)


def day_traffic(dow: int) -> float:
    # 0=Mon..4=Fri, 5=Sat, 6=Sun (python weekday; live WaitTimeFeatureBuilder uses the same encoding)
    return {0: 1.25, 1: 1.0, 2: 0.95, 3: 0.95, 4: 1.15}.get(dow, 0.0)
# <<< NB-CELL


# >>> NB-CELL simulate
def rolling_avg_service_minutes(history: list[tuple[float, float]], at: float, default_min: float) -> float:
    """RollingAvgServiceMinutes (same rule as C# RollingServiceAverage).

    history = (completion_time, duration_min) of completed services of this service (SERVICE_LOGS).
    Mean of the last ROLLING_WINDOW completions <= at whose duration >= 30 s; fewer than
    ROLLING_MIN_SAMPLES valid ones -> the service's DefaultAvgServiceMinutes.
    """
    valid = sorted((t, d) for t, d in history if t <= at and d >= ROLLING_MIN_DURATION_MIN)
    last = [d for _, d in valid[-ROLLING_WINDOW:]]
    if len(last) < ROLLING_MIN_SAMPLES:
        return float(default_min)
    return float(np.mean(last))


def is_waiting(o: Ticket, snap: float) -> bool:
    """Call Next eligible and not yet called at snap (live CallNextQueueMath.EligibleWaiting).

    Walk-in: created (checked in on creation). Online: checked in and SlotStart - EarlyCall <= snap,
    i.e. queue_eligible_at <= snap. Walk-ins that left are still Waiting until called.
    """
    return (o.checked_in and o.queue_eligible_at is not None and o.queue_eligible_at <= snap
            and (o.called_at is None or o.called_at > snap))


def heard_lanes(prefix: str, active: list[Counter]) -> tuple[list[set[str]], set[str]]:
    """Listening counters' prefix sets and the heard lane set S (live CallNextQueueMath.ResolveHeardLanesAsync).

    Only Active counters count. A counter listens to my prefix if its allowed_prefixes contain it.
    S = union of the listening counters' prefixes (includes mine); S = {my prefix} if no counter serves it.
    """
    listening = [set(c.allowed_prefixes) for c in active if prefix in c.allowed_prefixes]
    heard = set().union(*listening) if listening else {prefix}
    return listening, heard


def people_ahead_call_next(t: Ticket, waiting: list[Ticket], listening: list[set[str]]) -> int:
    """PeopleAheadCallNext (live CallNextQueueMath.CountPeopleAheadAsync).

    For each listening counter, the waiting tickets in THAT counter's prefixes picked before me by
    (created_at, ticket_id) (= live (CreatedAt, Id)); minimum over the counters. If no Active counter serves
    my prefix, same-prefix tickets only. Example: counter1 {A,B}, counter2 {B}; A001, A002, A003, B001 ->
    B001 = min(3, 0) = 0.
    """
    my_key = (t.created_at, t.ticket_id)
    ahead = [o.prefix for o in waiting if o is not t and (o.created_at, o.ticket_id) < my_key]
    if not listening:
        return sum(1 for p in ahead if p == t.prefix)
    return min(sum(1 for p in ahead if p in lanes) for lanes in listening)


def counter_sim_eta(t: Ticket, tickets: list[Ticket], active: list[Counter], snap: float,
                    avg_by_prefix: dict[str, float], early_call: int) -> float | None:
    """CounterSimEtaMinutes: deterministic Call Next drain (live CounterSimulationEstimator).

    Active counters only; None (= live infinity -> null) if no Active counter serves my prefix.
    Counter busy with a Called/Serving ticket -> free after max(0, avg(that service) - elapsed); idle -> 0.
    Waiting tickets in the counters' services plus me are drained: the counter that is free first takes
    the earliest (created_at, ticket_id) ticket of its services and stays busy for avg(service) minutes.
    Result = max(time my ticket is taken, minutes until my own eligibility), avg = RollingAvg rule.
    Only tickets ahead of me matter: a counter whose next ticket is after me never takes one ahead of me.
    """
    all_prefixes = set().union(*[set(c.allowed_prefixes) for c in active]) if active else set()
    if t.prefix not in all_prefixes:
        return None
    free_at: dict[int, float] = {}
    for c in active:
        busy = [o for o in tickets if o.counter_id == c.counter_id and o.called_at is not None
                and o.called_at <= snap < o.service_end_at]
        free_at[c.counter_id] = max(0.0, avg_by_prefix[busy[0].prefix] - (snap - busy[0].called_at)) if busy else 0.0
    my_key = (t.created_at, t.ticket_id)
    queue = sorted((o for o in tickets
                    if o is not t and o.prefix in all_prefixes and is_waiting(o, snap)
                    and (o.created_at, o.ticket_id) < my_key),
                   key=lambda o: (o.created_at, o.ticket_id))
    queue.append(t)
    taken: set[int] = set()
    lanes = {c.counter_id: set(c.allowed_prefixes) for c in active}
    result = None
    for _ in range(2000):
        best_c, best_ticket, best_free = None, None, float("inf")
        for c in active:
            head = next((o for o in queue if o.ticket_id not in taken and o.prefix in lanes[c.counter_id]), None)
            if head is None:
                continue
            f = free_at[c.counter_id]
            if f < best_free or (abs(f - best_free) < 1e-9 and best_ticket is not None
                                 and head.created_at < best_ticket.created_at):
                best_c, best_ticket, best_free = c.counter_id, head, f
        if best_ticket is None:
            return None
        if best_ticket is t:
            result = max(0.0, best_free)
            break
        taken.add(best_ticket.ticket_id)
        free_at[best_c] = best_free + avg_by_prefix[best_ticket.prefix]
    if result is None:
        result = 0.0
    my_eligible = t.queue_eligible_at if t.queue_eligible_at is not None else (t.slot_start or snap) - early_call
    return max(result, my_eligible - snap)


def build_counters(rng: np.random.Generator, open_min: int, close_min: int) -> list[Counter]:
    """1..8 Active counters with randomized services and availability intervals."""
    n = int(rng.choice(np.arange(1, MAX_COUNTERS + 1), p=np.array(N_COUNTER_WEIGHTS) / sum(N_COUNTER_WEIGHTS)))
    modes = list(COUNTER_MODE_WEIGHTS)
    mode_p = np.array([COUNTER_MODE_WEIGHTS[m] for m in modes])
    end_all = close_min + DRAIN_AFTER_CLOSE_MIN
    counters = []
    for i in range(n):
        mode = str(rng.choice(modes, p=mode_p / mode_p.sum()))
        if mode == "profile":
            allowed = list(PROFILES[int(rng.integers(len(PROFILES)))])
        elif mode == "random":
            k = int(rng.integers(2, len(ALL_PREFIXES)))
            allowed = [str(p) for p in rng.choice(ALL_PREFIXES, size=k, replace=False)]
        elif mode == "single":
            allowed = [str(rng.choice(ALL_PREFIXES))]
        else:
            allowed = list(ALL_PREFIXES)
        start, end = float(open_min), float(end_all)
        if i > 0 and rng.random() < P_COUNTER_LATE_OPEN:  # counter 0 opens with the branch
            start = open_min + rng.uniform(15, 180)
        if rng.random() < P_COUNTER_EARLY_CLOSE:
            end = rng.uniform(max(start + 60, open_min + 120), close_min)
        intervals = [(start, end)]
        if rng.random() < P_COUNTER_BREAK and end - start > 120:
            b0 = rng.uniform(start + 30, end - 60)
            intervals = [(start, b0), (b0 + rng.uniform(10, 60), end)]
        counters.append(Counter(counter_id=i, allowed_prefixes=allowed, intervals=intervals))
    return counters


def snapshot_row(t: Ticket, snap: float, tickets: list[Ticket], counters: list[Counter],
                 history: dict[str, list[tuple[float, float]]], ctx: dict) -> dict:
    """Features of ticket t at snap, computed exactly like live WaitTimeFeatureBuilder + BuildPayload."""
    hour = max(0, min(23, int(snap // 60)))
    active = [c for c in counters if c.is_active(snap)]
    listening, heard = heard_lanes(t.prefix, active)
    listening_counters = [c for c in active if t.prefix in c.allowed_prefixes]
    waiting = [o for o in tickets if is_waiting(o, snap)]
    in_service = [o for o in tickets if o.called_at is not None and o.called_at <= snap < o.service_end_at]
    busy_counter_ids = {o.counter_id for o in in_service}
    avg_by_prefix = {s["prefix"]: rolling_avg_service_minutes(history[s["prefix"]], snap, s["avg_min"])
                     for s in SERVICES}
    sim_eta = counter_sim_eta(t, tickets, active, snap, avg_by_prefix, ctx["early_call"])

    is_online = t.entry_type == 0
    minutes_since_slot_start = None
    minutes_until_slot_end = None
    online_booked_in_slot = 0
    walkin_in_slot = 0
    slot_active = 0
    if is_online and t.slot_start is not None:
        minutes_since_slot_start = max(0.0, snap - t.slot_start)
        minutes_until_slot_end = max(0.0, t.slot_end - snap)
        slot_active = 1 if t.slot_start <= snap < t.slot_end else 0
        # Live: same service and same AssignedSlotStart/End, any state except Missed (tickets that exist at snap)
        for o in tickets:
            if o.service_code == t.service_code and o.slot_start == t.slot_start and o.created_at <= snap:
                if o.entry_type == 0:
                    online_booked_in_slot += 1
                else:
                    walkin_in_slot += 1
    call_priority = 0 if (is_online and t.checked_in and slot_active == 1) else 1
    listening_n = len(listening_counters)
    return {
        # Queue state
        "QueueLength": sum(1 for o in waiting if o.service_code == t.service_code),
        "CrossLaneQueueLength": sum(1 for o in waiting if o.prefix in heard),
        "PeopleAheadCallNext": people_ahead_call_next(t, waiting, listening),
        "NowServing": sum(1 for o in in_service if o.service_code == t.service_code),
        # Capacity (BuildPayload: ActiveCounters >= 1; ListeningCounters = listening, else ActiveCounters, >= 1)
        "ActiveCounters": max(1, len(active)),
        "ListeningCounters": max(1, listening_n if listening_n > 0 else len(active)),
        "IdleListeningCounters": sum(1 for c in listening_counters if c.counter_id not in busy_counter_ids),
        "CounterSimEtaMinutes": None if sim_eta is None else round(sim_eta, 2),
        # Time
        "HourOfDay": hour,
        "DayOfWeek": ctx["dow"],
        "IsPeakHour": 1 if (9 <= hour <= 11 or 14 <= hour <= 16) else 0,
        # Service duration
        "DefaultAvgServiceMinutes": t.default_avg_min,
        "RollingAvgServiceMinutes": round(avg_by_prefix[t.prefix], 2),
        # Entry
        "EnqueueSequence": t.enqueue_seq,
        "EntryType": t.entry_type,
        "CheckedIn": 1 if t.checked_in else 0,
        # Slot features (walk-ins: NaN / 0 like live)
        "SlotActive": slot_active,
        "CallNextPriority": call_priority,
        "SlotDurationMinutes": SLOT_DURATION,
        "EarlyCallMinutes": ctx["early_call"],
        "MinutesUntilSlotEnd": minutes_until_slot_end,
        "MinutesSinceSlotStart": minutes_since_slot_start,
        "OnlineSlotsPerSlot": t.online_slots_per_slot,
        "OnlineBookedInSlot": online_booked_in_slot,
        "WalkInInSlot": walkin_in_slot,
        # Identity
        "BranchCode": t.branch_code,
        "ServiceCode": t.service_code,
        "TicketPrefix": t.prefix,
        # Target: CalledAt - snapshot (snapshot = QueueEligibleAt for the primary row)
        "WaitingMinutes": None if t.called_at is None else round(t.called_at - snap, 2),
    }


def simulate_day(rng: np.random.Generator, day_of_week: int) -> list[dict]:
    """Simulate one branch-day (randomized setup) with a discrete-event Call Next drain."""
    day_mult = day_traffic(day_of_week)
    if day_mult == 0:
        return []
    svc_by_prefix = {s["prefix"]: s for s in SERVICES}
    branch_code = int(rng.integers(BRANCH_CODE_MIN, BRANCH_CODE_MAX + 1))
    hours_p = np.array([p for _, p in HOURS_CHOICES])
    open_min, close_min = HOURS_CHOICES[int(rng.choice(len(HOURS_CHOICES), p=hours_p / hours_p.sum()))][0]
    end_time = float(close_min + DRAIN_AFTER_CLOSE_MIN)
    n_slots = (close_min - open_min) // SLOT_DURATION  # a slot must end by closing time
    early_call = int(rng.choice(EARLY_CALL_CHOICES))
    online_cap = {s["code"]: int(rng.integers(ONLINE_SLOTS_MIN, ONLINE_SLOTS_MAX + 1)) for s in SERVICES}
    counters = build_counters(rng, open_min, close_min)
    covered = sorted(set().union(*[set(c.allowed_prefixes) for c in counters]))

    # Branch-day service speed (true mean = default x speed) and arrival mix over the covered services
    speed = {p: float(rng.lognormal(0.0, 0.2)) for p in ALL_PREFIXES}
    w = np.array([svc_by_prefix[p]["weight"] * rng.lognormal(0.0, 0.5) for p in covered])
    w /= w.sum()
    svc_mean = float(sum(wi * svc_by_prefix[p]["avg_min"] * speed[p] for wi, p in zip(w, covered)))
    lv_p = np.array([p for _, _, p in LOAD_LEVELS])
    lo_r, hi_r, _ = LOAD_LEVELS[int(rng.choice(len(LOAD_LEVELS), p=lv_p / lv_p.sum()))]
    rho = rng.uniform(lo_r, hi_r)
    online_frac = rng.uniform(0.05, 0.6)
    hours = list(range(open_min // 60, (close_min + 59) // 60))
    h_norm = float(np.mean([hour_traffic(h) for h in hours]))

    # SERVICE_LOGS history before the day: none (fallback to default), a few (< 5 valid), or full; plus
    # seconds-long test services that the rule ignores.
    hist_modes = list(HISTORY_MODE_WEIGHTS)
    hist_p = np.array([HISTORY_MODE_WEIGHTS[m] for m in hist_modes])
    history: dict[str, list[tuple[float, float]]] = {}
    for s in SERVICES:
        mode = str(rng.choice(hist_modes, p=hist_p / hist_p.sum()))
        n_prior = 0 if mode == "none" else int(rng.integers(1, 5)) if mode == "few" else int(rng.integers(10, 41))
        true_mean = s["avg_min"] * speed[s["prefix"]]
        entries = [(-1.0, true_mean * float(rng.lognormal(-0.06, 0.35))) for _ in range(n_prior)]
        if rng.random() < 0.3:
            entries += [(-1.0, rng.uniform(2, 25) / 60.0) for _ in range(int(rng.integers(1, 6)))]
        history[s["prefix"]] = entries

    def serves_at(prefix: str, t: float) -> bool:
        return any(prefix in c.allowed_prefixes and c.is_active(t) for c in counters)

    tickets: list[Ticket] = []
    online_used: dict[tuple[str, int], int] = {}
    for hour in hours:
        lo, hi = max(hour * 60, open_min), min(hour * 60 + 60, close_min)
        if hi <= lo:
            continue
        n_open = max(0.5, sum(1 for c in counters if c.is_active((lo + hi) / 2)))
        lam = rho * hour_traffic(hour) / h_norm * day_mult * n_open * (hi - lo) / svc_mean
        for _ in range(int(rng.poisson(lam))):
            arrive = rng.uniform(lo, hi)
            prefix = str(rng.choice(covered, p=w))
            svc = svc_by_prefix[prefix]
            code = svc["code"]
            entry_type = 0 if (rng.random() < online_frac and n_slots > 0) else 1
            slot_idx = min(int((arrive - open_min) // SLOT_DURATION), n_slots - 1)
            if entry_type == 0:
                if online_used.get((code, slot_idx), 0) >= online_cap[code]:
                    entry_type = 1  # slot full -> walks in
                else:
                    online_used[(code, slot_idx)] = online_used.get((code, slot_idx), 0) + 1
            if entry_type == 0:
                slot_start = float(open_min + slot_idx * SLOT_DURATION)
                created = arrive - rng.exponential(4) * 60  # booking time, hours earlier
                checked_in = rng.random() < 0.9
                checkin_at = eligible = None
                if checked_in:
                    u = rng.random()
                    if u < 0.2:     # very early: before the early-call window opens
                        offset = -rng.uniform(20, 60)
                    elif u < 0.75:  # early
                        offset = -rng.uniform(0, 20)
                    else:           # late
                        offset = rng.uniform(0, 40)
                    checkin_at = max(open_min - 30.0, slot_start + offset)
                    eligible = max(checkin_at, slot_start - early_call)
                tickets.append(Ticket(0, branch_code, code, prefix, svc["avg_min"], online_cap[code], 0,
                                      checked_in, created, slot_start, slot_start + SLOT_DURATION,
                                      checkin_at, eligible))
            else:
                if not serves_at(prefix, arrive):
                    continue  # live WalkInAsync rejects a service with no Active counter
                bucket = float(open_min + int((arrive - open_min) // SLOT_DURATION) * SLOT_DURATION)
                tickets.append(Ticket(0, branch_code, code, prefix, svc["avg_min"], online_cap[code], 1,
                                      True, arrive, bucket, bucket + SLOT_DURATION, arrive, arrive,
                                      left=rng.random() < P_WALKIN_LEFT))
    if not tickets:
        return []
    order = rng.permutation(len(tickets))  # ticket ids = creation order is irrelevant; Id is a GUID live
    for i, t in zip(order, tickets):
        t.ticket_id = int(i) + 1
    for rank, t in enumerate(sorted(tickets, key=lambda x: (x.created_at, x.ticket_id)), start=1):
        t.enqueue_seq = rank

    # ── Discrete-event Call Next drain ──
    callable_tickets = [t for t in tickets if t.queue_eligible_at is not None]
    for c in counters:
        c.next_free = c.intervals[0][0]
    while True:
        live = [c for c in counters if not c.retired]
        if not live:
            break
        c = min(live, key=lambda x: x.next_free)
        now = c.next_free
        if now > end_time:
            c.retired = True
            continue
        if not c.is_active(now):
            later = [a for a, _ in c.intervals if a > now]
            if later:
                c.next_free = min(later)
            else:
                c.retired = True
            continue
        pool = [t for t in callable_tickets
                if t.called_at is None and t.queue_eligible_at <= now and t.prefix in c.allowed_prefixes]
        if not pool:
            future = [t.queue_eligible_at for t in callable_tickets
                      if t.called_at is None and t.queue_eligible_at > now and t.prefix in c.allowed_prefixes]
            if future:
                c.next_free = min(future)
            else:
                c.retired = True
            continue
        t = min(pool, key=lambda x: (x.created_at, x.ticket_id))  # QueueCallNextSelector
        called = now + rng.exponential(CALL_LATENCY_MEAN_MIN)
        if t.left:
            duration = rng.uniform(0.5, 3.0)  # counter waits for the absent customer, then Missed
        else:
            duration = t.default_avg_min * speed[t.prefix] * float(rng.lognormal(-0.06, 0.35))
            if rng.random() < 0.03:
                duration *= rng.uniform(2.0, 3.0)  # difficult customer
        t.called_at = called
        t.service_end_at = called + duration
        t.counter_id = c.counter_id
        c.next_free = called + duration
        if not t.left:
            history[t.prefix].append((called + duration, duration))

    # ── Snapshot rows ──
    ctx = {"dow": day_of_week, "early_call": early_call}
    rows: list[dict] = []
    for t in tickets:
        if t.called_at is None:
            if t.entry_type == 0 and not t.checked_in:  # never checked in: no target (dropped in cleaning)
                row = snapshot_row(t, t.slot_start, tickets, counters, history, ctx)
                row.update({"CheckedIn": 0, "WaitingMinutes": None})
                rows.append(row)
            continue
        rows.append(snapshot_row(t, t.queue_eligible_at, tickets, counters, history, ctx))
        start = t.checkin_at if t.checkin_at is not None else t.queue_eligible_at
        if t.called_at - start > 1.0 and rng.random() < EXTRA_SNAPSHOT_PROB:
            rows.append(snapshot_row(t, rng.uniform(start, t.called_at), tickets, counters, history, ctx))
    return rows


def generate_rows(rng: np.random.Generator, n_rows: int) -> list[dict]:
    """Simulate branch-days (Mon-Fri cycle) until n_rows rows exist."""
    all_rows: list[dict] = []
    day_count = 0
    while len(all_rows) < n_rows:
        all_rows.extend(simulate_day(rng, day_count % 5))
        day_count += 1
    return all_rows
# <<< NB-CELL


def generate(n_rows: int = 30000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame(generate_rows(rng, n_rows))

    # Winsorize extreme wait times at 99th percentile (instead of hard cap)
    served = df["WaitingMinutes"].notna()
    if served.sum() > 0:
        p99 = df.loc[served, "WaitingMinutes"].quantile(0.99)
        df.loc[served, "WaitingMinutes"] = df.loc[served, "WaitingMinutes"].clip(upper=p99)

    return df


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic QMS seed data (v4)")
    parser.add_argument("--rows", type=int, default=30000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    df = generate(n_rows=args.rows, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)

    served = df[df["WaitingMinutes"].notna()]
    abandoned = df[df["WaitingMinutes"].isna()]

    print(f"Generated {len(df)} rows ({len(served)} served, {len(abandoned)} never checked in) → {args.output}")
    print(f"  Branch codes: {df['BranchCode'].nunique()} distinct")
    print(f"  Services: {sorted(df['ServiceCode'].unique())}")
    print(f"  Online ratio: {(df['EntryType'] == 0).mean():.1%}")
    print(f"  P0 ratio: {(df['CallNextPriority'] == 0).mean():.1%}")
    print(f"  ActiveCounters: {served['ActiveCounters'].value_counts().sort_index().to_dict()}")
    if len(served) > 0:
        w = served["WaitingMinutes"]
        print(f"  Wait (served): mean={w.mean():.1f} median={w.median():.1f} "
              f"p95={w.quantile(0.95):.1f} max={w.max():.1f} min")
    print(f"  Features: {len(df.columns)} columns")


if __name__ == "__main__":
    main()
