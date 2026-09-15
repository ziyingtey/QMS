# Phase 3: Dataset Evaluation & Data Strategy

## 1. Executive Summary

**Provided files inspected: 18 files across 7 groups.**

- **1 real-world public dataset** — Anonymous Bank Call Center (12 monthly .txt files, 444K call records, 1999 Israeli bank)
- **1 synthetic dataset** — Simulated Call Centre CSV (52K simulated call records, 2021)
- **1 real-world public dataset (limited)** — Nigerian Bank Queue Survey (12 xlsx files, ~54K customer records, 3 banks in Ogun State)
- **3 literature/documentation files** — PDF documentation, 2 RTF research paper supplements
- **1 duplicate** — archive.zip contains same simulated CSV
- **1 supplementary doc** — mmc1.docx (Nigerian bank paper supplement)

**Key finding:** None of these datasets are physical bank branch queue datasets with the feature richness needed for direct QMS training. The Anonymous Bank dataset is the strongest candidate for ML experimentation, but it is a **telephone call center**, not a physical branch queue. The Nigerian bank data is the correct domain (physical bank branch) but has severely limited features (only aggregated waiting/service times per customer, no timestamps, no queue state).

**Recommendation:**
- **PRIMARY**: Anonymous Bank Call Center — use for ML pipeline validation, feature experimentation, and baseline comparison with reduced feature set
- **SECONDARY**: Nigerian Bank Queue Survey — use for domain-relevant distribution analysis only
- **SYNTHETIC/DEV**: Simulated Call Centre — use only for pipeline testing/debugging
- **Production**: QMS_REAL data (collected by the system itself) remains the eventual and most important training source

---

## 2. Dataset Classification Table

