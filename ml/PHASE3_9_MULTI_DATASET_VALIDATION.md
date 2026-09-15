# Phase 3.9: Multi-Dataset Validation Strategy

**Date:** 2026-09-14
**Objective:** Establish a multi-dataset validation strategy where each dataset serves a specific, defensible role — NOT merged into one dataset.

---

## 1. Dataset Inventory

| ID | Dataset | Domain | Records | Provenance | Classification | Locally Available |
|---|---|---|---|---|---|---|
| A | **Anonymous Bank Call Center** | Israeli bank call center | 444,436 | Technion (Guedj & Mandelbaum), 1999 | **REAL / OBSERVED** | ✅ 12 monthly .txt |
| B | **Ogun State Nigerian Bank Queue** | Physical bank branch (Nigeria) | 52,499 | Bishop et al. (PMC5997939), 2018 field survey | **REAL / OBSERVED** (with caveats) | ✅ 12 .xlsx files |
| C | **Simulated Call Centre** | Generic call center | 51,708 | Kaggle, 2021 | **SYNTHETIC / SIMULATED** | ✅ CSV |
| D | **QMS Synthetic Seed** | Malaysian bank branch | 20,000 | This project (generate_seed_data.py) | **SYNTHETIC** | ✅ CSV |
| E | **QMS_REAL** | QGo production | 0 (pending) | QGo system itself | **REAL / OBSERVED** | ❌ (not yet collected) |
| F | Kaggle Queue Waiting Time (Tiwary) | Unknown | ~100 est. | Kaggle, 2023, no provenance | **UNKNOWN** | ❌ Not downloaded |
| G | Kaggle Call Centre Queue Sim (Bangs) | Generic call center | ~50K est. | Kaggle, simmer R package, 2022 | **SYNTHETIC / SIMULATED** | ❌ Not downloaded |
| H | Lawson BINUS Syahdan | Retail convenience store | Unknown | Zenodo, 2026 field observation | **REAL / OBSERVED** | ❌ Not downloaded |

---

## 2. Provenance Verification

### Dataset A — Anonymous Bank Call Center

| Property | Value |
|---|---|
| Original source | Technion – Israel Institute of Technology, Service Engineering lab |
| Authors | Ilan Guedj, Avi Mandelbaum |
| Collection period | January–December 1999 (12 months, 363 days) |
| How collected | Automated telephone system logs (VRU + ACD) |
| Domain | Bank telephone call center (NOT physical branch) |
| Event-level data | **YES** — individual call records with second-level timestamps |
| Publicly downloadable | **YES** — Technion ServEng website |
| Used in prior research | **Extensively** — Mandelbaum, Zeltyn, González et al. (50+ citations) |
| Verified locally | ✅ 444,436 rows, 19 fields per row, 52 servers, 6 service types |

### Dataset B — Ogun State Nigerian Bank Queue

| Property | Value |
|---|---|
| Original source | Bishop et al. (2018), PMC5997939 |
| Authors | S.A. Bishop, H.I. Okagbue, M.O. Adamu, F.A. Olajide |
| Collection period | 2018 (12 weeks: 4 weeks per bank, Mon–Fri) |
| How collected | Paper states "stopwatch and recorder" field observation |
| Domain | **Physical bank branches** (3 banks in Ogun State, Nigeria) |
| Event-level data | **Partially** — per-customer rows, but arrival time is hour-level only |
| Publicly downloadable | **YES** — PMC supplementary data |
| Used in prior research | Yes — the source paper and citations |
| Verified locally | ✅ 52,499 rows across 60 sheets (12 files × 5 weekday sheets) |

**Critical Ogun data quality observations:**

1. **Arrival time is hour-level only** — Most values are `8:00` (8am integer or datetime.time(8,0)). In Sheet1 of FIRST BANK WEEK 1, arrival is just integer `8`. No minute/second granularity.

2. **X1/X2/X3 have suspicious decimal precision** — Values like `3.023438215277566` and `5.609210486159856` (15+ decimal places) do NOT look like stopwatch measurements. Real stopwatch data would be integers or 1-2 decimal places. These appear to be **generated from continuous probability distributions** fitted to observed aggregate statistics.

