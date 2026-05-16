/*
  SSMS: load weekly hours for every branch that does not yet have BRANCH_OPERATING_HOURS rows.
  Edit the VALUES block (times / closed flags) before running.

  Requires: table dbo.BRANCH_OPERATING_HOURS (see database/schema.sql).
*/

USE QMS;
GO

INSERT INTO dbo.BRANCH_OPERATING_HOURS (Id, BranchId, DayOfWeek, OpenTime, CloseTime, IsClosed)
SELECT
    NEWID(),
    b.Id,
    d.DayOfWeek,
    d.OpenTime,
    d.CloseTime,
    d.IsClosed
FROM dbo.BRANCHES AS b
CROSS JOIN (
    VALUES
        (N'Monday',    CAST('09:30' AS time), CAST('16:00' AS time), 0),
        (N'Tuesday',   CAST('09:30' AS time), CAST('16:00' AS time), 0),
        (N'Wednesday', CAST('09:30' AS time), CAST('16:00' AS time), 0),
        (N'Thursday',  CAST('09:30' AS time), CAST('16:00' AS time), 0),
        (N'Friday',    CAST('09:30' AS time), CAST('16:00' AS time), 0),
        (N'Saturday',  NULL, NULL, 1),
        (N'Sunday',    NULL, NULL, 1)
) AS d(DayOfWeek, OpenTime, CloseTime, IsClosed)
WHERE NOT EXISTS (SELECT 1 FROM dbo.BRANCH_OPERATING_HOURS AS h WHERE h.BranchId = b.Id);
GO
