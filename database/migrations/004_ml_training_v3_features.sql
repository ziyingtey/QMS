/*
  ML_TRAINING_DATA v3: columns needed so the SQL training export has all 26 model features and the
  CalledAt-based target, aligned with ml/generate_seed_data.py and ml/QMS_WaitTime_ML_Pipeline.ipynb.
  Only needed for an existing database; a fresh DB created by EnsureCreated (dotnet run) already has them.
  Safe to re-run.
    sqlcmd -S localhost,1433 -d QMS -i database/migrations/004_ml_training_v3_features.sql

  Existing rows keep FeatureSchemaVersion = 'v2' (old DayOfWeek Sun=0, online snapshot at SlotStart,
  CrossLane == QueueLength, target ending at ServingStartedAt). The training export filters on 'v3'.

  Superseded for training by v4 (005_ml_training_v4_features.sql): the model now has 27 features
  (BranchCode dropped, IdleListeningCounters / CounterSimEtaMinutes added) and the export filters on 'v4'.
  Run 004 and then 005 on an existing database.

  Rollback:
    ALTER TABLE dbo.ML_TRAINING_DATA DROP CONSTRAINT IF EXISTS DF_ML_TEMP_CrossLaneQueueLength, DF_ML_TEMP_TicketPrefix,
        DF_ML_TEMP_SlotActive, DF_ML_TEMP_CallNextPriority;
    ALTER TABLE dbo.ML_TRAINING_DATA DROP COLUMN IF EXISTS CalledAt, CrossLaneQueueLength, TicketPrefix, SlotActive, CallNextPriority;
*/
USE QMS;
GO

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'EarlyCallMinutes') IS NULL   -- from 003, in case it was skipped
    ALTER TABLE dbo.ML_TRAINING_DATA ADD EarlyCallMinutes INT NOT NULL
        CONSTRAINT DF_ML_TEMP_EarlyCallMinutes DEFAULT 10;

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'CalledAt') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD CalledAt DATETIMEOFFSET NULL;

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'CrossLaneQueueLength') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD CrossLaneQueueLength INT NOT NULL
        CONSTRAINT DF_ML_TEMP_CrossLaneQueueLength DEFAULT 0;

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'TicketPrefix') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD TicketPrefix NVARCHAR(8) NOT NULL
        CONSTRAINT DF_ML_TEMP_TicketPrefix DEFAULT N'';

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'SlotActive') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD SlotActive INT NOT NULL
        CONSTRAINT DF_ML_TEMP_SlotActive DEFAULT 0;

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'CallNextPriority') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD CallNextPriority INT NOT NULL
        CONSTRAINT DF_ML_TEMP_CallNextPriority DEFAULT 1;
GO
