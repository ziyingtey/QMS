/*
  Walk-in via branch QR (public web page): anonymous device id on tickets.
  Safe to re-run.
    sqlcmd -S localhost,1433 -d QMS -i database/migrations/20261012_walk_in_device_id.sql
  Rollback:
    DROP INDEX IF EXISTS IX_QUEUE_TICKETS_BranchId_WalkInDeviceId ON dbo.QUEUE_TICKETS;
    ALTER TABLE dbo.QUEUE_TICKETS DROP COLUMN IF EXISTS WalkInDeviceId;
*/
IF COL_LENGTH(N'dbo.QUEUE_TICKETS', N'WalkInDeviceId') IS NULL
    ALTER TABLE dbo.QUEUE_TICKETS ADD WalkInDeviceId NVARCHAR(64) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_QUEUE_TICKETS_BranchId_WalkInDeviceId' AND object_id = OBJECT_ID(N'dbo.QUEUE_TICKETS'))
    EXEC(N'CREATE NONCLUSTERED INDEX IX_QUEUE_TICKETS_BranchId_WalkInDeviceId ON dbo.QUEUE_TICKETS(BranchId, WalkInDeviceId) WHERE WalkInDeviceId IS NOT NULL');
