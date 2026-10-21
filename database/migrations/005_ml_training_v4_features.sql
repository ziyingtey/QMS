/*
  ML_TRAINING_DATA v4: store the two counter-state model features so SQL retraining has every feature of the
  v4 model (IdleListeningCounters, CounterSimEtaMinutes; BranchCode stays stored but is no longer a feature).
  New rows are written with FeatureSchemaVersion = 'v4' (WaitTimeFeatureBuilder.FeatureSchemaVersion) and
  ml/train_wait_model.py --connection-string reads only 'v4' rows.
  Only needed for an existing database; a fresh DB created by EnsureCreated (dotnet run) already has them.
  Run 004 first if it was skipped. Safe to re-run.
    sqlcmd -S localhost,1433 -d QMS -i database/migrations/005_ml_training_v4_features.sql

  Existing rows keep their FeatureSchemaVersion ('v2'/'v3') with both new columns NULL; they are not used
  for training (NULL here means "not logged", not "no counter serves the lane").

  Rollback:
    ALTER TABLE dbo.ML_TRAINING_DATA DROP COLUMN IF EXISTS IdleListeningCounters, CounterSimEtaMinutes;
*/
USE QMS;
GO

-- Listening counters (Active, serve this service) not holding a Called/Serving ticket at SnapshotAt.
IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'IdleListeningCounters') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD IdleListeningCounters INT NULL;

-- Deterministic Call Next drain ETA (CounterSimulationEstimator); NULL when no Active counter serves the lane.
IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'CounterSimEtaMinutes') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD CounterSimEtaMinutes FLOAT NULL;
GO
