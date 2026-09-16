/*
  Migration 002: Multi-Service Counter Redesign
  - Replace OnlineQuotaPercent/AdaptiveSlot with per-service OnlineSlotsPerSlot
  - Add NextWeekBookingOpensOnDay to BRANCHES
  - Add IsTemporary/ExpiresAt to COUNTER_ALLOWED_SERVICES
  - Remove Pull Forward columns from QUEUE_TICKETS
  - Create BRANCH_CLOSURES table
  - Create WAIT_PREDICTIONS table
  - Update ML_TRAINING_DATA schema
*/

-- ═══════════════════════════════════════
-- 1. BRANCHES: add NextWeekBookingOpensOnDay, drop old capacity columns
-- ═══════════════════════════════════════

IF COL_LENGTH(N'dbo.BRANCHES', N'NextWeekBookingOpensOnDay') IS NULL
    ALTER TABLE dbo.BRANCHES ADD NextWeekBookingOpensOnDay INT NOT NULL CONSTRAINT DF_BRANCHES_NextWeekBookingOpensOnDay DEFAULT 6;

IF COL_LENGTH(N'dbo.BRANCHES', N'OnlineQuotaPercent') IS NOT NULL
    ALTER TABLE dbo.BRANCHES DROP COLUMN OnlineQuotaPercent;

IF COL_LENGTH(N'dbo.BRANCHES', N'AdaptiveSlotCapacityEnabled') IS NOT NULL
    ALTER TABLE dbo.BRANCHES DROP COLUMN AdaptiveSlotCapacityEnabled;

IF COL_LENGTH(N'dbo.BRANCHES', N'MinSlotTotalCapacity') IS NOT NULL
    ALTER TABLE dbo.BRANCHES DROP COLUMN MinSlotTotalCapacity;

-- ═══════════════════════════════════════
-- 2. SERVICES: add OnlineSlotsPerSlot
-- ═══════════════════════════════════════

IF COL_LENGTH(N'dbo.SERVICES', N'OnlineSlotsPerSlot') IS NULL
    ALTER TABLE dbo.SERVICES ADD OnlineSlotsPerSlot INT NOT NULL CONSTRAINT DF_SERVICES_OnlineSlotsPerSlot DEFAULT 4;

-- ═══════════════════════════════════════
-- 3. COUNTER_ALLOWED_SERVICES: add IsTemporary + ExpiresAt
-- ═══════════════════════════════════════

IF COL_LENGTH(N'dbo.COUNTER_ALLOWED_SERVICES', N'IsTemporary') IS NULL
    ALTER TABLE dbo.COUNTER_ALLOWED_SERVICES ADD IsTemporary BIT NOT NULL CONSTRAINT DF_COUNTER_ALLOWED_SERVICES_IsTemporary DEFAULT 0;

IF COL_LENGTH(N'dbo.COUNTER_ALLOWED_SERVICES', N'ExpiresAt') IS NULL
    ALTER TABLE dbo.COUNTER_ALLOWED_SERVICES ADD ExpiresAt DATETIMEOFFSET NULL;

-- ═══════════════════════════════════════
-- 4. QUEUE_TICKETS: remove Pull Forward columns, keep QueueEligibleAt
-- ═══════════════════════════════════════

IF COL_LENGTH(N'dbo.QUEUE_TICKETS', N'InitialQueueEligibleAt') IS NOT NULL
    ALTER TABLE dbo.QUEUE_TICKETS DROP COLUMN InitialQueueEligibleAt;

IF COL_LENGTH(N'dbo.QUEUE_TICKETS', N'OriginalSlotStart') IS NOT NULL
    ALTER TABLE dbo.QUEUE_TICKETS DROP COLUMN OriginalSlotStart;

IF COL_LENGTH(N'dbo.QUEUE_TICKETS', N'OriginalSlotEnd') IS NOT NULL
    ALTER TABLE dbo.QUEUE_TICKETS DROP COLUMN OriginalSlotEnd;

IF COL_LENGTH(N'dbo.QUEUE_TICKETS', N'PullForwardAt') IS NOT NULL
    ALTER TABLE dbo.QUEUE_TICKETS DROP COLUMN PullForwardAt;

-- ═══════════════════════════════════════
-- 5. BRANCH_CLOSURES: new table
-- ═══════════════════════════════════════

