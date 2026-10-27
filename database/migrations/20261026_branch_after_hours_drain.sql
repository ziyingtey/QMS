-- Drain window after closing: open counters may keep calling already-waiting tickets.
IF COL_LENGTH(N'dbo.BRANCHES', N'AfterHoursDrainWindowMinutes') IS NULL
    ALTER TABLE dbo.BRANCHES ADD AfterHoursDrainWindowMinutes INT NOT NULL
        CONSTRAINT DF_BRANCHES_AfterHoursDrainWindowMinutes DEFAULT (60);