| File(s) | Type | Real/Synthetic | Domain | Usable as Dataset? | Recommended Use |
|---------|------|---------------|--------|-------------------|----------------|
| January.txt – December.txt | A. Real public observational | Real | Bank call center (Israel, 1999) | **YES** | PRIMARY — ML experimentation |
| simulated_call_centre.csv | B. Synthetic | Simulated | Generic call center (2021) | YES (limited) | SYNTHETIC — pipeline testing only |
| Supplementary DATA on Queues/*.xlsx | A. Real public observational | Real | Physical bank branch (Nigeria, 2018) | YES (limited) | SECONDARY — distribution analysis |
| "Anonymous Bank" PDF | D. Dataset documentation | N/A | N/A | No | Documentation for January-December dataset |
| ttqm_a_2371715_sm6932.rtf | C. Literature only | N/A | N/A | No | LaTeX source for Markovian arrival process paper |
| ttqm_a_2371715_sm6933.rtf | C. Literature only | N/A | N/A | No | Supplementary material for same paper |
| mmc1.docx | E. Supplementary material | N/A | N/A | No | Supplementary doc for Nigerian bank paper |
| archive.zip | F. Duplicate | Simulated | Generic call center | No | Contains identical simulated_call_centre.csv |
| PMC Paper (inline text) | C. Literature only | N/A | N/A | No | Published paper describing Nigerian bank survey methodology |

---

## 3. Dataset-by-Dataset Inspection

### 3A. Anonymous Bank Call Center Dataset (January.txt – December.txt)

**Source:** "Anonymous Bank" (Israeli commercial bank), collected Jan–Dec 1999
**Published by:** Ilan Guedj & Avi Mandelbaum, Technion
**Domain:** Bank telephone call center (NOT physical branch queue)

| Property | Value |
|----------|-------|
| Total rows | 444,448 |
| Columns | 18 (header) / 19 (data — off-by-one, field 0 is row index) |
| Time coverage | 363 days (Jan 1 – Dec 31, 1999) |
| Missing values | q_start/q_exit = "0:00:00" when no queue (bypassed); ser_start/ser_exit = "0:00:00" for HANG/PHANTOM |
| Unique dates | 363 |
| Unique servers (agents) | 52 |
| Call types | PS=302K, NW=68K, NE=39K, IN=21K, TT=12K, PE=2K |
| Outcomes | AGENT=353K (79.5%), HANG=88K (19.7%), PHANTOM=4K (0.8%) |
| Customer IDs | Available (bank account numbers, 0 = unidentified) |
| Priority levels | 0 (regular), 1 (VIP), 2 (regular with ID) |

**Important columns (corrected for off-by-one):**

| Field Index | Column Name | Meaning | Data Type | Useful for QMS? |
|-------------|-------------|---------|-----------|-----------------|
| 0 | (row_num) | Sequential row number per VRU line | int | No |
| 1 | vru_line | VRU line identifier (e.g., AA0101) | string | No (call center specific) |
| 2 | call_id | Sequential call ID | int | Unique ID |
| 3 | customer_id | Bank account number (0=unidentified) | int | Customer identity |
| 4 | priority | 0/1/2 customer priority | int | Partial — maps roughly to EntryType |
| 5 | type | Call type (PS/NW/NE/TT/IN/PE) | string | Partial — maps to ServiceCode |
| 6 | date | YYMMDD format | int | YES — date features |
| 7 | vru_entry | Time entered VRU (HH:MM:SS) | time | Arrival time proxy |
| 8 | vru_exit | Time exited VRU | time | |
| 9 | vru_time | Seconds in VRU | int | |
| 10 | q_start | Time entered queue (0:00:00 if bypassed) | time | **YES** — queue entry time |
| 11 | q_exit | Time exited queue | time | **YES** — queue exit time |
| 12 | q_time | Seconds in queue | int | **YES** — waiting time |
| 13 | outcome | AGENT / HANG / PHANTOM | string | **YES** — completion/abandonment |
| 14 | ser_start | Service start time | time | **YES** — ServingStartedAt equivalent |
| 15 | ser_exit | Service end time | time | **YES** — ServingEndedAt equivalent |
| 16 | ser_time | Service duration (seconds) | int | **YES** — service duration |
| 17 | server | Agent name/ID | string | **YES** — counter/server identity |
| 18 | day_of_week | Day name | string | **YES** — DayOfWeek feature |

**Queue time distribution (AGENT calls with q_time > 0, n=196,007):**
- Min: 1s, Median: 67s (1.1 min), Mean: 105s (1.8 min), P95: 323s (5.4 min), Max: 2195s (36.6 min)

**Service time distribution (AGENT calls with ser_time > 0, n=351,893):**
- Min: 1s, Median: 115s (1.9 min), Mean: 192s (3.2 min), P95: 614s (10.2 min), Max: 36,291s (605 min)

---

### 3B. Simulated Call Centre (simulated_call_centre.csv)

**Source:** Kaggle/synthetic — simulated call center data
**Domain:** Generic call center simulation

| Property | Value |
|----------|-------|
| Total rows | 51,708 |
| Columns | 9 |
| Time coverage | Jan 1 – Dec 31, 2021 (365 days) |
| Missing values | None observed |
| Date format | YYYY-MM-DD |

**Columns:**

| Column | Meaning | Type | Useful for QMS? |
|--------|---------|------|-----------------|
| call_id | Sequential ID | int | Unique ID |
| date | Call date | date | YES — date features |
| daily_caller | Sequence within day | int | Partial — EnqueueSequence proxy |
| call_started | Time call placed | time | YES — arrival time |
| call_answered | Time call answered | time | YES — service start |
| call_ended | Time call ended | time | YES — service end |
| wait_length | Wait in seconds | int | **YES** — waiting time target |
| service_length | Service in seconds | int | YES — service duration |
| meets_standard | Boolean SLA flag | bool | No direct QMS use |

**Wait time distribution (rows with wait > 0, n=6,417 / 12.4%):**
- Min: 1s, Median: 99s, Mean: 137s (2.3 min), P95: 402s, Max: 983s

**Service time distribution (all, n=51,708):**
- Min: 0s, Median: 208s, Mean: 299s (5.0 min), Max: 3,110s (52 min)

**Critical limitation:** 87.6% of calls have zero wait time. This is a synthetic dataset with no counter/server identification, no service types, no queue length information.

---

### 3C. Nigerian Bank Queue Survey (Supplementary DATA on Queues/*.xlsx)

**Source:** Bishop et al. (2018), PMC5997939 — field survey in Ogun State, Nigeria
**Domain:** Physical bank branch queue (most domain-relevant!)

| Property | Value |
|----------|-------|
| Files | 12 xlsx (3 banks × 4 weeks) |
| Total customer rows | ~54,000 (across all files) |
| Columns per sheet | 5 (Number, Arrival time, X1, X2, X3) |
| Time coverage | 12 weeks (4 weeks per bank, Mon-Fri) |
| Sheets per file | 5 (one per weekday: Mon-Fri) |

**Columns:**

| Column | Meaning | Type | Unit | Useful for QMS? |
|--------|---------|------|------|-----------------|
| Number | Customer sequence number | int | — | EnqueueSequence proxy |
| Arrival time | Hour of arrival (e.g., "8" = 8am) | int/time | hour | **YES** — but only hour-level, not minute-level |
| X1 | Waiting time (arrival to cheque collection) | float | minutes | **YES** — waiting time target |
| X2 | Service time (processing) | float | minutes | **YES** — service duration |
| X3 | Total system time (= X1 + X2) | float | minutes | Derivable |

**Sample stats (First Bank, Week 1, Monday, n=880):**
- X1 (waiting): min=9.0, mean=12.0, max=15.0 minutes
- X2 (service): min=23.0, mean=26.0, max=29.0 minutes

**Critical limitations:**
1. No exact arrival timestamps (only hour)
2. No queue length or queue state at any point
3. No counter/server information
4. No service type differentiation (all customers treated as same service)
5. No customer type (online vs walk-in — all are walk-in)
6. Very small dataset per bank-week
7. Data appears partially synthetic (some sheets show floating-point values that look generated from distributions, while the paper says "stopwatch and recorder")

---

### 3D–3H. Non-Dataset Files

| File | Classification | Notes |
|------|---------------|-------|
| "Anonymous Bank" PDF | Dataset documentation | Documents the January-December dataset schema and collection methodology. Cannot render without poppler. |
| ttqm_a_2371715_sm6932.rtf | Literature | LaTeX source for "Call center data modeling: a queueing science approach based on Markovian arrival processes" (González et al.). Uses the same Anonymous Bank dataset for modeling. |
| ttqm_a_2371715_sm6933.rtf | Literature | Supplementary material (mathematical proofs) for the same paper. |
| mmc1.docx | Supplementary material | Document supplement for the Nigerian bank queue paper. |
| archive.zip | Duplicate | Contains identical copy of simulated_call_centre.csv. |

---

## 4. QMS Feature Mapping

### 4A. Anonymous Bank Call Center → QMS Features

| QMS Feature | Dataset Column(s) | Status | Explanation |
|-------------|-------------------|--------|-------------|
| **QueueLength** | — | **DERIVABLE** | Reconstruct from timestamps: count calls with q_start ≤ t and q_exit > t |
| **PeopleAhead** | — | **DERIVABLE** | Count calls in queue before this call's q_start |
| **OnlineQueueLength** | — | **NOT AVAILABLE** | No online/walk-in distinction in call center |
| **WalkInQueueLength** | — | **NOT AVAILABLE** | All calls are effectively "walk-in" |
| **NowServing** | — | **DERIVABLE** | Count calls with ser_start ≤ t and ser_exit > t |
| **ActiveCounters** | server | **DERIVABLE** | Count distinct active servers at snapshot time |
| **ServiceEligibleActiveCounters** | server × type | **PARTIALLY AVAILABLE** | Requires assumption: which servers handle which types |
| **RollingAvgServiceMinutes** | ser_time | **DERIVABLE** | Rolling average of ser_time for completed calls before snapshot |
| **DefaultAvgServiceMinutes** | ser_time | **DERIVABLE** | Overall average per type |
| **HourOfDay** | vru_entry / q_start | **DERIVABLE** | Extract hour from timestamp |
| **DayOfWeek** | day_of_week | **AVAILABLE** | Directly available |
| **IsPeakHour** | — | **DERIVABLE** | Define peak hours from arrival rate analysis |
| **EntryType** | priority | **PARTIALLY AVAILABLE** | Priority (0/1/2) is NOT online vs walk-in, but could serve as customer-type proxy |
| **CheckedIn** | — | **NOT APPLICABLE** | No check-in concept in call center |
| **EnqueueSequence** | call_id | **DERIVABLE** | Sequential call ID within date |
| **SlotDurationMinutes** | — | **NOT AVAILABLE** | No slot/appointment system in call center |
| **MinutesUntilSlotEnd** | — | **NOT AVAILABLE** | No slot system |
| **MinutesSinceSlotStart** | — | **NOT AVAILABLE** | No slot system |
| **OnlineQuotaPercent** | — | **NOT AVAILABLE** | No online booking in call center |
| **OnlineBookedInSlot** | — | **NOT AVAILABLE** | No slots |
| **WalkInInSlot** | — | **NOT AVAILABLE** | No slots |
| **WasPulledForward** | — | **NOT AVAILABLE** | No pull-forward in call center |
| **PullForwardCount** | — | **NOT AVAILABLE** | No pull-forward |
| **BranchCode** | vru_line | **PARTIALLY AVAILABLE** | VRU line could serve as branch proxy |
| **ServiceCode** | type | **AVAILABLE** | PS/NW/NE/TT/IN/PE maps to service types |
| **ActualWaitingMinutes** | q_time | **AVAILABLE** | q_time (seconds) / 60 |

**Summary: 8 AVAILABLE/DERIVABLE core features, 6 PARTIALLY AVAILABLE, 12 NOT AVAILABLE.**

### 4B. Simulated Call Centre → QMS Features

| QMS Feature | Status | Explanation |
|-------------|--------|-------------|
| QueueLength | NOT AVAILABLE | No queue state information |
| PeopleAhead | NOT AVAILABLE | No queue position data |
| ActiveCounters | NOT AVAILABLE | No server/counter info |
| HourOfDay | DERIVABLE | From call_started |
| DayOfWeek | DERIVABLE | From date |
| EnqueueSequence | AVAILABLE | daily_caller |
| ActualWaitingMinutes | AVAILABLE | wait_length / 60 |
| RollingAvgServiceMinutes | DERIVABLE | From service_length history |

**Summary: Only ~4 features obtainable. Extremely limited.**

### 4C. Nigerian Bank Queue → QMS Features

| QMS Feature | Status | Explanation |
|-------------|--------|-------------|
| QueueLength | NOT AVAILABLE | Not recorded |
| PeopleAhead | NOT AVAILABLE | Not recorded |
| ActiveCounters | NOT AVAILABLE | Not recorded |
| HourOfDay | PARTIALLY AVAILABLE | Only hour-level (e.g., "8"), not minute-level |
| DayOfWeek | AVAILABLE | From sheet name (Monday-Friday) |
| EnqueueSequence | AVAILABLE | "Number" column |
| ActualWaitingMinutes | AVAILABLE | X1 column |
| RollingAvgServiceMinutes | DERIVABLE | From X2 history |
| BranchCode | DERIVABLE | From filename (First/Second/Third Bank) |

**Summary: Only ~5 features. But waiting time and service time are in the correct domain (physical bank branch).**

---

## 5. Target Compatibility

| Dataset | Target Available? | Derivable? | Target Definition | QMS Compatibility |
|---------|-------------------|------------|-------------------|-------------------|
| **Anonymous Bank** | YES | YES | q_time = q_exit - q_start (seconds in telephone queue) | **PARTIALLY COMPATIBLE** — semantically similar (arrival → service start) but in telephone domain, not physical branch. No distinction between online/walk-in InitialQueueEligibleAt. |
| **Simulated Call Centre** | YES | YES | wait_length = call_answered - call_started (seconds) | **PARTIALLY COMPATIBLE** — same concept but synthetic and no queue state. |
| **Nigerian Bank** | YES | N/A | X1 = arrival to cheque collection (minutes) | **MOST COMPATIBLE** — physical bank branch waiting time. But definition may differ: "cheque collection" ≠ "service start" in all cases. |

### Semantic Comparison with QMS Target

**QMS target:** `ActualWaitingMinutes = ServingStartedAt - InitialQueueEligibleAt`

| Dataset | Their "waiting time" | Semantic difference |
|---------|---------------------|---------------------|
| Anonymous Bank | q_start → q_exit (time in queue before agent picks up) | Does NOT include VRU time. Comparable to QMS "queue entry → service start". Most similar semantics. |
| Simulated | call_started → call_answered | Comparable, but lacks VRU phase — may be closer to total system entry → service. |
| Nigerian Bank | arrival → cheque collection | "Cheque collection" may not = "service start" — could include initial verification steps. Ambiguous boundary. |

---

## 6. Data Leakage Analysis

### Anonymous Bank — Potential Leakage Risks

| Risk | Column(s) | Mitigation |
|------|-----------|------------|
| **Using q_time as feature** | q_time | MUST be target only, never a feature. q_time IS the waiting time we're predicting. |
| **Using q_exit as feature** | q_exit | q_exit is the moment queue wait ends — known only after the fact. Do NOT use. |
| **Using ser_time as feature** | ser_time | Service duration of THIS call is future info at prediction time. Only past calls' ser_time can be used (rolling average). |
| **Using outcome as feature** | outcome | Whether customer reached AGENT or HANG is only known after. Do NOT use as feature. |
| **Future queue state** | (derived) | When computing QueueLength or PeopleAhead at snapshot time, must NOT include calls arriving after snapshot. |
| **Future server availability** | server | Which specific server handles the call is future info. Active server COUNT at snapshot time is OK. |

### Safe feature derivation approach:
- **Snapshot time** = q_start (moment customer enters queue)
- All features must reflect state at q_start, not after
- Rolling average: only use ser_time from calls with ser_exit < current q_start
- Queue length: count calls with q_start ≤ snapshot AND q_exit > snapshot OR q_exit is pending
- Active servers: count servers with ser_start ≤ snapshot AND ser_exit > snapshot

### Simulated Call Centre — Leakage Risks
- wait_length and service_length are both post-hoc. Only wait_length should be target; service_length of past calls can inform features.

### Nigerian Bank — Leakage Risks
- X1 (waiting time) must be target only
- X2 (service time) of the current customer is future info
- Very limited feature space means leakage risk is low but so is feature utility

---

## 7. Dataset Quality Score

| Criterion | Anonymous Bank | Simulated CC | Nigerian Bank |
|-----------|---------------|--------------|---------------|
| 1. Domain relevance | 6/10 (bank, but call center not branch) | 3/10 (generic call center) | **9/10** (physical bank branch) |
| 2. Target relevance | **8/10** (queue wait → service start) | 6/10 (call wait → answer) | 7/10 (arrival → cheque collection, slightly ambiguous) |
| 3. Feature richness | **7/10** (timestamps, server, type, priority, customer ID) | 2/10 (almost no features) | 2/10 (only hour, sequence, times) |
| 4. Data quality | **8/10** (clean, consistent, well-documented) | 6/10 (clean but synthetic) | 4/10 (some sheets appear distribution-generated, hour-only timestamps) |
| 5. Dataset size | **9/10** (444K records, 12 months) | 6/10 (52K records) | 4/10 (~54K but spread thin across 3 banks × 4 weeks) |
| 6. Temporal coverage | **9/10** (full year, daily granularity, second-level timestamps) | 7/10 (full year daily) | 3/10 (12 weeks only, hour-level only) |
| 7. Real-world validity | **10/10** (real operational data, well-cited) | 1/10 (synthetic simulation) | 7/10 (field survey, but some data looks generated) |
| 8. QMS compatibility | 5/10 (no slots, no online/walk-in, no counters) | 2/10 (minimal features) | 4/10 (correct domain but minimal features) |
| **Overall** | **7.8/10** | **4.1/10** | **5.0/10** |

---

## 8. Recommended Dataset Roles

### PRIMARY PUBLIC DATASET: Anonymous Bank Call Center

**Why:** Richest real-world dataset. 444K records with second-level timestamps, server identity, service types, customer priority, and full call lifecycle (VRU → queue → service). Enables reconstruction of queue state, server utilization, and rolling service duration — the most important features for waiting-time prediction.

**Limitations:** Telephone call center, not physical branch. No slot/booking system, no online vs walk-in, no pull-forward. 6 service types (PS/NW/NE/TT/IN/PE) differ from bank branch services.

### SECONDARY PUBLIC DATASET: Nigerian Bank Queue Survey

**Why:** Only dataset from the correct domain (physical bank branches). Useful for validating that waiting-time distributions in the QMS model are realistic for bank branches.

**Limitations:** Extremely limited features. No queue state, no server count, no exact timestamps. Cannot be used for ML training — only for distribution comparison and domain validation.

### SYNTHETIC / DEVELOPMENT: Simulated Call Centre

**Why:** Clean, simple structure good for testing the data adapter pipeline.

**Limitations:** Synthetic. Almost no useful features. 87.6% zero-wait. Should never be used for accuracy claims.

### LITERATURE ONLY

- ttqm_a_2371715_sm6932.rtf — Markovian arrival process modeling paper (uses the same Anonymous Bank dataset; methodology reference only)
- ttqm_a_2371715_sm6933.rtf — Supplementary mathematical material
- mmc1.docx — Nigerian bank paper supplement
- "Anonymous Bank" PDF — Dataset documentation (useful for understanding column semantics)
- PMC Paper inline text — Survey methodology and aggregated results

---

## 9. Data Adapter Strategy

### Adapter A: Anonymous Bank → QMS Canonical Schema

```
Raw .txt files (19 tab-separated fields per row, 12 monthly files)
  ↓
Parse with corrected field mapping (off-by-one: data has extra field 0)
  ↓
Filter: outcome == "AGENT" only (353K rows — exclude HANG/PHANTOM, they never got served)
  ↓
Filter: q_time > 0 (196K rows — exclude calls that bypassed queue)
  ↓
Derive features at snapshot_time = q_start:
  - QueueLength: COUNT calls where q_start ≤ snapshot AND (q_exit > snapshot OR q_exit pending)
  - PeopleAhead: COUNT calls in queue before this call, same type
  - NowServing: COUNT calls where ser_start ≤ snapshot AND ser_exit > snapshot
  - ActiveCounters: COUNT DISTINCT servers active at snapshot
  - RollingAvgServiceMinutes: AVG(ser_time) for completed calls in last N hours
  - HourOfDay: extract from q_start
  - DayOfWeek: from day_of_week field
  - IsPeakHour: derive from arrival rate analysis
  - ServiceCode: type field (PS/NW/NE/TT/IN/PE)
  - EntryType: set to 0 (walk-in equivalent — no online bookings)
  - EnqueueSequence: call_id sequence within date
  ↓
Set target:
  - ActualWaitingMinutes = q_time / 60.0
  ↓
Mark unavailable features as NULL:
  - OnlineQueueLength = NULL
  - WalkInQueueLength = NULL  
  - CheckedIn = NULL
  - All slot features = NULL
  - All pull-forward features = NULL
  - OnlineQuotaPercent = NULL
  ↓
Output: Canonical ML schema with ~10 observed features + target
```

**Critical distinctions in output:**

| Field | Classification |
|-------|---------------|
| QueueLength | **Derived** (reconstructed from timestamps) |
| PeopleAhead | **Derived** |
| ActiveCounters | **Derived** |
| NowServing | **Derived** |
| RollingAvgServiceMinutes | **Derived** |
| HourOfDay | **Observed** |
| DayOfWeek | **Observed** |
| ServiceCode | **Observed** |
| EnqueueSequence | **Observed** |
| ActualWaitingMinutes | **Observed** (target) |
| OnlineQueueLength | **Unavailable** |
| SlotDurationMinutes | **Unavailable** |
| PullForwardCount | **Unavailable** |
| (11 more) | **Unavailable** |

### Adapter B: Simulated Call Centre → QMS Canonical Schema

Minimal adapter — useful only for pipeline testing:
- HourOfDay from call_started
- DayOfWeek from date
- EnqueueSequence from daily_caller
- ActualWaitingMinutes from wait_length / 60
- Everything else: NULL

### Adapter C: Nigerian Bank → QMS Canonical Schema

Minimal adapter — useful only for distribution analysis:
- HourOfDay from Arrival time (integer hour only)
- DayOfWeek from sheet name
- EnqueueSequence from Number
- ActualWaitingMinutes from X1
- RollingAvgServiceMinutes derivable from X2 history
- BranchCode from filename
- Everything else: NULL

---

## 10. What We Should NOT Do

| Dangerous Shortcut | Why It's Wrong |
|-------------------|----------------|
| **Fabricate ActiveCounters for datasets that don't have it** | Invented server counts would introduce noise, not signal. The model would learn from fiction. |
| **Set OnlineQueueLength = 0 / WalkInQueueLength = QueueLength** | These datasets have no online booking concept. Setting online=0 would train the model to always expect 0 online customers, creating bias. |
| **Treat simulated data as real** | Synthetic distributions ≠ real-world distributions. Never claim accuracy based on synthetic data. |
| **Mix Anonymous Bank + Nigerian Bank in one training set** | Completely different domains (call center vs branch), different time scales (seconds vs minutes), different feature availability. Merging is scientifically indefensible. |
| **Claim model accuracy for "Public Bank" based on Israeli call center data** | Different country, different domain, different era (1999 vs 2026). |
| **Use q_time or ser_time as features** | These are outcome variables (known only after the fact). Using them as features is data leakage. |
| **Use random train/test split** | Temporal data must use time-based split. Random split leaks future patterns into training. |
| **Fill slot features with defaults (e.g., SlotDurationMinutes=30)** | Public datasets have no slot system. Filling with QMS defaults creates false signal. Mark as NULL and train without them. |
| **Use HANG/PHANTOM calls as training data** | These customers abandoned the queue — they have no ActualWaitingMinutes (never served). Cannot be used for waiting-time prediction training. (Can be used for abandonment analysis.) |

---

## 11. What We Can Realistically Learn from Public Data

### From Anonymous Bank (PRIMARY):
1. **Queue dynamics at scale** — how queue length, server count, and time-of-day affect waiting time
2. **Feature importance ranking** — which of the ~10 available features matter most for prediction
3. **ML vs Formula comparison** — whether ML improves over `PeopleAhead × AvgService / Counters`
4. **Baseline model architecture** — which algorithms work (tree-based vs linear vs neural)
5. **Rolling average service duration** — how historical service time informs predictions
6. **Peak hour effects** — temporal patterns in waiting time
7. **Service type effects** — whether different service types have different waiting characteristics

### From Nigerian Bank (SECONDARY):
1. **Physical bank branch waiting time distributions** — realistic range for bank customers (X1: 5–30 min typical)
2. **Physical bank service time distributions** — X2: 6–32 min typical
3. **Day-of-week effects in bank branches** — validating that weekday patterns exist
4. **Sanity check** — if QMS model predicts 2-minute waits for a branch with 900 daily customers, the Nigerian data suggests that's unrealistic

### NOT learnable from public data (requires QMS_REAL):
- Online vs walk-in dynamics
- Slot/appointment system effects
- Pull-forward impact
- Check-in behavior
- Online quota effects
- Counter capability matching (ServiceEligibleActiveCounters)
- Branch-specific patterns

---

## 12. Features Only Obtainable from QMS_REAL

| Feature | Why Public Data Cannot Provide It |
|---------|----------------------------------|
| OnlineQueueLength | No public dataset has online booking queues |
| WalkInQueueLength | No distinction in public data |
| OnlineQuotaPercent | QGo-specific configuration |
| SlotDurationMinutes | QGo-specific slot system |
| MinutesUntilSlotEnd | Requires slot system |
| MinutesSinceSlotStart | Requires slot system |
| OnlineBookedInSlot | Requires slot system |
| WalkInInSlot | Requires slot system |
| WasPulledForward | QGo-specific pull-forward mechanism |
| PullForwardCount | QGo-specific |
| CheckedIn | QGo-specific geofenced check-in |
| ServiceEligibleActiveCounters | QGo's counter-to-service mapping |
| BranchCode | QGo-specific branch codes |

**These 13 features (of 26) can only come from the real QGo system.**

Public data experiments must train with the ~10-13 features that ARE available, and the model should still be useful — QueueLength, PeopleAhead, ActiveCounters, NowServing, RollingAvgServiceMinutes, HourOfDay, DayOfWeek, IsPeakHour, ServiceCode, EnqueueSequence are the core prediction features anyway.

---

## 13. Recommended Next ML Experiment

### Experiment A (RECOMMENDED FIRST): Anonymous Bank — Reduced Feature ML

**Objective:** Validate that ML outperforms the formula baseline using real-world queue data with derived features.

**Steps:**
1. Build Adapter A (Python script) to parse all 12 monthly .txt files
2. For each AGENT call with q_time > 0, reconstruct queue state at q_start:
   - QueueLength (same type, currently in queue)
   - PeopleAhead (same type, entered queue before this call)
   - NowServing (same type, currently being served)
   - ActiveCounters (distinct servers active)
   - RollingAvgServiceMinutes (last 2 hours, same type)
3. Extract: HourOfDay, DayOfWeek, IsPeakHour, ServiceCode, EnqueueSequence
4. Target: q_time / 60.0
5. **Time-based split**: Jan–Sep = train, Oct–Dec = test
6. Train:
   - Baseline: FormulaFallback (PeopleAhead × RollingAvg / ActiveCounters)
   - ML: HistGradientBoostingRegressor (same as current ml/train_wait_model.py)
7. Evaluate: MAE, RMSE, R², compare ML vs Formula
8. Feature importance analysis

**Expected output:**
- Honest MAE/RMSE on real telephone queue data
- Feature importance ranking
- ML vs Formula improvement (or lack thereof)
- Understanding of which features drive predictions

**What NOT to claim:** "This model achieves X minutes accuracy for Public Bank branch queues." Only claim: "Using real-world call center data with N available features, ML achieves Y improvement over the formula baseline."

### Experiment B (LATER): Nigerian Bank — Distribution Validation

**Objective:** Compare predicted waiting time distributions against actual physical bank branch distributions.

**Steps:**
1. Load Nigerian bank X1 values
2. Compare distribution shape, mean, variance with Anonymous Bank q_time
3. Check whether a model trained on Anonymous Bank produces reasonable predictions for the Nigerian bank's feature values

### Experiment C (LATER): QMS_REAL — Production Training

**Objective:** Train on actual QGo operational data with all 26 features.

**Trigger:** When ML_TRAINING_DATA table has ≥ 1,000 completed observations (with ActualWaitingMinutes filled).

---

## 14. Summary Decision Matrix

| Decision | Answer |
|----------|--------|
| Use Anonymous Bank as primary dataset? | **YES** — for ML experimentation with reduced features |
| Use Nigerian Bank for training? | **NO** — too limited. Use for distribution validation only. |
| Use Simulated data for training? | **NO** — synthetic. Use for pipeline testing only. |
| Merge datasets? | **NO** — incompatible domains, features, and semantics |
| Modify production code now? | **NO** — data strategy first |
| Train final production model? | **NO** — wait for QMS_REAL data |
| Claim bank-specific accuracy? | **NO** — public data ≠ Public Bank data |
| Build Adapter A now? | **YES** — next concrete step |

---

*Phase 3 complete. Awaiting approval to proceed with Experiment A: Anonymous Bank adapter + ML baseline comparison.*
