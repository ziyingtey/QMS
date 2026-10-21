/*
  Export wait-time training rows (schema v4) from dbo.ML_TRAINING_DATA.

  Same query as EXPORT_QUERY in train_wait_model.py (keep the two in sync). Each row is a snapshot the API
  wrote at QueueEligibleAt (WaitTimeFeatureBuilder.ToObservation), so all 27 model features are the live
  values at that moment; label WaitingMinutes = CalledAt - QueueEligibleAt (ActualWaitingMinutes).

  Only FeatureSchemaVersion = 'v4' rows are exported: v3 rows lack IdleListeningCounters /
  CounterSimEtaMinutes (NULL) and v2 rows use older definitions. Requires migrations 004 + 005.
  BranchCode is exported as an identity / CV sort column only; it is not a model feature.

  Run in SSMS -> Results -> Save as CSV -> ml/data/wait_training.csv, then
    python train_wait_model.py --csv data/wait_training.csv --no-external
  or let train_wait_model.py run it directly via pyodbc (--connection-string or env QMS_SQL_CONNECTION).
*/

USE QMS;
GO

SELECT
    o.QueueEntryId AS TicketId,
    o.BranchId,
    o.BranchCode,
    o.ServiceTypeId,
    o.ServiceCode,
    o.TicketPrefix,
    o.DefaultAvgServiceMinutes,
    o.RollingAvgServiceMinutes,
    o.EntryType,
    o.EnqueueSequence,
    CAST(o.CheckedIn AS INT) AS CheckedIn,
    o.QueueLength,
    o.CrossLaneQueueLength,
    o.PeopleAhead AS PeopleAheadCallNext,
    o.NowServing,
    o.ActiveCounters,
    o.ServiceEligibleActiveCounters AS ListeningCounters,
    o.IdleListeningCounters,
    o.CounterSimEtaMinutes,
    o.HourOfDay,
    o.DayOfWeek,
    CAST(o.IsPeakHour AS INT) AS IsPeakHour,
    o.SlotActive,
    o.CallNextPriority,
    o.SlotDurationMinutes,
    o.EarlyCallMinutes,
    o.MinutesUntilSlotEnd,
    o.MinutesSinceSlotStart,
    o.OnlineSlotsPerSlot,
    o.OnlineBookedInSlot,
    o.WalkInInSlot,
    o.ActualWaitingMinutes AS WaitingMinutes,
    o.SnapshotAt,
    o.CalledAt
FROM dbo.ML_TRAINING_DATA AS o
WHERE o.FeatureSchemaVersion = 'v4'
  AND o.ActualWaitingMinutes IS NOT NULL
  AND o.ActualWaitingMinutes >= 0
ORDER BY o.SnapshotAt;
GO
