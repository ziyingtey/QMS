# Multi-Dataset Feature Provenance Matrix

**Date:** 2026-09-14
**Source:** Phase 3.9 Multi-Dataset Validation Strategy
**QGo Feature Schema:** 25 properties (WaitTimeFeatures.cs) + 1 computed (EffectiveAvgServiceMinutes)

---

## Provenance Classification Legend

| Code | Meaning | Description |
|---|---|---|
| **OBSERVED** | Directly available | Field exists in dataset with matching semantics |
| **DERIVED** | Computed from timestamps | Reconstructed from raw timestamps/IDs at snapshot time |
| **PROXY** | Approximate mapping | Available but semantics differ; requires assumption |
| **UNAVAILABLE** | Cannot be obtained | No source data exists in dataset |

---

## Full 25-Feature Provenance Matrix

| # | QGo Feature | Type | A: Anonymous Bank | B: Ogun Nigerian | C: Simulated CC | D: QMS Synthetic | E: QMS_REAL |
|---|---|---|---|---|---|---|---|
| 1 | QueueLength | int | **DERIVED** — count calls with q_start ≤ t and (q_exit > t or outcome pending) at snapshot | UNAVAILABLE | UNAVAILABLE | **OBSERVED** | **OBSERVED** |
| 2 | PeopleAhead | int | **DERIVED** — same-type calls in queue before this call's q_start | UNAVAILABLE | UNAVAILABLE | **OBSERVED** | **OBSERVED** |
| 3 | OnlineQueueLength | int | UNAVAILABLE — no online/walk-in distinction | UNAVAILABLE | UNAVAILABLE | **OBSERVED** | **OBSERVED** |
| 4 | WalkInQueueLength | int | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** | **OBSERVED** |
| 5 | NowServing | int | **DERIVED** — count calls with ser_start ≤ t < ser_exit | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 6 | ActiveCounters | int | **PROXY** — count distinct servers with active service at q_start (proxy: server ≠ counter) | UNAVAILABLE | UNAVAILABLE | **OBSERVED** | **OBSERVED** |
| 7 | ServiceEligibleActiveCounters | int | UNAVAILABLE — no service-type eligibility mapping per server | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 8 | RollingAvgServiceMinutes | double? | **DERIVED** — rolling mean of ser_time for completed calls before q_start (same type, last N or time window) | **DERIVED** — rolling mean of X2 for prior rows in same sheet | **DERIVED** — rolling mean of service_length | **OBSERVED** | **OBSERVED** |
| 9 | DefaultAvgServiceMinutes | int | **DERIVED** — per-type overall average of ser_time across all months | **DERIVED** — per-bank overall average of X2 | **DERIVED** — overall avg service_length | **OBSERVED** | **OBSERVED** |
| 10 | HourOfDay | int | **DERIVED** — hour component of q_start timestamp | **PROXY** — arrival time is integer hour only (e.g., 8 = 8am), no minute precision | **DERIVED** — hour(call_started) | **OBSERVED** | **OBSERVED** |
| 11 | DayOfWeek | int | **OBSERVED** — day.of.week field (string: "sunday"–"saturday") | **OBSERVED** — derived from sheet name (Mon–Fri) | **DERIVED** — from date field | **OBSERVED** | **OBSERVED** |
| 12 | IsPeakHour | bool | **DERIVED** — from empirical arrival rate analysis by hour | **PROXY** — limited precision due to hour-level timestamps | **DERIVED** — from hour | **OBSERVED** | **OBSERVED** |
| 13 | EntryType | int | UNAVAILABLE — all calls are telephone (no online/walk-in) | UNAVAILABLE | UNAVAILABLE | **OBSERVED** | **OBSERVED** |
| 14 | CheckedIn | bool | UNAVAILABLE — no check-in concept | UNAVAILABLE | UNAVAILABLE | **OBSERVED** | **OBSERVED** |
| 15 | EnqueueSequence | long | **DERIVED** — chronological q_start order within date + type | **OBSERVED** — "Number" column per sheet | **OBSERVED** — daily_caller field | **OBSERVED** | **OBSERVED** |
| 16 | SlotDurationMinutes | int | UNAVAILABLE — no slot/booking system | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 17 | MinutesUntilSlotEnd | double? | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 18 | MinutesSinceSlotStart | double? | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 19 | OnlineQuotaPercent | int | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 20 | OnlineBookedInSlot | int | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 21 | WalkInInSlot | int | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 22 | WasPulledForward | bool | UNAVAILABLE — no pull-forward concept | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 23 | PullForwardCount | int | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 24 | BranchCode | int | **PROXY** — single call center, constant value (maps to vru.line) | **OBSERVED** — bank name from filename (FIRST/SECOND/THIRD) | UNAVAILABLE | **OBSERVED** | **OBSERVED** |
| 25 | ServiceCode | string | **OBSERVED** — type field (PS/NW/NE/TT/IN/PE) | UNAVAILABLE — no service differentiation | UNAVAILABLE | **OBSERVED** | **OBSERVED** |
| — | *EffectiveAvgServiceMinutes* | double | *COMPUTED: RollingAvg ?? DefaultAvg* | *COMPUTED* | *COMPUTED* | *COMPUTED* | *COMPUTED* |