3. **Summary statistics rows are mixed into data** — Row 2 often contains `MEAN` label and summary values in columns 6-9. These are NOT customer observations.

4. **X3 ≈ X1 + X2** — Confirmed: total system time = waiting time + service time.

5. **Data provenance classification should be: REAL / OBSERVED (with caveat: individual values may be distribution-generated from aggregate observations)**. The aggregate statistics (mean, variance) per bank/week/day are real, but individual rows may be synthetic reconstructions.

### Dataset C — Simulated Call Centre

| Property | Value |
|---|---|
| Source | Kaggle |
| Classification | **SYNTHETIC / SIMULATED** |
| Rows | 51,708 |
| Zero-wait ratio | **75%** (39,291 of 51,708 have wait_length=0) |
| Columns | call_id, date, daily_caller, call_started, call_answered, call_ended, wait_length, service_length, meets_standard |
| No server ID, no service type, no queue length | |
| Useful for | Pipeline smoke testing only |

### Dataset D — QMS Synthetic Seed

| Property | Value |
|---|---|
| Source | This project: `ml/generate_seed_data.py` |
| Classification | **SYNTHETIC** |
| Rows | 20,000 |
| Features | All 12 model input features (full QGo schema minus slot/pull-forward) |
| Target formula | `(QueueLength × DefaultAvgServiceMinutes / ActiveCounters) + noise` |
| Useful for | Full QGo feature pipeline validation |

### Dataset F — Kaggle Tiwary (NOT DOWNLOADED)

| Property | Value |
|---|---|
| Size | 6,051 bytes (6KB) |
| Classification | **UNKNOWN** — no provenance, tagged "religion and belief systems" |
| Verdict | **Not worth downloading.** Too small, no provenance. |

### Dataset G — Kaggle Bangs (NOT DOWNLOADED)

| Property | Value |
|---|---|
| Classification | **SYNTHETIC** — explicitly from simmer R DES package |
| Verdict | Redundant with Dataset C. Both are synthetic call center simulations. |

### Dataset H — Lawson BINUS (NOT DOWNLOADED)

| Property | Value |
|---|---|
| Domain | Retail convenience store (NOT banking) |
| Classification | **REAL / OBSERVED** |
| Verdict | Possibly useful but wrong domain. Lower priority than A and B. |

---

## 3. Target Compatibility

### QGo Target Definition
```
ActualWaitingMinutes = ServingStartedAt - InitialQueueEligibleAt
```
`InitialQueueEligibleAt` is immutable. Walk-in = CreatedAt. Online = AssignedSlotStart.

### Dataset Target Mapping

| Dataset | Their Target | Definition | Semantic Match | Notes |
|---|---|---|---|---|
| **A: Anonymous Bank** | q_time (seconds) | q_exit − q_start (time in telephone queue) | **STRONG** | Equivalent to "entered queue → exited queue to be served". q_start is the snapshot moment. |
| **B: Ogun Nigerian** | X1 (minutes) | "Waiting time" = arrival → service start (per paper) | **MODERATE** | Paper says "time between arrival and beginning of service". Same concept but hour-level arrival time limits reconstruction precision. |
| **C: Simulated CC** | wait_length (seconds) | call_started → call_answered | **MODERATE** | Synthetic. |
| **D: QMS Synthetic** | WaitingMinutes | Formula-generated | **BY CONSTRUCTION** | Synthetic, matches QGo formula. |
| **E: QMS_REAL** | ActualWaitingMinutes | ServingStartedAt − InitialQueueEligibleAt | **EXACT** | Ground truth. |

### Important: Anonymous Bank Target Validation

For Dataset A, the target derivation is:
- **SnapshotAt** = q_start (moment customer enters the telephone queue)
- **ActualWaitingMinutes** = q_time / 60.0
- This is semantically equivalent to "time from becoming queue-eligible to starting service"
- q_start = 0:00:00 means the customer **bypassed the queue** (44.5% of AGENT calls)
  - These have q_time = 0 and represent legitimate zero-wait observations
  - They should be INCLUDED in training (customer was immediately served)

