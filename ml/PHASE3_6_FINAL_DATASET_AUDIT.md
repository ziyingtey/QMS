# Phase 3.6: Final Dataset Audit & Selection

**Date:** 2026-09-14
**Objective:** Comprehensive audit of all candidate datasets, final selection recommendation for QMS FYP.

---

## 1. QMS ML Pipeline Summary

### Target Definition
```
ActualWaitingMinutes = ServingStartedAt - InitialQueueEligibleAt
```
- **InitialQueueEligibleAt** is immutable: online = SlotStart, walk-in = CreatedAt
- Captured via `MlTrainingObservation` entity (snapshot at prediction time, target filled when serving starts)

### Feature Schema (25 features in WaitTimeFeatures.cs)

| Category | Features | Count |
|---|---|---|
| Queue state | QueueLength, PeopleAhead, OnlineQueueLength, WalkInQueueLength, NowServing | 5 |
| Counter/staff | ActiveCounters, ServiceEligibleActiveCounters | 2 |
| Service duration | RollingAvgServiceMinutes, DefaultAvgServiceMinutes | 2 |
| Temporal | HourOfDay, DayOfWeek, IsPeakHour | 3 |
| Ticket identity | EntryType, CheckedIn, EnqueueSequence | 3 |
| Slot system | SlotDurationMinutes, MinutesUntilSlotEnd, MinutesSinceSlotStart | 3 |
| Online/walk-in mix | OnlineQuotaPercent, OnlineBookedInSlot, WalkInInSlot | 3 |
| Pull forward | WasPulledForward, PullForwardCount | 2 |
| Identifiers | BranchCode, ServiceCode | 2 |

Plus 1 computed: `EffectiveAvgServiceMinutes = RollingAvgServiceMinutes ?? DefaultAvgServiceMinutes`

### Current Model
- Algorithm: HistGradientBoostingRegressor (scikit-learn)
- Training data: 20K synthetic rows (generate_seed_data.py)
- Synthetic MAE: 4.848 min (baseline 5.232)
- **Known issues:** Random split (should be temporal), target uses CreatedAt (should be InitialQueueEligibleAt)

---

## 2. All Candidate Datasets

| # | Dataset | Source | Domain | Records | Real/Synthetic | Collection Period | Open Access |
|---|---|---|---|---|---|---|---|
| 1 | **Anonymous Bank Call Center** | Technion / Ilan Guedj & Avi Mandelbaum | Israeli bank call center | 444,448 | **Real** | Jan–Dec 1999 | Yes |
| 2 | **Nigerian Bank Queue Survey** | Bishop et al. (PMC5997939) | Physical bank branch (Nigeria) | ~54,000 | Real (some sheets suspicious) | 2018, 12 weeks | Yes |
| 3 | **Simulated Call Centre** | Kaggle | Generic call center | 51,708 | **Synthetic** | 2021 (simulated) | Yes |
| 4 | **Lawson BINUS Syahdan** | Zenodo 18159579 | Retail convenience store | Unknown | **Real observational** | ~2025 | Yes (CC-BY-4.0) |
| 5 | **QMS Synthetic Seed** | This project (generate_seed_data.py) | Malaysian bank branch | 20,000 | **Synthetic** | Generated | N/A |
| 6 | **Sanjeeb Tiwary Queue** | Kaggle | Unknown | ~100 rows | **Unknown** (6KB, suspicious tags) | Unknown | Yes |
| 7 | **Call Centre Queue Sim** | Kaggle (Donovan Bangs) | Generic call center | ~50K | **Synthetic** (simmer R) | Simulated | Yes |
| 8 | **MIMIC-IV-ED** | PhysioNet | Hospital ED | 425,000 | **Real** | 2011–2019 | **Credentialed** |
| 9 | **Bank Teller Queue Staffing** | Zenodo 17711117 | Banking | N/A | Reference tables only | N/A | Yes |
| 10 | **Access Bank Anyigba** | Paper only | Nigerian bank | N/A | Summary stats in paper | 2024 | No raw data |
| 11 | **Bank BJB West Bandung** | Paper only | Indonesian bank | N/A | Summary stats in paper | 2024 | No raw data |
| 12 | **Bank SulutGo Bintauna** | Paper only | Indonesian bank | N/A | Summary stats in paper | 2025 | No raw data |
| 13 | **XYZ Bank 2025** | Not found | Claimed Mendeley | N/A | Not found | N/A | Does not exist |

---

## 3. QMS Feature Compatibility Matrix

### Legend
- **A** = Available directly
- **D** = Derivable from timestamps
- **P** = Partially available (proxy)
- **N** = Not available
- **—** = Dataset has no raw data

