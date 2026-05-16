/*
  After inserting new rows into BRANCHES (e.g. scripts that set BranchCode > @Base),
  run this block with the same @Base so each new branch gets 7 weekday rows.

  Default: Mon–Fri 09:30–16:00, Sat–Sun closed (typical Public Bank–style retail window).
  Adjust the VALUES table if needed.
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
  AND NOT EXISTS (SELECT 1 FROM dbo.BRANCH_OPERATING_HOURS AS h WHERE h.BranchId = br.Id);