### Important: Ogun Target Validation

For Dataset B:
- X1 = waiting time in minutes (float)
- X2 = service time in minutes (float)
- X3 = X1 + X2 (total system time)
- Target = X1 (waiting time)
- **No exact arrival timestamp** — arrival time is hour-level only (e.g., "8" = 8am)
- This means **we cannot reconstruct queue state at the moment of arrival**
- X1 is usable as a target, but features derivable from this dataset are extremely limited

---

## 4. QGo Feature Compatibility Matrix

### Full 25-Feature Matrix

| # | QGo Feature | A: Anonymous Bank | B: Ogun Nigerian | C: Simulated CC | D: QMS Synthetic |
|---|---|---|---|---|---|
| 1 | QueueLength | **DERIVED** — count calls in queue at q_start | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 2 | PeopleAhead | **DERIVED** — same-type queue position at q_start | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 3 | OnlineQueueLength | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 4 | WalkInQueueLength | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 5 | NowServing | **DERIVED** — count calls with ser_start ≤ t < ser_exit | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| 6 | ActiveCounters | **PROXY** — count servers with active service at q_start | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 7 | ServiceEligibleActiveCounters | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| 8 | RollingAvgServiceMinutes | **DERIVED** — avg(ser_time) of completed calls before q_start | **DERIVED** — avg(X2) of prior rows | **DERIVED** — avg(service_length) | **OBSERVED** |
| 9 | DefaultAvgServiceMinutes | **DERIVED** — per-type overall avg | **DERIVED** — per-bank overall avg | **DERIVED** | **OBSERVED** |
| 10 | HourOfDay | **DERIVED** — hour(q_start) | **PROXY** — arrival hour (integer only) | **DERIVED** — hour(call_started) | **OBSERVED** |
| 11 | DayOfWeek | **OBSERVED** — day_of_week field | **OBSERVED** — from sheet name (Mon–Fri) | **DERIVED** — from date | **OBSERVED** |
| 12 | IsPeakHour | **DERIVED** — from arrival rate analysis | **PROXY** — limited by hour-level | **DERIVED** | **OBSERVED** |
| 13 | EntryType | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 14 | CheckedIn | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |
| 15 | EnqueueSequence | **DERIVED** — chronological q_start order within date+type | **OBSERVED** — Number column | **OBSERVED** — daily_caller | **OBSERVED** |
| 16 | SlotDurationMinutes | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| 17 | MinutesUntilSlotEnd | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| 18 | MinutesSinceSlotStart | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| 19 | OnlineQuotaPercent | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| 20 | OnlineBookedInSlot | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| 21 | WalkInInSlot | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| 22 | WasPulledForward | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| 23 | PullForwardCount | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| 24 | BranchCode | **PROXY** — single call center (constant) | **OBSERVED** — bank name from filename | UNAVAILABLE | **OBSERVED** |
| 25 | ServiceCode | **OBSERVED** — type field (PS/NW/NE/TT/IN/PE) | UNAVAILABLE | UNAVAILABLE | **OBSERVED** |

### Feature Count Summary

| Classification | A: Anonymous | B: Ogun | C: Simulated | D: QMS Synthetic |
|---|---|---|---|---|
| OBSERVED | 2 | 3 | 1 | 10 |
| DERIVED | 7 | 2 | 3 | 0 |
| PROXY | 2 | 1 | 0 | 0 |
| UNAVAILABLE | 14 | 19 | 21 | 15 |
| **Total usable** | **11** | **6** | **4** | **10** |

---

## 5. Dataset Comparison