| QMS Feature | Anonymous Bank | Nigerian Bank | Simulated CC | Lawson BINUS | QMS Synthetic | MIMIC-IV-ED |
|---|---|---|---|---|---|---|
| QueueLength | **D** | N | N | **A** | **A** | N |
| PeopleAhead | **D** | N | N | P | **A** | N |
| OnlineQueueLength | N | N | N | N | **A** | N |
| WalkInQueueLength | N | N | N | N | **A** | N |
| NowServing | **D** | N | N | P | **A** | N |
| ActiveCounters | **D** | N | N | **A** | **A** | N |
| ServiceEligibleCounters | P | N | N | P | **A** | N |
| RollingAvgServiceMin | **D** | **D** | **D** | **D** | **A** | **D** |
| DefaultAvgServiceMin | **D** | **D** | **D** | **D** | **A** | **D** |
| HourOfDay | **D** | P (hour only) | **D** | **D** | **A** | **D** |
| DayOfWeek | **A** | **A** | **D** | **D** | **A** | **D** |
| IsPeakHour | **D** | P | **D** | **D** | **A** | **D** |
| EntryType | P (priority) | N | N | N | **A** | P (acuity) |
| CheckedIn | N | N | N | N | **A** | N |
| EnqueueSequence | **D** | **A** | **A** | P | **A** | N |
| SlotDurationMinutes | N | N | N | N | **A** | N |
| MinutesUntilSlotEnd | N | N | N | N | **A** | N |
| MinutesSinceSlotStart | N | N | N | N | **A** | N |
| OnlineQuotaPercent | N | N | N | N | **A** | N |
| OnlineBookedInSlot | N | N | N | N | **A** | N |
| WalkInInSlot | N | N | N | N | **A** | N |
| WasPulledForward | N | N | N | N | **A** | N |
| PullForwardCount | N | N | N | N | **A** | N |
| BranchCode | P (VRU line) | **D** | N | N | **A** | N |
| ServiceCode | **A** | N | N | N | **A** | P (complaint) |
| **ActualWaitingMinutes** | **A** (q_time) | **A** (X1) | **A** (wait_length) | **D** | **A** | **D** |
| **Feature coverage** | **12/25** | **5/25** | **4/25** | **~8/25** | **25/25** | **3/25** |

---

## 4. Dataset Quality Scoring

### Weighted Criteria

| Criterion | Weight | Description |
|---|---|---|
| Feature richness | 25% | How many QMS features can be derived? |
| Data quality | 20% | Timestamp granularity, consistency, documentation |
| Domain relevance | 20% | How close to physical bank branch queue? |
| Dataset size | 15% | Number of usable records |
| Target compatibility | 10% | Semantic match with QMS target definition |
| Temporal coverage | 10% | Days/months of data, temporal diversity |

### Scores (out of 10)

| Dataset | Feature | Quality | Domain | Size | Target | Temporal | **Weighted** |
|---|---|---|---|---|---|---|---|
| **Anonymous Bank** | 7 | 9 | 6 | 9 | 8 | 9 | **7.7** |
| **Nigerian Bank** | 2 | 4 | 9 | 4 | 7 | 3 | **4.5** |
| **Simulated CC** | 2 | 6 | 3 | 6 | 6 | 7 | **4.3** |
| **Lawson BINUS** | 5 | 7 | 5 | 5 | 6 | 5 | **5.5** |
| **QMS Synthetic** | 10 | 5 | 10 | 5 | 10 | 3 | **7.5** |
| **MIMIC-IV-ED** | 2 | 8 | 2 | 9 | 5 | 8 | **4.8** |

---

## 5. Key Decision: Is Any 2020–2026 Dataset Better Than Anonymous Bank?

### Answer: **NO.**

**Justification:**

1. **No real bank queue dataset from 2020–2026 exists publicly.** Despite exhaustive searching across 8+ repositories with dozens of query combinations, no real bank branch queue dataset with individual ticket timestamps was found.

2. **The Lawson BINUS dataset** (2026, retail) is the only new real observational dataset with queue timing data, but:
   - Wrong domain (convenience store, not bank)
   - Unknown record count (need to download and inspect)
   - Fewer derivable features than Anonymous Bank
   - No service type differentiation

3. **Indonesian/Nigerian bank papers** (2024–2025) exist but contain only aggregate M/M/c parameters (λ, μ), not raw data.

4. **Anonymous Bank** (1999) remains superior because:
   - 444K records with second-level timestamps
   - Server identity enables counter/active-server derivation
   - 6 service types map to QMS ServiceCode
   - Customer priority maps partially to EntryType
   - Well-documented, heavily cited (Mandelbaum et al.)
   - Full queue lifecycle (VRU → queue → service)

