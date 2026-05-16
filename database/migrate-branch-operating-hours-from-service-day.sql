/*
  Optional one-time migration for databases that still have BRANCHES.ServiceDayStartMinutes / ServiceDayEndMinutes
  (older IH-QMS schema). Creates weekly rows Mon–Fri from those minutes, Sat–Sun closed, only when
  BRANCH_OPERATING_HOURS is completely empty. Any branch that still has no rows after this must be
  filled via SQL (e.g. cross-join pattern in insert scripts) or Manager weekly-hours PATCH.

  Safe to run multiple times: does nothing if BOH already has rows or legacy columns are gone.
*/

USE QMS;
GO

IF OBJECT_ID(N'dbo.BRANCH_OPERATING_HOURS', N'U') IS NULL
    THROW 50001, N'Run database/schema.sql first so BRANCH_OPERATING_HOURS exists.', 1;

IF COL_LENGTH(N'dbo.BRANCHES', N'ServiceDayStartMinutes') IS NULL
    OR COL_LENGTH(N'dbo.BRANCHES', N'ServiceDayEndMinutes') IS NULL
    RETURN;

IF EXISTS (SELECT 1 FROM dbo.BRANCH_OPERATING_HOURS)
    RETURN;

INSERT INTO dbo.BRANCH_OPERATING_HOURS (Id, BranchId, DayOfWeek, OpenTime, CloseTime, IsClosed)
SELECT
    NEWID(),
    b.Id,
    d.DayOfWeek,
    CASE WHEN d.IsWeekend = 1 THEN NULL
         ELSE CONVERT(time, DATEADD(MINUTE, b.ServiceDayStartMinutes, CAST('2000-01-01' AS datetime2))) END,
    CASE WHEN d.IsWeekend = 1 THEN NULL
         ELSE CONVERT(time, DATEADD(MINUTE, b.ServiceDayEndMinutes, CAST('2000-01-01' AS datetime2))) END,
    d.IsWeekend
FROM dbo.BRANCHES AS b
CROSS JOIN (
    VALUES
        (N'Monday', 0),
        (N'Tuesday', 0),
        (N'Wednesday', 0),
        (N'Thursday', 0),
        (N'Friday', 0),
        (N'Saturday', 1),
        (N'Sunday', 1)
) AS d(DayOfWeek, IsWeekend);
GO