| Criterion (weight) | A: Anonymous | B: Ogun | C: Simulated | D: QMS Synthetic |
|---|---|---|---|---|
| Domain relevance (20%) | 6/10 (call center) | **9/10** (physical bank) | 3/10 (generic CC) | **10/10** (exact domain) |
| Target compatibility (15%) | **9/10** | 7/10 (no timestamp) | 6/10 | 10/10 (by construction) |
| Feature richness (20%) | **8/10** (11 features) | 3/10 (6 features) | 2/10 (4 features) | **9/10** (10 features) |
| Data quality (15%) | **9/10** (clean, second-level) | 4/10 (hour-level, suspicious decimals) | 5/10 (clean but synthetic) | 5/10 (synthetic) |
| Dataset size (10%) | **9/10** (444K) | 6/10 (52K) | 6/10 (52K) | 4/10 (20K) |
| Provenance (10%) | **10/10** (Technion, heavily cited) | 7/10 (PMC published) | 3/10 (Kaggle, unknown) | N/A |
| Real-world validity (10%) | **10/10** | 6/10 (values suspicious) | 1/10 (synthetic) | 1/10 (synthetic) |
| **Weighted score** | **8.4** | **5.8** | **3.4** | **7.0** |

---

## 6. Recommended Dataset Roles

### Role A — PRIMARY EXTERNAL ML BENCHMARK: Anonymous Bank Call Center

**Why:** Highest-scoring external dataset. 444K real records with second-level timestamps, server identity, 6 service types, and full queue lifecycle. Enables queue state reconstruction, active server derivation, and rolling service time calculation — the most important features for wait-time prediction.

**Experiment objective:** Demonstrate that ML (HistGradientBoostingRegressor) outperforms the QGo formula (`PeopleAhead × AvgService / ActiveCounters`) on real-world queue dynamics.

**Usable features (11):** QueueLength(D), PeopleAhead(D), NowServing(D), ActiveCounters(P), RollingAvgServiceMinutes(D), DefaultAvgServiceMinutes(D), HourOfDay(D), DayOfWeek(O), IsPeakHour(D), EnqueueSequence(D), ServiceCode(O)

**Target:** q_time / 60.0 (at SnapshotAt = q_start)

**Limitations:** Call center not branch. 1999. No online/walk-in. No slot system.

---

### Role B — BANKING-DOMAIN EXTERNAL VALIDATION: Ogun Nigerian Banks

**Why:** The ONLY dataset from the correct domain (physical bank branches). Even with limited features, it provides independent evidence that QGo's waiting-time and service-time distributions are realistic for actual bank operations.

**Experiment objective:** Validate that the distributions learned from Anonymous Bank and QMS data are consistent with real physical bank branch waiting times. NOT for ML training (too few features).

**What it CAN validate:**
- Waiting time distribution (X1): min, max, mean, median, P95
- Service time distribution (X2): min, max, mean, median, P95
- Day-of-week patterns (from sheet names)
- Hour-level arrival patterns
- Cross-bank variation (3 independent banks)
- System time = wait + service (X3 = X1 + X2)

**What it CANNOT do:**
- Train a supervised ML model (only 6 features, no queue state)
- Provide per-customer queue position
- Provide server count or utilization

**Usable features (6):** HourOfDay(P, hour-level only), DayOfWeek(O), EnqueueSequence(O), RollingAvgServiceMinutes(D), DefaultAvgServiceMinutes(D), BranchCode(O)

**Target:** X1 (waiting time in minutes)

---

### Role C — SUPPLEMENTARY PIPELINE TEST: Simulated Call Centre

**Why:** Clean, simple CSV structure useful for verifying the data adapter pipeline works correctly.

**Experiment objective:** Pipeline smoke test only. NOT for accuracy claims.

**Limitations:** Synthetic. 75% zero-wait. No queue state. No server info. No service types.

**Verdict:** Mention in report as "pipeline validation dataset" but DO NOT include in experimental results.

---

### Role D — FULL QGo PIPELINE VALIDATION: QMS Synthetic Seed

**Why:** Only dataset that has all QGo-specific features (OnlineQueueLength, EntryType, CheckedIn, etc.). Essential for verifying the ML pipeline handles the full feature schema.

**Experiment objective:** Confirm HistGradientBoostingRegressor pipeline works with full QGo feature set. Establish synthetic baseline. NOT for real-world accuracy claims.

