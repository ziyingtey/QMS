/*
  Export wait-time training rows from operational QMS tables.

  Label (y): WaitingMinutes = time from enqueue (CreatedAt) to start of service (ServingStartedAt).
  Features (X): reconstructed at enqueue time where possible.

  Run in SSMS → Results → Save as CSV → ml/data/wait_training.csv
  Or let train_wait_model.py load via pyodbc using the same query.

  Requires completed tickets (State = 3) with ServingStartedAt set.
*/

USE QMS;
GO

SELECT
    q.Id AS TicketId,
    q.BranchId,
    b.BranchCode,
    q.ServiceTypeId,
    s.Code AS ServiceCode,
    s.DefaultAvgServiceMinutes,
    q.EntryType,
    q.EnqueueSequence,
    q.CheckedIn,
    /* Queue length at enqueue: tickets same lane created before this one not yet serving */
    (
        SELECT COUNT(*)
        FROM dbo.QUEUE_TICKETS AS q2
        WHERE q2.BranchId = q.BranchId
          AND q2.ServiceTypeId = q.ServiceTypeId
          AND q2.Id <> q.Id
          AND q2.CreatedAt < q.CreatedAt
          AND (q2.ServingStartedAt IS NULL OR q2.ServingStartedAt > q.CreatedAt)
    ) AS QueueLength,
    /* Snapshot proxy: active counters on this lane today (not true historical state — document in FYP) */
    (
        SELECT COUNT(*)
        FROM dbo.COUNTERS AS co
        INNER JOIN dbo.COUNTER_ALLOWED_SERVICES AS cas ON cas.CounterId = co.Id
        WHERE co.BranchId = q.BranchId
          AND cas.ServiceTypeId = q.ServiceTypeId
          AND co.Mode = 0
    ) AS ActiveCounters,
  DATEPART(hour, DATEADD(minute, b.ServiceZoneOffsetMinutes, q.CreatedAt)) AS HourOfDay,
    DATEPART(weekday, DATEADD(minute, b.ServiceZoneOffsetMinutes, q.CreatedAt)) AS DayOfWeek,
    CASE
        WHEN DATEPART(hour, DATEADD(minute, b.ServiceZoneOffsetMinutes, q.CreatedAt)) BETWEEN 9 AND 11
          OR DATEPART(hour, DATEADD(minute, b.ServiceZoneOffsetMinutes, q.CreatedAt)) BETWEEN 14 AND 16
        THEN 1 ELSE 0
    END AS IsPeakHour,
    DATEDIFF(second, q.CreatedAt, q.ServingStartedAt) / 60.0 AS WaitingMinutes,
    q.CreatedAt,
    q.ServingStartedAt
FROM dbo.QUEUE_TICKETS AS q
INNER JOIN dbo.BRANCHES AS b ON b.Id = q.BranchId
INNER JOIN dbo.SERVICES AS s ON s.Id = q.ServiceTypeId
WHERE q.State = 3
  AND q.ServingStartedAt IS NOT NULL
  AND q.ServingStartedAt > q.CreatedAt
ORDER BY q.CreatedAt;