5. **The 1999 date is a limitation but NOT disqualifying for FYP:**
   - Queueing dynamics (Little's Law, server utilization patterns) are domain-invariant
   - The model learns *relationships* (queue length × service time → wait), not calendar-specific patterns
   - The paper can acknowledge this as a limitation while arguing the relationships transfer

---

## 6. Dataset Role Assignment

### PRIMARY: Anonymous Bank Call Center (1999 Israel)
- **Use:** ML pipeline validation, feature importance analysis, ML vs Formula comparison
- **Adapter needed:** `adapt_anonymous_bank.py` — parse 19-field TSV, reconstruct queue state at snapshot, derive 12 features
- **Limitations to acknowledge:** Call center (not branch), 1999 (old), no online booking, no slot system

### SECONDARY: QMS Synthetic Seed Data
- **Use:** Pipeline testing, full-feature-coverage smoke tests, development iteration
- **Note:** Already exists at `ml/generate_seed_data.py` (20K rows)

### TERTIARY: Nigerian Bank Queue Survey
- **Use:** Domain validation only — verify that QMS wait time distributions are realistic for physical bank branches
- **NOT for training** — only 5 features, hour-level timestamps

### EVENTUAL PRIMARY: QMS Real Data
- **Use:** Production training once sufficient data is collected
- **Pipeline:** MlSnapshotHostedService captures features → StartServiceAsync attaches target → export for training
- **Minimum viable:** ~1,000 completed tickets with ActualWaitingMinutes

### NOT RECOMMENDED

| Dataset | Why Not |
|---|---|
| Simulated Call Centre | Synthetic, 87.6% zero-wait, almost no features |
| Lawson BINUS | Potentially useful as supplementary, but untested (record count unknown). Download and inspect if time permits. |
| MIMIC-IV-ED | Credentialed access, wrong domain, would delay timeline |
| Sanjeeb Tiwary (Kaggle) | 6KB, unknown provenance, likely toy data |
| Donovan Bangs (Kaggle) | Confirmed synthetic (simmer R package) |
| Bank Teller Queue Staffing (Zenodo) | Reference tables only, no actual data |

---

## 7. Recommended Next ML Experiments

### Experiment 1: Anonymous Bank Feature Engineering
1. Write `ml/adapt_anonymous_bank.py`:
   - Parse 12 monthly .txt files (handle off-by-one: 19 fields, field 0 = row number)
   - Filter: outcome == "AGENT" AND q_time > 0 (~196K rows)
   - At each q_start snapshot, derive: QueueLength, PeopleAhead, NowServing, ActiveCounters, RollingAvgServiceMinutes, HourOfDay, DayOfWeek, IsPeakHour, ServiceCode, EnqueueSequence
   - Target: q_time / 60.0
   - Time-based split: Jan–Oct train, Nov–Dec test
2. Train HistGradientBoostingRegressor on derived features
3. Compare MAE against simple formula: `PeopleAhead × AvgService / ActiveCounters`
4. Report feature importances

### Experiment 2: QMS Real Data Baseline
1. Export MlTrainingObservation records with non-null ActualWaitingMinutes
2. Train same model on real QMS data (even if small)
3. Compare error distribution vs Anonymous Bank model

### Experiment 3: Transfer Learning Test
1. Pre-train on Anonymous Bank data (available features only)
2. Fine-tune on QMS real data (when available)
3. Compare vs training from scratch on QMS data alone

---

## 8. Provenance Certification

Every dataset recommendation in this report follows these rules:

| Rule | Status |
|---|---|
| Publication date ≠ collection period (verified for each) | ✅ |
| Real vs synthetic distinguished by evidence, not title | ✅ |
| No dataset recommended without verifying downloadability | ✅ |
| Feature availability classified as OBSERVED/DERIVED/PROXY/UNAVAILABLE | ✅ |
| Data leakage risks documented for each candidate | ✅ (see PHASE3_DATASET_EVALUATION.md §6) |
| "XYZ Bank" confirmed NOT findable, not just "not found yet" | ✅ (5 Mendeley queries, 0 results) |

---

## 9. Viva Defense Points

**Q: Why use a 1999 call center dataset for a 2026 bank branch system?**
> A: After systematic search of Kaggle, Zenodo, Mendeley, Harvard Dataverse, PhysioNet, and GitHub, no publicly available real bank branch queue dataset with individual ticket timestamps exists. The Anonymous Bank dataset (444K records, 18 columns, second-level timestamps) is the most feature-rich real queueing dataset available. While the domain differs (telephone vs physical), the underlying queueing dynamics (queue length × service time / active servers → wait time) are governed by the same mathematical principles (Little's Law). We use this dataset for ML pipeline validation and feature importance analysis, not for production deployment — the production model will be trained on QMS's own data.

**Q: Why not just use synthetic data?**
> A: Synthetic data (our 20K seed dataset) has perfect feature coverage but artificial distributions. The Anonymous Bank dataset provides real-world noise, correlations, and edge cases (rush hours, server breaks, priority effects) that synthetic data cannot capture. Using real data for validation ensures the model handles real-world patterns, even if the domain is adjacent.

**Q: Is there any 2020+ dataset you could use instead?**
> A: The only real 2020+ service queue dataset found is Lawson BINUS Syahdan (2026, retail convenience store, Zenodo). It has arrival rates, service times, and queue lengths from field observation, but it's retail (not banking), has unknown record count, and fewer derivable features than Anonymous Bank. It could supplement our analysis but does not replace the Anonymous Bank dataset's depth.