**Usable features (10):** All columns in the CSV (BranchCode, ServiceCode, DefaultAvgServiceMinutes, EntryType, EnqueueSequence, CheckedIn, QueueLength, ActiveCounters, HourOfDay, DayOfWeek, IsPeakHour)

**Target:** WaitingMinutes (formula-generated)

---

### Role E — FINAL PRODUCTION MODEL: QMS_REAL

**Why:** The eventual and most important training source. Data collected by the QGo system itself, with exact feature definitions matching the production prediction pipeline.

**Experiment objective:** Train the production model on real QGo data once sufficient tickets are collected (~1,000+ with ActualWaitingMinutes).

**Usable features:** All 25 QGo features (OBSERVED, ground truth)

**Target:** ActualWaitingMinutes = ServingStartedAt − InitialQueueEligibleAt (exact)

---

## 7. Recommended Experiment Structure

### Experiment 1: External ML Benchmark (Anonymous Bank)

| Item | Value |
|---|---|
| **Objective** | Prove ML > Formula on real queue data |
| **Dataset** | A: Anonymous Bank Call Center (444K rows) |
| **Target** | q_time / 60.0 |
| **Usable features** | QueueLength, PeopleAhead, NowServing, ActiveCounters, RollingAvgServiceMinutes, DefaultAvgServiceMinutes, HourOfDay, DayOfWeek, IsPeakHour, EnqueueSequence, ServiceCode |
| **Unavailable** | 14 QGo features (EntryType, CheckedIn, all slot features, pull-forward, OnlineQueueLength, etc.) |
| **Model** | HistGradientBoostingRegressor |
| **Baseline** | Formula: PeopleAhead × AvgService / ActiveCounters |
| **Evaluation** | MAE, RMSE on temporal test set (Nov–Dec 1999) |
| **Split** | Time-based: Jan–Oct train, Nov–Dec test |
| **Limitations** | Call center domain. 1999. Feature reconstruction introduces approximation. |

### Experiment 2: Banking Domain Validation (Ogun)

| Item | Value |
|---|---|
| **Objective** | Validate waiting/service distributions against real bank branch data |
| **Dataset** | B: Ogun Nigerian Banks (52K rows after cleaning) |
| **Analysis** | Distribution comparison (NOT ML training) |
| **Metrics** | KS-test, QQ-plot, distribution overlap between Ogun bank wait/service distributions and Anonymous Bank / QMS predictions |
| **Questions answered** | "Are QGo's predicted wait times in a realistic range for actual bank branches?" "Do our model's service-time assumptions match real bank service durations?" |
| **Limitations** | Hour-level only. Possibly distribution-generated individual values. No queue state. |

### Experiment 3: Full Pipeline Validation (QMS Synthetic)

| Item | Value |
|---|---|
| **Objective** | Verify HistGradientBoostingRegressor + full QGo feature pipeline |
| **Dataset** | D: QMS Synthetic Seed (20K rows) |
| **Target** | WaitingMinutes |
| **Usable features** | All 12 features in CSV |
| **Model** | HistGradientBoostingRegressor |
| **Baseline** | Formula |
| **Evaluation** | MAE, RMSE (synthetic only — do NOT claim as real-world result) |
| **Split** | Random 80/20 (synthetic, temporal split not meaningful) |
| **Limitations** | Synthetic. Distribution is formula-derived. Only proves pipeline works. |

### Experiment 4: Production Model (QMS_REAL) — FUTURE

| Item | Value |
|---|---|
| **Objective** | Train production wait-time predictor |
| **Dataset** | E: QMS_REAL (collected by QGo system) |
| **Target** | ActualWaitingMinutes (exact) |
| **Usable features** | All 25 QGo features |
| **Model** | HistGradientBoostingRegressor |
| **Baseline** | Formula |
| **Evaluation** | MAE, RMSE on temporal test set |
| **Prerequisite** | ~1,000+ completed tickets with non-null ActualWaitingMinutes |

---

## 8. Datasets NOT Recommended for Experiments

