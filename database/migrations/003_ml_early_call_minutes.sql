/*
  Add EarlyCallMinutes (Branch.OnlineEarlyCallMinutes at snapshot time) to ML_TRAINING_DATA.
  Only needed for an existing database; a fresh DB created by EnsureCreated already has the column.
*/
USE QMS;
GO

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'EarlyCallMinutes') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD EarlyCallMinutes INT NOT NULL
        CONSTRAINT DF_ML_TEMP_EarlyCallMinutes DEFAULT 10;
GO
