/*
  First-time counters per branch (demo / greenfield).

  Inserts counters 1–8 for every row in BRANCHES that does not already have that Number.
  - Mode = 2 (Closed) — not accepting customers until a manager assigns allowed lanes and sets Open.
  - No StaffId, no CurrentServiceTypeId, no COUNTER_ALLOWED_SERVICES rows (lanes must be set in staff-web Manager).

  CounterMode (INT): 0 = Active, 1 = Break, 2 = Closed  (see QMS.Domain.Enums.CounterMode)

  Prerequisites: dbo.BRANCHES exists; schema from database/schema.sql applied.
  Optional before opening counters: insert dbo.SERVICES per branch so the manager can tick lanes.

  Order of operations for a live branch:
    1) SERVICES for the branch
    2) This script (8 × Closed counters)
    3) STAFF (see insert-staff-sample.sql)
    4) Manager UI: assign allowed lane(s) per counter → assign teller → Open
*/

USE QMS;
GO

INSERT INTO dbo.COUNTERS (Id, BranchId, Number, Mode, StaffId, CurrentServiceTypeId)
SELECT NEWID(), b.Id, n.n, 2, NULL, NULL
FROM dbo.BRANCHES AS b
CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6), (7), (8)) AS n(n)
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.COUNTERS AS c
    WHERE c.BranchId = b.Id AND c.Number = n.n
);

GO
