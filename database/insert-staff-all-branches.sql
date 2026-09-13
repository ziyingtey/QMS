/*
  One manager + several tellers for EVERY row in dbo.BRANCHES (home / demo seed).

  Prerequisites:
    • database/schema.sql applied
    • dbo.BRANCHES populated (e.g. insert-branches-from-paste.sql)

  Default password for all accounts: Passw0rd!
  (ASP.NET Core PasswordHasher — same as insert-staff-sample.sql)

  Email pattern (unique per branch via BranchCode):
    • Manager: mgr.{BranchCode}@local.test          e.g. mgr.101033@local.test
    • Tellers:  teller1.{BranchCode}@local.test     e.g. teller1.101033@local.test
                teller2.{BranchCode}@local.test
                teller3.{BranchCode}@local.test

  Role INT:   0 = Staff, 1 = Manager
  Status INT: 0 = Active

  Idempotent: skips rows when the email already exists.
  Adjust @TellersPerBranch below (default 3).
*/

USE QMS;
GO

DECLARE @TellersPerBranch INT = 3; /* tellers per branch (not counting the manager) */

IF @TellersPerBranch < 1 OR @TellersPerBranch > 20
BEGIN
    RAISERROR(N'@TellersPerBranch must be between 1 and 20.', 16, 1);
    RETURN;
END;

/* PasswordHasher hashes for Passw0rd! */
DECLARE @HashManager NVARCHAR(500) = N'AQAAAAIAAYagAAAAEMXWzvGHs0wH/93ofCRHoB32NQjq7uUV6+nZa99A90IV4bM30Gso/XHmfnyq1jvmcQ==';
DECLARE @HashStaff   NVARCHAR(500) = N'AQAAAAIAAYagAAAAEIHk9etAM/Cqktr/AJgeq7+xjc9FGd1AiA6LPe3X1y7qTYpEMuxwQdJ3wpqoMq+X9w==';

IF NOT EXISTS (SELECT 1 FROM dbo.BRANCHES)
BEGIN
    RAISERROR(N'No branches in dbo.BRANCHES. Run branch insert scripts first.', 16, 1);
    RETURN;
END;

/* ── Managers (one per branch) ── */
INSERT INTO dbo.STAFF (Id, Email, PasswordHash, BranchId, [Name], Role, Status)
SELECT
    NEWID(),
    CONCAT(N'mgr.', b.BranchCode, N'@local.test'),
    @HashManager,
    b.Id,
    CONCAT(b.[Name], N' Manager'),
    1,
    0
FROM dbo.BRANCHES AS b
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.STAFF AS s
    WHERE s.Email = CONCAT(N'mgr.', b.BranchCode, N'@local.test')
);

/* ── Tellers (N per branch) ── */
;WITH TellerNums AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1 FROM TellerNums WHERE n < @TellersPerBranch
)
INSERT INTO dbo.STAFF (Id, Email, PasswordHash, BranchId, [Name], Role, Status)
SELECT
    NEWID(),
    CONCAT(N'teller', tn.n, N'.', b.BranchCode, N'@local.test'),
    @HashStaff,
    b.Id,
    CONCAT(b.[Name], N' Teller ', tn.n),
    0,
    0
FROM dbo.BRANCHES AS b
CROSS JOIN TellerNums AS tn
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.STAFF AS s
    WHERE s.Email = CONCAT(N'teller', tn.n, N'.', b.BranchCode, N'@local.test')
)
OPTION (MAXRECURSION 20);

/* ── Summary ── */
SELECT
    b.BranchCode,
    b.[Name] AS BranchName,
    SUM(CASE WHEN s.Role = 1 THEN 1 ELSE 0 END) AS Managers,
    SUM(CASE WHEN s.Role = 0 THEN 1 ELSE 0 END) AS Tellers
FROM dbo.BRANCHES AS b
LEFT JOIN dbo.STAFF AS s ON s.BranchId = b.Id
GROUP BY b.BranchCode, b.[Name]
ORDER BY b.BranchCode;

PRINT N'Done. Login example: mgr.{BranchCode}@local.test / Passw0rd!  (find BranchCode in summary above).';
GO
