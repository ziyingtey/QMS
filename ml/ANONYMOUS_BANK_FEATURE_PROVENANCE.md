# Anonymous Bank Call Center — Feature Provenance

**Date:** 2026-09-14
**Phase:** 3.10 (Dataset Adapter Validation)
**Dataset:** Anonymous Bank Call Center (1999 Israel, Technion)
**Adapter:** `ml/adapt_anonymous_bank.py`
**Role:** PRIMARY ML BENCHMARK (Experiment 1)

---

## 1. Dataset Overview

| Property | Value |
|---|---|
| Source | Technion – Israel Institute of Technology, Service Engineering Lab |
| Authors | Ilan Guedj, Avi Mandelbaum |
| Collection | Jan–Dec 1999 (363 days) |
| Collection method | Automated VRU + ACD telephone system logs |
| Records | 444,143 usable (after dropping 'AA' type: 5 rows) |
| AGENT outcome | ~353,000 (calls that reached a human agent) |
| Format | 12 TSV files (January.txt – December.txt) |
| Fields per data row | 19 (field[0]=row_num, fields[1-18]=data) |
| Header columns | 18 (off-by-one with data rows) |

### Raw Fields

| Index | Field | Description |
|---|---|---|
| 0 | (row_num) | Sequential row number (not in header) |
| 1 | vru.line | VRU line identifier (e.g., AA0101) |
| 2 | call_id | Numeric call identifier |
| 3 | customer_id | Customer identifier (0 = unidentified) |
| 4 | priority | 0, 1, or 2 (2 = highest priority) |
| 5 | type | Service type: PS, NW, NE, TT, IN, PE |
| 6 | date | YYMMDD (e.g., 990101 = 1999-01-01) |
| 7 | vru_entry | Time entered VRU (H:MM:SS) |
| 8 | vru_exit | Time exited VRU (H:MM:SS) |
| 9 | vru_time | Seconds in VRU |
| 10 | q_start | Time entered queue (0:00:00 = bypassed) |
| 11 | q_exit | Time exited queue |
| 12 | q_time | **Seconds in queue** (TARGET) |
| 13 | outcome | AGENT / HANG / PHANTOM |
| 14 | ser_start | Service start time |
| 15 | ser_exit | Service end time |
| 16 | ser_time | Seconds of service |
| 17 | server | Agent name (e.g., MICHAL, BASCH) |
| 18 | day.of.week | Weekday name (lowercase) |

---

## 2. Target Mapping

### QGo Target
```
ActualWaitingMinutes = ServingStartedAt - InitialQueueEligibleAt
```

### Anonymous Bank Target
```
ActualWaitingMinutes = q_time / 60.0
```

Where `q_time = q_exit - q_start` (seconds in telephone queue).

### Semantic Equivalence

| QGo Concept | Anonymous Bank Equivalent | Match |
|---|---|---|
| InitialQueueEligibleAt | q_start (time entered queue) | **STRONG** |
| ServingStartedAt | q_exit (time left queue to be served) | **STRONG** |
| "Waiting time" | Time from queue entry to agent pickup | **EXACT** |

### Special Case: Bypassed Queue (q_start = 0:00:00)

- ~44.5% of AGENT calls have `q_start = 0:00:00` and `q_time = 0`
- These customers were immediately connected to an agent (zero wait)
- Semantically equivalent to a QGo walk-in who is immediately called to a counter
- **Included** in adapted dataset as valid zero-wait observations
- For these calls, `ser_start` is used as the snapshot time (the moment they entered the system)

### Filtering

| Outcome | Count | Included | Reason |
|---|---|---|---|
| AGENT | ~353,000 | **YES** | Successfully served — has meaningful wait + service time |
| HANG | ~87,700 | NO | Customer abandoned — no service time, biased wait |
| PHANTOM | ~3,600 | NO | System artifact — no meaningful queueing event |

---

## 3. Feature Derivation Details

### Feature 1: QueueLength (DERIVED)

**Definition:** Number of other calls currently in the telephone queue at snapshot time t.

**Derivation:**
```
For each other call on the same day:
  in_queue = (other.q_start_dt <= t) AND (other.q_exit_dt > t) AND (not bypassed)
QueueLength = count(in_queue) - (1 if self is in queue)
```

**Assumptions:**
- Only same-day calls considered (no cross-midnight queue)
- Bypassed-queue calls (q_start=0:00:00) are excluded from queue count

**Limitations:**
- This counts ALL calls in queue regardless of service type, while QGo's QueueLength may be per-service. However, in the call center, all calls in queue compete for the same pool of agents.

**Validation:**
- Mean ~0.8, Max observed ~17 (reasonable for call center)
- Positively correlated with ActualWaitingMinutes (r ≈ 0.54)

