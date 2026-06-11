-- OTP email verification columns (SQL Server). Run once on existing DBs.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CUSTOMERS') AND name = N'EmailOtpCode')
BEGIN
    ALTER TABLE dbo.CUSTOMERS ADD EmailOtpCode nvarchar(6) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CUSTOMERS') AND name = N'EmailOtpExpiresAt')
BEGIN
    ALTER TABLE dbo.CUSTOMERS ADD EmailOtpExpiresAt datetimeoffset NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CUSTOMERS') AND name = N'EmailOtpAttempts')
BEGIN
    ALTER TABLE dbo.CUSTOMERS ADD EmailOtpAttempts int NOT NULL CONSTRAINT DF_CUSTOMERS_EmailOtpAttempts DEFAULT (0);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CUSTOMERS') AND name = N'EmailOtpLastSentAt')
BEGIN
    ALTER TABLE dbo.CUSTOMERS ADD EmailOtpLastSentAt datetimeoffset NULL;
END;
GO