| Dataset | Why Not |
|---|---|
| Simulated Call Centre (C) | Synthetic, 75% zero-wait, only 4 features. Mention as "pipeline test" in report, not in experiments. |
| Kaggle Tiwary (F) | 6KB, unknown provenance. Not downloaded, not worth it. |
| Kaggle Bangs (G) | Synthetic call center sim. Redundant with C. Not downloaded. |
| Lawson BINUS (H) | Retail, not banking. Download only if time permits. |

---

## 9. Key Validation Questions — Answered

### Q1: "Is Anonymous Bank really the best PRIMARY external dataset, or should the role be split?"

**Answer: Anonymous Bank IS the best primary external dataset for ML benchmarking.** No other publicly available dataset has:
- 444K real records with second-level timestamps
- Server identity for active-counter reconstruction
- 6 service types for multi-service queue modeling
- Full queue lifecycle enabling state reconstruction

However, **Ogun should NOT be dismissed**. It serves a different, complementary role: domain validation. The combination is stronger than either alone.

**Recommended split:**
- Anonymous Bank → ML model training & evaluation (Experiment 1)
- Ogun → Independent banking-domain distribution validation (Experiment 2)

### Q2: "Can multiple datasets strengthen the evidence without incorrectly merging incompatible distributions?"

**Answer: YES, and this is exactly the right approach.**

Multiple datasets strengthen evidence when each serves a specific role:
1. Anonymous Bank proves "ML works better than formula on real queue data"
2. Ogun proves "our wait-time predictions are realistic for actual bank branches"
3. QMS Synthetic proves "the pipeline handles the full QGo feature schema"
4. QMS_REAL proves "the system works in production"

**DO NOT merge** these datasets. They have:
- Different domains (call center vs physical bank vs synthetic)
- Different feature availability (11 vs 6 vs 10 features)
- Different temporal resolution (seconds vs hours)
- Different time periods (1999 vs 2018 vs 2026)
- Different target semantics (telephone wait vs branch wait vs formula)

Merging would produce a statistically incoherent dataset. The multi-dataset approach is more scientifically defensible.

### Q3: "Which datasets should actually be used in FYP experiments, and which should only be mentioned as supplementary/reference?"

| Dataset | In Experiments? | In Report? |
|---|---|---|
| Anonymous Bank | **YES** — Experiment 1 | YES — primary external |
| Ogun Nigerian | **YES** — Experiment 2 (distribution validation) | YES — domain validation |
| QMS Synthetic | **YES** — Experiment 3 (pipeline validation) | YES — engineering validation |
| QMS_REAL | **YES** — Experiment 4 (when available) | YES — production goal |
| Simulated CC | NO | YES — mentioned as pipeline test |
| Kaggle Tiwary | NO | YES — mentioned as "searched, rejected" |
| Kaggle Bangs | NO | YES — mentioned as "searched, rejected" |
| Lawson BINUS | NO | YES — mentioned as "found, not banking" |

---

## 10. Discrepancy Audit

### Feature Count Discrepancy

Previous reports used different numbers (18, 19, 25, 26). The actual code:

- **WaitTimeFeatures.cs**: 25 properties + 1 computed property (`EffectiveAvgServiceMinutes`)
- The 25 properties are the feature schema
- `EffectiveAvgServiceMinutes` is computed: `RollingAvgServiceMinutes ?? DefaultAvgServiceMinutes`
- It is NOT a separate model input — it is a helper for the formula estimator
- **MlTrainingObservation.cs**: 25 feature fields + identity/timing/target fields + FeatureSchemaVersion
- **train_wait_model.py**: Uses only 10 numeric + 1 categorical = **11 model input features** (QueueLength, ActiveCounters, HourOfDay, DayOfWeek, IsPeakHour, DefaultAvgServiceMinutes, EnqueueSequence, EntryType, CheckedIn, BranchCode, ServiceCode)

**Correct counts:**
- QGo feature schema: **25 properties** (WaitTimeFeatures.cs)
- Computed helper: **1** (EffectiveAvgServiceMinutes — not a separate model input)
- Current model inputs: **11** (train_wait_model.py)
- Anonymous Bank header: **18 columns** (data has **19 fields** due to off-by-one row_num)