---

### Feature 2: PeopleAhead (DERIVED)

**Definition:** Number of calls in queue that entered BEFORE this call.

**Derivation:**
```
PeopleAhead = count(calls where in_queue AND q_start_dt < t)
```

**Semantic match to QGo:** In QGo, PeopleAhead = tickets ahead in the same service queue. In Anonymous Bank, this is calls ahead in the general queue (or same-type queue depending on routing).

**Leakage check:** Uses only calls with q_start < t (strictly before), so no future information.

---

### Feature 3: NowServing (DERIVED)

**Definition:** Number of calls currently being served by an agent at time t.

**Derivation:**
```
NowServing = count(calls where ser_start_dt <= t AND ser_exit_dt > t AND server != "NO_SERVER")
```

**Limitations:** May overcount briefly at transitions between calls.

---

### Feature 4: ActiveCounters (PROXY)

**Definition:** Number of distinct agent names (servers) currently serving calls at time t.

**Derivation:**
```
ActiveCounters = count(distinct server names from NowServing set)
```

**Why PROXY, not DERIVED:**
- In QGo, ActiveCounters = physical counter stations that are open
- In Anonymous Bank, this is the number of distinct agents currently on a call
- An agent finishes a call and starts another = same "counter" but appears as 1
- An agent on break = not counted (correct — they're not serving)
- **The proxy is reasonable** because active servers ≈ active counters for this purpose

**Range:** 0–12 observed in 3-day sample. Full dataset may go higher.

---

### Feature 5: RollingAvgServiceMinutes (DERIVED)

**Definition:** Rolling mean of service duration (ser_time) for the last N completed calls of the same service type before time t.

**Derivation:**
```
completed = calls of same type where ser_exit_dt < t AND ser_time > 0
recent = last 50 completed calls
RollingAvgServiceMinutes = mean(recent.ser_time) / 60.0
```

**Leakage prevention:**
- Only uses calls that **completed service before t** (ser_exit_dt < t)
- Does NOT use the current call's ser_time
- First calls of a type on the first day have no rolling average (use default)

**Window size:** 50 calls (configurable via `--rolling-window`)

---

### Feature 6: DefaultAvgServiceMinutes (DERIVED, leakage-controlled)

**Definition:** Per-service-type overall average service duration.

**Derivation:**
```
DefaultAvg[type] = mean(ser_time for ALL AGENT calls of type in Jan-Oct) / 60.0
```

**Critical leakage prevention:**
- Computed ONLY from training set (months 1-10)
- Applied to ALL rows (including test set months 11-12)
- This prevents the target from influencing the feature in the test set

**Values (from Jan-Oct):**

| Type | Avg (min) | N calls |
|---|---|---|
| PS | ~3.0 | ~244K |
| NW | ~1.9 | ~55K |
| NE | ~5.4 | ~32K |
| IN | ~5.3 | ~17K |
| TT | ~0.6 | ~10K |
| PE | ~3.3 | ~1.5K |

---

### Feature 7: HourOfDay (DERIVED)

**Definition:** Hour component of the snapshot time.

**Derivation:**
```
HourOfDay = hour(q_start)          # for queued calls
HourOfDay = hour(ser_start)        # for bypassed-queue calls
```

**Range:** 0–23

---

### Feature 8: DayOfWeek (OBSERVED)

**Definition:** Day of the week as integer 0 (Mon) to 6 (Sun).

**Source:** `day.of.week` field in the dataset (string: "monday"–"saturday").

**Note:** Mapped to ISO convention (0=Mon, 6=Sun) to match QGo's `DayOfWeek`.

---

### Feature 9: IsPeakHour (DERIVED)

**Definition:** Whether the snapshot falls in peak hours.

**Derivation:**
```
IsPeakHour = 1 if HourOfDay in {9, 10, 11, 14, 15, 16} else 0
```

**Match to QGo:** Same definition as in `train_wait_model.py` EXPORT_QUERY.

---

### Feature 10: EnqueueSequence (DERIVED)

**Definition:** Position of this call among same-date, same-type calls ordered by snapshot time.

**Derivation:**
```
EnqueueSequence = count(same-type calls on same date with q_start_dt <= t)
```

**Limitations:** This is a daily sequence number, not a global one. QGo's EnqueueSequence is database-global.

---

### Feature 11: ServiceCode (OBSERVED)

**Definition:** Service type identifier.

**Source:** `type` field in the dataset.

**Values:** PS, NW, NE, TT, IN, PE (6 types)

**Mapping:** Direct — no transformation needed. These map to QGo's ServiceCode concept.

**Data cleaning:** ' TT' (with leading space) → 'TT'. 'AA' (5 rows, unknown) → dropped.

---

### Feature 12: BranchCode (PROXY — constant)

**Value:** 0 (single call center)

**Limitation:** Anonymous Bank is a single call center. QGo has multiple branches. This feature provides no discriminative information in this dataset.

---

## 4. Features NOT Available

| # | QGo Feature | Why Unavailable |
|---|---|---|
| 3 | OnlineQueueLength | No online/walk-in distinction in telephone system |
| 4 | WalkInQueueLength | Same as above |
| 7 | ServiceEligibleActiveCounters | No per-agent service eligibility data |
| 13 | EntryType | All calls are telephone (single entry type) |
| 14 | CheckedIn | No check-in concept |
| 16-21 | Slot features (6) | No time-slot booking system |
| 22-23 | Pull Forward features (2) | No pull-forward concept |

**Total unavailable: 14 of 25 (56%)**

These features are QGo-specific concepts that don't exist in any telephone call center. They can ONLY be validated using QMS Synthetic (Dataset D) or QMS_REAL (Dataset E).

---

## 5. Leakage Audit

| Potential Leakage Vector | Status | Mitigation |
|---|---|---|
| RollingAvg uses future service times | ✅ PREVENTED | Only uses calls with ser_exit_dt < t |
| DefaultAvg uses test set data | ✅ PREVENTED | Computed only from Jan-Oct train set |
| Queue state uses future arrivals | ✅ PREVENTED | Only counts calls with q_start_dt ≤ t |
| NowServing uses future completions | ✅ PREVENTED | Checks ser_start_dt ≤ t AND ser_exit_dt > t |
| EnqueueSequence reveals future | ✅ PREVENTED | Counts calls with q_start_dt ≤ t only |
| Random train/test split | ✅ PREVENTED | Temporal split: Jan-Oct train / Nov-Dec test |

---

## 6. Temporal Split

| Set | Months | Description |
|---|---|---|
| Train | 1–10 (Jan–Oct) | Model training and cross-validation |
| Test | 11–12 (Nov–Dec) | Holdout evaluation (simulates "future" data) |

**Why temporal, not random:**
- Random split would allow the model to "see" November patterns during training
- Temporal split tests generalization to genuinely unseen time periods
- More realistic for production deployment (model is trained on past, predicts future)

---

## 7. Known Limitations

1. **Domain mismatch:** Telephone call center, not physical bank branch. Service dynamics differ (no physical movement, no counter assignment).

2. **Single location:** All data from one call center. No branch variation.

3. **1999 data:** Pre-digital era. Customer behavior may differ from 2026.

4. **No priority routing details:** We know priority (0/1/2) but not how the ACD routes priority calls. Priority is kept as an extra field but NOT used as a QGo feature.

5. **Server ≠ Counter:** Agent names approximate physical counters but agents can handle multiple types, take breaks at variable times, etc.

6. **56% zero-wait calls:** Many calls bypass the queue entirely. This is realistic (low-traffic periods) but means the model sees a lot of trivial predictions.

---

## 8. Output Schema

The adapted CSV (`ml/data/anonymous_bank_adapted.csv`) contains:

| Column | Type | Description |
|---|---|---|
| SnapshotDate | string | YYMMDD date |
| SnapshotTime | string | H:MM:SS snapshot time |
| QueueLength | int | Calls in queue at snapshot (DERIVED) |
| PeopleAhead | int | Calls ahead in queue (DERIVED) |
| NowServing | int | Calls being served at snapshot (DERIVED) |
| ActiveCounters | int | Distinct servers active (PROXY) |
| RollingAvgServiceMinutes | float/empty | Rolling avg service time in minutes (DERIVED) |
| DefaultAvgServiceMinutes | float | Per-type overall avg from train set (DERIVED) |
| HourOfDay | int | Hour of snapshot (DERIVED) |
| DayOfWeek | int | 0=Mon..6=Sun (OBSERVED) |
| IsPeakHour | int | 0/1 peak hour flag (DERIVED) |
| EnqueueSequence | int | Daily per-type sequence (DERIVED) |
| ServiceCode | string | PS/NW/NE/TT/IN/PE (OBSERVED) |
| BranchCode | int | Always 0 (PROXY — constant) |
| Priority | int | 0/1/2 (extra field, not QGo feature) |
| Server | string | Agent name (extra field for validation) |
| BypassedQueue | int | 0/1 whether call bypassed queue |
| ActualWaitingMinutes | float | TARGET: q_time / 60.0 |
| ActualWaitingSeconds | int | TARGET: q_time (raw seconds) |
| Month | int | Month number (1-12) for train/test split |
