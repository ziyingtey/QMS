/*
  Phase 1 Migration: Queue Timeline + Pull Forward History

  Adds:
    - QUEUE_TICKETS: 5 new columns for correct waiting-time semantics
    - QUEUE_MOVEMENTS: new table for slot movement audit trail

  Safe to re-run (IF NOT EXISTS / COL_LENGTH guards).

  Run against existing IH-QMS database:
    sqlcmd -S localhost,1433 -d QMS -i database/migrations/001_add_queue_timeline_and_movements.sql
*/

-- ══════════════════════════════════════════════════════════════
-- 1. QUEUE_TICKETS: add timeline columns
-- ══════════════════════════════════════════════════════════════

IF COL_LENGTH(N'dbo.QUEUE_TICKETS', N'InitialQueueEligibleAt') IS NULL
    ALTER TABLE dbo.QUEUE_TICKETS ADD InitialQueueEligibleAt DATETIMEOFFSET NULL;

IF COL_LENGTH(N'dbo.QUEUE_TICKETS', N'QueueEligibleAt') IS NULL
    ALTER TABLE dbo.QUEUE_TICKETS ADD QueueEligibleAt DATETIMEOFFSET NULL;

IF COL_LENGTH(N'dbo.QUEUE_TICKETS', N'OriginalSlotStart') IS NULL
    ALTER TABLE dbo.QUEUE_TICKETS ADD OriginalSlotStart DATETIMEOFFSET NULL;

IF COL_LENGTH(N'dbo.QUEUE_TICKETS', N'OriginalSlotEnd') IS NULL
    ALTER TABLE dbo.QUEUE_TICKETS ADD OriginalSlotEnd DATETIMEOFFSET NULL;

IF COL_LENGTH(N'dbo.QUEUE_TICKETS', N'PullForwardAt') IS NULL
    ALTER TABLE dbo.QUEUE_TICKETS ADD PullForwardAt DATETIMEOFFSET NULL;
GO

-- Backfill existing rows: set Initial/Current eligibility from best available data.
-- Online (EntryType=0): QueueEligibleAt = AssignedSlotStart
-- Walk-in (EntryType=1): QueueEligibleAt = CreatedAt
UPDATE dbo.QUEUE_TICKETS
SET InitialQueueEligibleAt = CASE WHEN EntryType = 0 THEN AssignedSlotStart ELSE CreatedAt END,
    QueueEligibleAt        = CASE WHEN EntryType = 0 THEN AssignedSlotStart ELSE CreatedAt END,
    OriginalSlotStart      = AssignedSlotStart,
    OriginalSlotEnd        = AssignedSlotEnd
WHERE InitialQueueEligibleAt IS NULL;
GO

-- ══════════════════════════════════════════════════════════════
-- 2. QUEUE_MOVEMENTS: slot movement audit trail
-- ══════════════════════════════════════════════════════════════

IF OBJECT_ID(N'dbo.QUEUE_MOVEMENTS', N'U') IS NULL
CREATE TABLE dbo.QUEUE_MOVEMENTS (
    Id                      UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_QUEUE_MOVEMENTS PRIMARY KEY,
    QueueEntryId            UNIQUEIDENTIFIER NOT NULL,
    FromSlotStart           DATETIMEOFFSET NULL,
    FromSlotEnd             DATETIMEOFFSET NULL,
    ToSlotStart             DATETIMEOFFSET NULL,
    ToSlotEnd               DATETIMEOFFSET NULL,
    PreviousEnqueueSequence BIGINT NOT NULL,
    NewEnqueueSequence      BIGINT NOT NULL,
    MovedAt                 DATETIMEOFFSET NOT NULL,
    Reason                  INT NOT NULL,
    /* Reason values:
       0 = PullForwardEarlyFinish
       1 = PullForwardNoShow
       2 = PullForwardCounterActivated
       3 = ManualReschedule
    */
    CONSTRAINT FK_QUEUE_MOVEMENTS_QUEUE_TICKETS_QueueEntryId
        FOREIGN KEY (QueueEntryId) REFERENCES dbo.QUEUE_TICKETS(Id) ON DELETE CASCADE
);
GO

-- Index for efficient movement history lookups (ML training, analytics)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_QUEUE_MOVEMENTS_QueueEntryId_MovedAt' AND object_id = OBJECT_ID(N'dbo.QUEUE_MOVEMENTS'))
    CREATE NONCLUSTERED INDEX IX_QUEUE_MOVEMENTS_QueueEntryId_MovedAt
        ON dbo.QUEUE_MOVEMENTS(QueueEntryId, MovedAt);
GO

PRINT 'Migration 001_add_queue_timeline_and_movements completed successfully.';