### Target Discrepancy — train_wait_model.py

**Confirmed:** The current `train_wait_model.py` EXPORT_QUERY uses:
```sql
DATEDIFF(second, q.CreatedAt, q.ServingStartedAt) / 60.0 AS WaitingMinutes
```

This is `ServingStartedAt - CreatedAt`, NOT `ServingStartedAt - InitialQueueEligibleAt`.

**For walk-in tickets:** CreatedAt = InitialQueueEligibleAt, so the values are identical.
**For online tickets:** CreatedAt (booking time) ≠ InitialQueueEligibleAt (slot start time). The current SQL would be WRONG for online tickets.

**Status:** Known issue. The correct fix should use InitialQueueEligibleAt. NOT fixing in this phase per instructions.

### InitialQueueEligibleAt Implementation

Verified in `QueueEntry.cs`:
```csharp
/// Online: AssignedSlotStart at booking creation. Walk-in: CreatedAt.
public DateTimeOffset? InitialQueueEligibleAt { get; set; }
```

And `QueueEligibleAt`:
```csharp
/// Updated on Pull Forward (set to PullForwardAt).
public DateTimeOffset? QueueEligibleAt { get; set; }
```

**Confirmed:** Pull Forward updates `QueueEligibleAt` but NOT `InitialQueueEligibleAt`. This is correct — the target ground truth is protected from Pull Forward changes.

---

## 11. Final Recommendation

### **B. MULTI-DATASET EXTERNAL VALIDATION**

This is the most scientifically defensible approach for an FYP:

```
┌─────────────────────────────────────────────────┐
│           MULTI-DATASET VALIDATION              │
├─────────────────────────────────────────────────┤
│                                                 │
│  Experiment 1: Anonymous Bank                   │
│  → "ML outperforms Formula on real queues"      │
│  → 11 features, 444K records                    │
│                                                 │
│  Experiment 2: Ogun Nigerian Banks              │
│  → "Our distributions match real bank data"     │
│  → Distribution validation, 52K records         │
│                                                 │
│  Experiment 3: QMS Synthetic                    │
│  → "Pipeline handles full 25-feature schema"    │
│  → 10 features, 20K records                     │
│                                                 │
│  Experiment 4: QMS_REAL (future)                │
│  → "Production model on real QGo data"          │
│  → All 25 features, ground truth target         │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Why B, not A or C:**
- **A (single dataset)** — Anonymous Bank alone is strong but single-source. Examiners may ask "but is a call center relevant to a bank branch?"
- **B (multi-dataset validation)** — Each dataset validates a specific claim. Ogun answers the domain question. QMS Synthetic answers the engineering question. Much harder to challenge in a viva.
- **C (combined training)** — Scientifically indefensible. Cannot merge 1999 Israeli call center + 2018 Nigerian bank + 2026 Malaysian synthetic data.

### Next Phase

**Phase 3.10: Anonymous Bank Adapter Implementation**
- Write `ml/adapt_anonymous_bank.py` with full feature reconstruction validation
- Produce `ml/ANONYMOUS_BANK_FEATURE_PROVENANCE.md`
- Include all sanity checks from Phase 3.8 prompt (PeopleAhead validation, ActiveCounters reconstruction, leakage audit, temporal split, spot checks)
- Do NOT train the model yet — only produce the canonical dataset

**Phase 3.11: Ogun Bank Distribution Analysis**
- Write `ml/adapt_ogun_bank.py` (simpler: extract X1/X2/X3 + clean MEAN rows)
- Statistical distribution analysis vs Anonymous Bank and QMS expectations
- Produce comparison visualizations

**Then:**
- Phase 4: Train Experiment 1 (Anonymous Bank ML benchmark)
- Phase 5: Run Experiment 2 (Ogun distribution validation)
- Phase 6: Run Experiment 3 (QMS Synthetic pipeline validation)

**STOP. Do not start ML training yet.**
