/*
  Fragment: after a branch INSERT script that declares @Base (new BranchCode > @Base),
  paste this block so only those new branches get 7 weekday rows.

  For “all branches missing hours”, use insert-branch-operating-hours-all-branches.sql instead.
  Edit times in the VALUES block as needed.
*/

INSERT INTO dbo.BRANCH_OPERATING_HOURS (Id, BranchId, DayOfWeek, OpenTime, CloseTime, IsClosed)
SELECT
    NEWID(),
    br.Id,
    d.DayOfWeek,
    d.OpenTime,
    d.CloseTime,
    d.IsClosed
FROM dbo.BRANCHES AS br
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
WHERE br.BranchCode > @Base
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.BRANCH_OPERATING_HOURS AS h
      WHERE h.BranchId = br.Id AND h.DayOfWeek = d.DayOfWeek);
