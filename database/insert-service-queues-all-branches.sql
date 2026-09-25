/*
  Creates one SERVICE_QUEUES row per service (fixed ticket prefix) and sets SERVICES.QueueId.

  Run AFTER: insert-service-types-all-branches.sql
  Run BEFORE / INSTEAD OF relying on API restart for ServiceQueueProvisioning.

  - Idempotent: skips services that already have QueueId.
  - Prefixes are fixed per Code (same for every branch) — not chosen at startup.
  - Safe to re-run.

  Prefix map (1 service = 1 queue):
    ACC_OPEN  -> A   Account Opening
    DEPOSIT   -> D   Deposit Services
    WITHDRAW  -> W   Withdrawal Services
    LOAN      -> L   Loan / Financing
    CCARD     -> C   Credit Card Services
    FDEP      -> F   Fixed Deposit
    INVUT     -> I   Investment / Unit Trust
    BANCA     -> B   Insurance / Bancassurance
    ATMCDM    -> T   ATM / CDM Services
    ONLBANK   -> O   Online Banking Support
    BIZBANK   -> S   Business Banking
    REMIT     -> R   Remittance / Transfer
    CUSTSVC   -> Q   Queue / Customer Service
*/

USE QMS;
GO

;WITH PrefixMap AS (
    SELECT *
    FROM (VALUES
        (N'ACC_OPEN',  N'A', 15),
        (N'DEPOSIT',   N'D', 15),
        (N'WITHDRAW',  N'W', 15),
        (N'LOAN',      N'L', 15),
        (N'CCARD',     N'C', 15),
        (N'FDEP',      N'F', 15),
        (N'INVUT',     N'I', 15),
        (N'BANCA',     N'B', 15),
        (N'ATMCDM',    N'T', 15),
        (N'ONLBANK',   N'O', 15),
        (N'BIZBANK',   N'S', 15),
        (N'REMIT',     N'R', 15),
        (N'CUSTSVC',   N'Q', 15)
    ) AS m (Code, TicketPrefix, ServiceLevelMinutes)
)
INSERT INTO dbo.SERVICE_QUEUES
    (Id, BranchId, Name, TicketPrefix, ServiceLevelMinutes, IsActive, CreatedAt)
SELECT
    NEWID(),
    s.BranchId,
    s.Name,
    m.TicketPrefix,
    m.ServiceLevelMinutes,
    1,
    TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00')
FROM dbo.SERVICES AS s
INNER JOIN PrefixMap AS m ON m.Code = s.Code
WHERE s.QueueId IS NULL
  AND NOT EXISTS (
        SELECT 1
        FROM dbo.SERVICE_QUEUES AS q
        WHERE q.BranchId = s.BranchId
          AND UPPER(q.TicketPrefix) = UPPER(m.TicketPrefix)
      );

PRINT CONCAT(N'Inserted SERVICE_QUEUES rows: ', @@ROWCOUNT);
GO

;WITH PrefixMap AS (
    SELECT *
    FROM (VALUES
        (N'ACC_OPEN',  N'A'),
        (N'DEPOSIT',   N'D'),
        (N'WITHDRAW',  N'W'),
        (N'LOAN',      N'L'),
        (N'CCARD',     N'C'),
        (N'FDEP',      N'F'),
        (N'INVUT',     N'I'),
        (N'BANCA',     N'B'),
        (N'ATMCDM',    N'T'),
        (N'ONLBANK',   N'O'),
        (N'BIZBANK',   N'S'),
        (N'REMIT',     N'R'),
        (N'CUSTSVC',   N'Q')
    ) AS m (Code, TicketPrefix)
)
UPDATE s
SET s.QueueId = q.Id
FROM dbo.SERVICES AS s
INNER JOIN PrefixMap AS m ON m.Code = s.Code
INNER JOIN dbo.SERVICE_QUEUES AS q
    ON q.BranchId = s.BranchId
   AND UPPER(q.TicketPrefix) = UPPER(m.TicketPrefix)
WHERE s.QueueId IS NULL;

PRINT CONCAT(N'Linked SERVICES.QueueId rows: ', @@ROWCOUNT);
GO
