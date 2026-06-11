-- Customer email verification (SQL Server). Run once on existing databases.
-- New installs created by EF EnsureCreated pick up the model automatically.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.CUSTOMERS') AND name = N'EmailVerified'
)
BEGIN
    ALTER TABLE dbo.CUSTOMERS ADD EmailVerified bit NOT NULL
        CONSTRAINT DF_CUSTOMERS_EmailVerified DEFAULT (0);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.CUSTOMERS') AND name = N'EmailVerificationToken'
)
BEGIN
    ALTER TABLE dbo.CUSTOMERS ADD EmailVerificationToken nvarchar(128) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.CUSTOMERS') AND name = N'EmailVerificationTokenExpiresAt'
)
BEGIN
    ALTER TABLE dbo.CUSTOMERS ADD EmailVerificationTokenExpiresAt datetimeoffset NULL;
END;
GO

-- Existing accounts created before this feature: no pending token → mark verified so login still works.
UPDATE dbo.CUSTOMERS
SET EmailVerified = 1
WHERE EmailVerified = 0
  AND EmailVerificationToken IS NULL
  AND EmailVerificationTokenExpiresAt IS NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_CUSTOMERS_EmailVerificationToken' AND object_id = OBJECT_ID(N'dbo.CUSTOMERS')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX IX_CUSTOMERS_EmailVerificationToken
    ON dbo.CUSTOMERS (EmailVerificationToken)
    WHERE EmailVerificationToken IS NOT NULL;
END;
GO
