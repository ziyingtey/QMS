# Phase 2: ML Training Data Pipeline Design

## A. Prediction Target

**Target: ServingStartedAt - InitialQueueEligibleAt**

```
ActualWaitingMinutes = (ServingStartedAt - InitialQueueEligibleAt).TotalMinutes
```

| Entry Type | InitialQueueEligibleAt | Example |
|------------|----------------------|---------|
| Online | AssignedSlotStart (at booking creation) | Booked 08:00, Slot 10:30 → Eligible 10:30 |
| Walk-in | CreatedAt | Arrived 10:12 → Eligible 10:12 |

**Why InitialQueueEligibleAt, not QueueEligibleAt:**
- `QueueEligibleAt` changes on Pull Forward
- The model predicts *total operational wait from first eligibility to service*
- Pull Forward is something that *happens during* the wait, not a reset of the wait
- If we used `QueueEligibleAt` after Pull Forward, the model would see artificially short waits that don't reflect the customer's actual experience

**Exclusions (do NOT create training observations for):**
- State != Completed (never reached Serving)
- Missed / Cancelled / NoShow
- ServingStartedAt is null
- ActualWaitingMinutes < 0 (data error)
- InitialQueueEligibleAt is null (legacy row without Phase 1 data)

---

## B. Prediction Snapshot Timing

**Primary snapshot: at QueueEligibleAt moment**

For each ticket that eventually reaches Serving, create ONE training observation. The feature snapshot is captured **at or shortly after QueueEligibleAt** — the moment the customer enters the active queue.

| Event | Snapshot? | Reason |
|-------|-----------|--------|
| Online booking created (08:00) | No | Not yet eligible. Queue state unknown. |
| Walk-in created (10:12) | **Yes** | Walk-in is immediately eligible. |
| Online slot starts (10:30) | **Yes** | Now eligible. Snapshot queue state at this moment. |
| Pull Forward (10:20) | Optional | Could create a second prediction point, but adds complexity. Phase 1 approach: skip. |
| ServingStartedAt (10:42) | No — attach target only | This is when we know ActualWaitingMinutes. |

**Implementation strategy:**

Two-phase write:
1. **Snapshot phase**: When a ticket becomes eligible (walk-in creation, or a periodic job that detects online tickets whose slot has started), capture queue state features → write `MlTrainingObservation` with `ActualWaitingMinutes = NULL`.
2. **Target phase**: When `ServingStartedAt` is set (in `StartServiceAsync`), compute `ActualWaitingMinutes = ServingStartedAt - InitialQueueEligibleAt` and UPDATE the existing observation row.

**Why not just capture everything at EndService?**

Because at EndService time, the queue state has changed dramatically since the customer entered the queue. Features like `QueueLength`, `PeopleAhead`, `ActiveCounters` at EndService time do NOT represent what the model would see at prediction time. The model predicts ETA when a customer *joins the queue*, not when they leave.

**Practical simplification for Phase 2 MVP:**

Because implementing a real-time "on eligibility" snapshot trigger adds significant complexity (especially for online bookings where eligibility = slot start, which requires a periodic job), Phase 2 MVP can:

1. **Walk-in**: Snapshot immediately in `WalkInAsync()` (queue state known at creation)
2. **Online**: Snapshot in `StartServiceAsync()` BUT reconstruct the queue state *as it was at QueueEligibleAt*. This is an approximation — use the backfill query approach from the existing `train_wait_model.py` SQL, adapted to use `InitialQueueEligibleAt` instead of `CreatedAt`.

Phase 3 (future): Add a periodic background job that snapshots online tickets when their slot starts.

---

## C. Data Leakage Prevention

**Golden rule: Every feature must represent information available at `SnapshotAt` time.**

| Feature | OK | Leaky |
|---------|----|----|
| QueueLength at SnapshotAt | yes | QueueLength at ServingStartedAt |
| PeopleAhead at SnapshotAt | yes | Final queue position |
| ActiveCounters at SnapshotAt | yes | Counters that opened later |
| RollingAvgServiceMinutes (last 30 days before SnapshotAt) | yes | Including today's services after SnapshotAt |
| ServingStartedAt | NEVER as feature | only as target component |
| ServingEndedAt | NEVER | |
| ActualWaitingMinutes | NEVER as feature | only as target |
| WasPulledForward | yes if snapshot is after PF | not if snapshot is before PF |

**Historical service duration rule:**
```
RollingAvgServiceMinutes = AVG(DurationSeconds/60)
FROM SERVICE_LOGS
WHERE EndedAt < SnapshotAt
AND EndedAt >= SnapshotAt - 30 days
AND ServiceTypeId = {same service}
```

Never include service records that completed after the snapshot.

---

## D. Feature List

### Core Queue State (available at prediction time)