IF OBJECT_ID(N'dbo.BRANCH_CLOSURES', N'U') IS NULL
CREATE TABLE dbo.BRANCH_CLOSURES (
    Id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_BRANCH_CLOSURES PRIMARY KEY,
    BranchId UNIQUEIDENTIFIER NOT NULL,
    ClosedFrom DATETIMEOFFSET NOT NULL,
    ClosedTo DATETIMEOFFSET NOT NULL,
    Reason NVARCHAR(500) NULL,
    CreatedAt DATETIMEOFFSET NOT NULL CONSTRAINT DF_BRANCH_CLOSURES_CreatedAt DEFAULT (TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00')),
    CONSTRAINT FK_BRANCH_CLOSURES_BRANCHES_BranchId FOREIGN KEY (BranchId) REFERENCES dbo.BRANCHES(Id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BRANCH_CLOSURES_BranchId' AND object_id = OBJECT_ID(N'dbo.BRANCH_CLOSURES'))
    CREATE NONCLUSTERED INDEX IX_BRANCH_CLOSURES_BranchId ON dbo.BRANCH_CLOSURES(BranchId);

-- ═══════════════════════════════════════
-- 6. WAIT_PREDICTIONS: new table
-- ═══════════════════════════════════════

IF OBJECT_ID(N'dbo.WAIT_PREDICTIONS', N'U') IS NULL
CREATE TABLE dbo.WAIT_PREDICTIONS (
    Id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_WAIT_PREDICTIONS PRIMARY KEY,
    QueueEntryId UNIQUEIDENTIFIER NOT NULL,
    PredictedAt DATETIMEOFFSET NOT NULL,
    PredictedWaitMinutes FLOAT NOT NULL,
    PredictionSource INT NOT NULL,
    ModelVersion NVARCHAR(64) NULL,
    FeatureSchemaVersion NVARCHAR(16) NULL,
    ActualWaitingMinutes FLOAT NULL,
    PredictionError FLOAT NULL
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WAIT_PREDICTIONS_QueueEntryId' AND object_id = OBJECT_ID(N'dbo.WAIT_PREDICTIONS'))
    CREATE NONCLUSTERED INDEX IX_WAIT_PREDICTIONS_QueueEntryId ON dbo.WAIT_PREDICTIONS(QueueEntryId);

-- ═══════════════════════════════════════
-- 7. ML_TRAINING_DATA: add new columns (for existing databases)
-- ═══════════════════════════════════════

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'QueueEntryId') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD QueueEntryId UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ML_TEMP_QueueEntryId DEFAULT '00000000-0000-0000-0000-000000000000';

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'SnapshotAt') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD SnapshotAt DATETIMEOFFSET NOT NULL CONSTRAINT DF_ML_TEMP_SnapshotAt DEFAULT TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00');

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'QueueEligibleAt') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD QueueEligibleAt DATETIMEOFFSET NULL;

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'ServingStartedAt') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD ServingStartedAt DATETIMEOFFSET NULL;

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'ActualWaitingMinutes') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD ActualWaitingMinutes FLOAT NULL;

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'OnlineSlotsPerSlot') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD OnlineSlotsPerSlot INT NOT NULL CONSTRAINT DF_ML_TEMP_OnlineSlotsPerSlot DEFAULT 4;

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'FeatureSchemaVersion') IS NULL
    ALTER TABLE dbo.ML_TRAINING_DATA ADD FeatureSchemaVersion NVARCHAR(16) NOT NULL CONSTRAINT DF_ML_TEMP_FeatureSchemaVersion DEFAULT 'v3';

-- Remove old Pull Forward columns from ML_TRAINING_DATA if they exist
IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'WasPulledForward') IS NOT NULL
    ALTER TABLE dbo.ML_TRAINING_DATA DROP COLUMN WasPulledForward;

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'PullForwardCount') IS NOT NULL
    ALTER TABLE dbo.ML_TRAINING_DATA DROP COLUMN PullForwardCount;

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'OnlineQuotaPercent') IS NOT NULL
    ALTER TABLE dbo.ML_TRAINING_DATA DROP COLUMN OnlineQuotaPercent;

IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'InitialQueueEligibleAt') IS NOT NULL
    ALTER TABLE dbo.ML_TRAINING_DATA DROP COLUMN InitialQueueEligibleAt;

-- Indexes for new columns
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ML_TRAINING_DATA_QueueEntryId' AND object_id = OBJECT_ID(N'dbo.ML_TRAINING_DATA'))
    CREATE NONCLUSTERED INDEX IX_ML_TRAINING_DATA_QueueEntryId ON dbo.ML_TRAINING_DATA(QueueEntryId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ML_TRAINING_DATA_SnapshotAt' AND object_id = OBJECT_ID(N'dbo.ML_TRAINING_DATA'))
    CREATE NONCLUSTERED INDEX IX_ML_TRAINING_DATA_SnapshotAt ON dbo.ML_TRAINING_DATA(SnapshotAt);

PRINT 'Migration 002_multi_service_redesign completed.';
