-- Online early call pool + called-then-absent grace (per branch).
IF COL_LENGTH(N'dbo.BRANCHES', N'OnlineEarlyCallMinutes') IS NULL
    ALTER TABLE dbo.BRANCHES ADD OnlineEarlyCallMinutes INT NOT NULL CONSTRAINT DF_BRANCHES_OnlineEarlyCall DEFAULT (10);

IF COL_LENGTH(N'dbo.BRANCHES', N'CalledAbsentGraceMinutes') IS NULL
    ALTER TABLE dbo.BRANCHES ADD CalledAbsentGraceMinutes INT NOT NULL CONSTRAINT DF_BRANCHES_CalledAbsentGrace DEFAULT (5);