| Feature | Type | Source | Description |
|---------|------|--------|-------------|
| QueueLength | int | COUNT(Waiting in same branch+service) | Total waiting tickets for this service lane |
| PeopleAhead | int | COUNT(Waiting, same service, earlier slot+seq) | Tickets ahead of this customer |
| OnlineQueueLength | int | COUNT(Waiting, Online, same service) | Online tickets waiting |
| WalkInQueueLength | int | COUNT(Waiting, WalkIn, same service) | Walk-in tickets waiting |
| ActiveCounters | int | COUNT(Active counters in branch) | Total active counters |
| ServiceEligibleActiveCounters | int | COUNT(Active counters serving this service type) | Counters that can serve this service |
| NowServing | int | COUNT(Serving, same service) | Currently being served |

### Service Duration History

| Feature | Type | Source | Description |
|---------|------|--------|-------------|
| RollingAvgServiceMinutes | float | SERVICE_LOGS last 30 days | Moving average service duration |
| RollingMedianServiceMinutes | float | SERVICE_LOGS last 30 days | Moving median (more robust) |
| RollingP90ServiceMinutes | float | SERVICE_LOGS last 30 days | 90th percentile |
| DefaultAvgServiceMinutes | int | ServiceType entity | Configured average (fallback when no history) |

### Time Features

| Feature | Type | Source | Description |
|---------|------|--------|-------------|
| HourOfDay | int | SnapshotAt local time | 0-23 |
| DayOfWeek | int | SnapshotAt local time | 0=Sun..6=Sat (or 1=Mon..7=Sun, match training) |
| IsPeakHour | bool | 9-11 or 14-16 | Peak flag |
| MinutesSinceWindowOpen | float | SnapshotAt - today's open time | How far into operating hours |

### Entry / Customer Features

| Feature | Type | Source | Description |
|---------|------|--------|-------------|
| EntryType | int | QueueEntry | 0=Online, 1=WalkIn |
| CheckedIn | bool | QueueEntry | Whether customer has arrived |
| EnqueueSequence | long | QueueEntry | Position within slot bucket |

### Slot / Capacity Features

| Feature | Type | Source | Description |
|---------|------|--------|-------------|
| SlotDurationMinutes | int | Branch | Slot window size |
| MinutesUntilSlotEnd | float | SlotEnd - SnapshotAt | Time remaining in slot |
| MinutesSinceSlotStart | float | SnapshotAt - SlotStart | How far into slot |
| OnlineQuotaPercent | int | Branch | Configured online quota |
| OnlineBookedInSlot | int | COUNT | Online bookings in same slot |
| WalkInInSlot | int | COUNT | Walk-ins in same slot |
| SlotTotalCapacity | int | CapacityEngine | Computed slot capacity |

### Pull Forward Features

| Feature | Type | Source | Description |
|---------|------|--------|-------------|
| WasPulledForward | bool | QueueEntry.PullForwardAt != null | Whether ticket was pulled forward |
| PullForwardCount | int | COUNT(QueueMovements for this entry) | Number of movements |
| MinutesSinceInitialEligibility | float | SnapshotAt - InitialQueueEligibleAt | Total time since first eligible |
| OriginalSlotOffsetMinutes | float | OriginalSlotStart - AssignedSlotStart | How far forward was pulled |

### Branch Identity

| Feature | Type | Source | Description |
|---------|------|--------|-------------|
| BranchCode | int | Branch | Branch identifier |
| ServiceCode | string (categorical) | ServiceType.Code | Service type code |

---

## E. Online Example

```
08:00  CreateBookingAsync
         CreatedAt = 08:00
         InitialQueueEligibleAt = 10:30 (= SlotStart)
         No snapshot yet (not eligible)

10:25  CheckInAsync
         CheckedIn = true

10:30  Slot starts → SNAPSHOT captured
         SnapshotAt = 10:30
         QueueLength = 7 (for this service)
         PeopleAhead = 3 (in same slot, earlier seq)
         ActiveCounters = 5, ServiceEligibleCounters = 2
         RollingAvgServiceMinutes = 12.3
         EntryType = 0 (Online)
         CheckedIn = true
         WasPulledForward = false
         ActualWaitingMinutes = NULL (not yet known)

10:42  ServingStartedAt set → UPDATE observation
         ActualWaitingMinutes = 10:42 - 10:30 = 12.0 min
```

## F. Walk-in Example

```
10:12  WalkInAsync → slot 11:00-11:30
         CreatedAt = 10:12
         InitialQueueEligibleAt = 10:12
         SNAPSHOT captured immediately:
           SnapshotAt = 10:12
           QueueLength = 9
           PeopleAhead = 6
           ServiceEligibleActiveCounters = 3
           RollingAvgServiceMinutes = 8.5
           EntryType = 1 (WalkIn)
           CheckedIn = true
           WasPulledForward = false
           ActualWaitingMinutes = NULL

10:29  ServingStartedAt → UPDATE
         ActualWaitingMinutes = 10:29 - 10:12 = 17.0 min
```

## G. Pull Forward Example

