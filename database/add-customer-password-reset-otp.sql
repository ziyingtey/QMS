-- Forgot-password OTP columns (separate from email verification OTP). Run once on existing DBs.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CUSTOMERS') AND name = N'PasswordResetOtpCode')
BEGIN
    ALTER TABLE dbo.CUSTOMERS ADD PasswordResetOtpCode nvarchar(6) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CUSTOMERS') AND name = N'PasswordResetOtpExpiresAt')
BEGIN
    ALTER TABLE dbo.CUSTOMERS ADD PasswordResetOtpExpiresAt datetimeoffset NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CUSTOMERS') AND name = N'PasswordResetOtpAttempts')
BEGIN
    ALTER TABLE dbo.CUSTOMERS ADD PasswordResetOtpAttempts int NOT NULL CONSTRAINT DF_CUSTOMERS_PwdResetOtpAttempts DEFAULT (0);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CUSTOMERS') AND name = N'PasswordResetOtpLastSentAt')
BEGIN
    ALTER TABLE dbo.CUSTOMERS ADD PasswordResetOtpLastSentAt datetimeoffset NULL;
END;
GO
