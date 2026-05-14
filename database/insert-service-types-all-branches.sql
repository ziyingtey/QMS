/*
  Inserts the standard retail banking service types for EVERY branch in dbo.BRANCHES.

  - Table: dbo.SERVICES (EF entity: ServiceType). Code must be unique per BranchId.
  - Skips any (BranchId, Code) that already exists — safe to run more than once.
  - DefaultAvgServiceMinutes are rough planning defaults; change the VALUES block if needed.

  Run in SSMS (or sqlcmd) against your QMS database after branches exist.
*/

USE QMS;
GO

INSERT INTO dbo.SERVICES (Id, BranchId, Code, Name, DefaultAvgServiceMinutes, PriorityWeight)
SELECT NEWID(),
       b.Id,
       svc.Code,
       svc.Name,
       svc.DefaultAvgServiceMinutes,
       1
FROM dbo.BRANCHES AS b
CROSS JOIN (
    VALUES
        (N'ACC_OPEN', N'Account Opening', 20),
        (N'DEPOSIT', N'Deposit Services', 10),
        (N'WITHDRAW', N'Withdrawal Services', 8),
        (N'LOAN', N'Loan / Financing', 25),
        (N'CCARD', N'Credit Card Services', 15),
        (N'FDEP', N'Fixed Deposit', 15),
        (N'INVUT', N'Investment / Unit Trust', 20),
        (N'BANCA', N'Insurance / Bancassurance', 25),
        (N'ATMCDM', N'ATM / CDM Services', 5),
        (N'ONLBANK', N'Online Banking Support', 12),
        (N'BIZBANK', N'Business Banking', 20),
        (N'REMIT', N'Remittance / Transfer', 15),
        (N'CUSTSVC', N'Queue / Customer Service', 10)
) AS svc (Code, Name, DefaultAvgServiceMinutes)
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.SERVICES AS s
    WHERE s.BranchId = b.Id AND s.Code = svc.Code
);

PRINT CONCAT(N'Inserted rows: ', @@ROWCOUNT);
GO