---

## Feature Count Summary

| Classification | A: Anonymous Bank | B: Ogun Nigerian | C: Simulated CC | D: QMS Synthetic | E: QMS_REAL |
|---|---|---|---|---|---|
| OBSERVED | 2 | 3 | 1 | 10 | **25** |
| DERIVED | 7 | 2 | 3 | 0 | 0 |
| PROXY | 2 | 1 | 0 | 0 | 0 |
| UNAVAILABLE | 14 | 19 | 21 | 15 | 0 |
| **Total usable** | **11** | **6** | **4** | **10** | **25** |

---

## Target Provenance

| Dataset | Target Field | Definition | Semantic Match to QGo |
|---|---|---|---|
| A: Anonymous Bank | q_time (seconds) | q_exit − q_start (time in telephone queue) | **STRONG** — equivalent to "queue-eligible → service start" |
| B: Ogun Nigerian | X1 (minutes) | Waiting time: arrival → service start | **MODERATE** — same concept, but hour-level arrival time |
| C: Simulated CC | wait_length (seconds) | call_started → call_answered | **MODERATE** — synthetic |
| D: QMS Synthetic | WaitingMinutes | Formula: (QueueLength × AvgSvc / ActiveCounters) + noise | **BY CONSTRUCTION** |
| E: QMS_REAL | ActualWaitingMinutes | ServingStartedAt − InitialQueueEligibleAt | **EXACT** |

### QGo Target Definition
```
ActualWaitingMinutes = ServingStartedAt - InitialQueueEligibleAt
```
- `InitialQueueEligibleAt` is immutable: Online = AssignedSlotStart, Walk-in = CreatedAt
- Pull Forward changes `QueueEligibleAt` but NOT `InitialQueueEligibleAt`
- Known issue: current `train_wait_model.py` uses `CreatedAt` instead of `InitialQueueEligibleAt`

---

## Feature Categories Unavailable in External Datasets

The following QGo-specific feature categories are **unavailable in ALL external datasets** (A, B, C):

| Category | Features | Why Unavailable |
|---|---|---|
| **Online/Walk-in Split** | OnlineQueueLength, WalkInQueueLength, EntryType, CheckedIn | QGo-specific concept; no external dataset has online booking |
| **Slot System** | SlotDurationMinutes, MinutesUntilSlotEnd, MinutesSinceSlotStart, OnlineQuotaPercent, OnlineBookedInSlot, WalkInInSlot | QGo-specific time-slot booking system |
| **Pull Forward** | WasPulledForward, PullForwardCount | QGo-specific queue reordering mechanism |
| **Service Eligibility** | ServiceEligibleActiveCounters | Requires per-counter service mapping (not just server count) |

These 14 features (56% of the schema) can ONLY be validated using QMS Synthetic (D) or QMS_REAL (E) data. This is the primary motivation for the multi-dataset validation strategy.

---

## Dataset Role Assignment (Summary)

| Dataset | Role | Features Used | Target |
|---|---|---|---|
| A: Anonymous Bank | **PRIMARY ML BENCHMARK** — prove ML > Formula | 11 features (2O + 7D + 2P) | q_time/60 |
| B: Ogun Nigerian | **DOMAIN VALIDATION** — verify distributions | 6 features (3O + 2D + 1P) | X1 |
| C: Simulated CC | Pipeline smoke test only | 4 features (1O + 3D) | wait_length/60 |
| D: QMS Synthetic | **PIPELINE VALIDATION** — full schema test | 10 features (10O) | WaitingMinutes |
| E: QMS_REAL | **PRODUCTION MODEL** (future) | 25 features (25O) | ActualWaitingMinutes |

---

## Provenance Certification

| Rule | Status |
|---|---|
| Every feature classified as OBSERVED/DERIVED/PROXY/UNAVAILABLE with derivation method | ✅ |
| No feature classified as DERIVED without specifying the source fields | ✅ |
| PROXY features document the semantic gap | ✅ |
| UNAVAILABLE features explain why | ✅ |
| Target provenance documented for all datasets | ✅ |
| Known discrepancies flagged (CreatedAt vs InitialQueueEligibleAt) | ✅ |