```
10:12  WalkInAsync → slot 11:00-11:30
         InitialQueueEligibleAt = 10:12
         SNAPSHOT captured: SnapshotAt = 10:12, WasPulledForward = false

10:20  PullForwardWalkInsAsync → moved to 10:00-10:30 slot
         QueueMovement recorded
         QueueEligibleAt = 10:20
         PullForwardAt = 10:20
         InitialQueueEligibleAt = 10:12 (unchanged!)

10:29  ServingStartedAt → UPDATE observation
         ActualWaitingMinutes = 10:29 - 10:12 = 17.0 min
         (training row also records: WasPulledForward=true, PullForwardCount=1)

Note: The snapshot was taken at 10:12 with the queue state at that moment.
The model learns: "given this queue state, this customer waited 17 min."
The Pull Forward info is recorded as features but the TARGET stays based on
InitialQueueEligibleAt, reflecting total operational wait.
```

---

## H. Retraining Strategy

```
Historical observations (MlTrainingObservation with ActualWaitingMinutes != NULL)
    ↓
Data validation
    - Exclude: ActualWaitingMinutes < 0 or > 120
    - Exclude: missing critical features
    - Exclude: InitialQueueEligibleAt is null
    ↓
Time-based train/validation/test split
    - Train: all data up to T-30 days
    - Validation: T-30 to T-15
    - Test: T-15 to T (most recent)
    ↓
Train candidate model (HistGradientBoostingRegressor)
    ↓
Evaluate on test set:
    - MAE, RMSE, MedianAE, P90, P95
    - Breakdown by: branch, service, entry type, peak/off-peak, queue size buckets
    ↓
Compare against:
    - Current production model (if exists)
    - Formula baseline: PeopleAhead * AvgServiceMinutes / ActiveCounters
    ↓
Acceptance criteria:
    - ML MAE < Formula MAE on test set
    - ML P90 < Formula P90 on test set
    - No degradation on any major branch/service segment
    ↓
If accepted:
    - Assign version (e.g., wait-model-v1.0)
    - Export ONNX
    - Record: ModelVersion, FeatureSchemaVersion, TrainingPeriod, Metrics
    ↓
Deploy: copy .onnx to API runtime path
```

**Walk-forward validation** (preferred when enough data):
- Train on month 1-3, test on month 4
- Train on month 1-4, test on month 5
- Average metrics across folds

---

## I. Cold Start / Fallback Strategy

| Condition | Strategy |
|-----------|----------|
| No model file (.onnx missing) | Formula fallback |
| ONNX inference fails | Formula fallback, log warning |
| < 100 training observations for a branch+service | Formula fallback for that branch+service |
| < 500 total observations | Do not deploy ML, use formula only |
| Model MAE worse than formula | Do not deploy, keep formula |

**Formula fallback (improved):**
```
ETA = PeopleAhead * RollingAvgServiceMinutes / ServiceEligibleActiveCounters
```

Use `RollingAvgServiceMinutes` from SERVICE_LOGS when available (>= 10 records), else `DefaultAvgServiceMinutes`.

Use `ServiceEligibleActiveCounters` instead of all active counters.

---

## J. Model Versioning + Prediction Logging

**WaitPrediction entity (new):**
```
Id                      GUID
QueueEntryId            GUID
PredictedAt             DateTimeOffset
PredictedWaitMinutes    float
PredictionSource        int (0=ML, 1=FormulaFallback)
ModelVersion            string (nullable, e.g. "wait-model-v1.0")
FeatureSchemaVersion    string (nullable, e.g. "features-v2")
```

Every production prediction logged. After ServingStartedAt is known, we can compute:
```
PredictionError = ActualWaitingMinutes - PredictedWaitMinutes
```

This enables ongoing model monitoring without retraining.

---

## K. Required DB Changes (Phase 2)

1. **Expand MlTrainingObservation** (or create new entity) with ALL snapshot features + ActualWaitingMinutes (nullable until Serving starts)
2. **New WaitPrediction table** for prediction logging
3. Migration SQL for both

---

## L. Required Code Changes (Phase 2)

1. **WaitTimeFeatures** — feature object (replaces 11-parameter signature)
2. **WaitTimeFeatureBuilder** — centralized feature construction from QMS state
3. **MlTrainingObservation snapshot** in WalkInAsync + StartServiceAsync (target attachment)
4. **Update train_wait_model.py** — SQL query uses `InitialQueueEligibleAt` instead of `CreatedAt`, add new features
5. **IWaitTimeEstimator** interface + formula implementation
6. (Later) ONNX inference implementation

---

## M. Current Model Issues

The existing `train_wait_model.py` has critical problems:

1. **Target uses CreatedAt**: `DATEDIFF(second, q.CreatedAt, q.ServingStartedAt)` — wrong for online bookings
2. **Random train/test split**: Not time-based — causes future leakage in temporal data
3. **Synthetic seed data**: 20k rows generated, not real queue behavior
4. **Missing features**: No PeopleAhead, no ServiceEligibleCounters, no slot features, no historical service duration
5. **MAE 4.8 min on synthetic data**: Cannot be trusted as production performance indicator

These must ALL be addressed before ML can go into production inference.
