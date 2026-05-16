/*
  Manual INSERT into EF table [BRANCHES] (SQL Server).
  - [BranchCode] must be UNIQUE (see IX_BRANCHES_BranchCode in EF model).
  - [OpeningStatus]: 0 = Open, 1 = Closed (enum BranchOpeningStatus).
  - Weekly bookable hours live in [BRANCH_OPERATING_HOURS] (7 rows per branch); example below Mon–Fri 9–17, weekend closed.
  - [ServiceZoneOffsetMinutes]: e.g. 480 = UTC+8 for Malaysia.

  After you add branches, you usually need SERVICES + COUNTERS for that branch
  (see database/*.sql and schema alignment with EF) or the customer app may show empty services.
*/

USE QMS;
GO

-- Example: one extra branch (change BranchCode / Name / coords if you keep this).
DECLARE @Id UNIQUEIDENTIFIER = NEWID();

INSERT INTO [dbo].[BRANCHES] (
    [Id],
    [BranchCode],
    [Name],
    [Address],
    [State],
    [Latitude],
    [Longitude],
    [OnlineQuotaPercent],
    [SlotDurationMinutes],
    [GeofenceMeters],
    [ServiceZoneOffsetMinutes],
    [OpeningStatus],
    [OperatingHours],
    [ImageUrl],
    [MaxCapacity],
    [AdaptiveSlotCapacityEnabled],
    [MinSlotTotalCapacity]
)
VALUES (
    @Id,
    101099, -- TODO: pick a code not used by seed (101001–101004) or delete seed rows first
    N'My Custom Branch',
    N'1 Jalan Example, 50000 Kuala Lumpur',
    N'Kuala Lumpur',
    3.1390,
    101.6869,
    70,
    30,
    80,
    480,
    0,
    N'Mon–Fri 9:00–17:00',
    NULL,
    NULL,
    1,
    NULL
);

INSERT INTO dbo.BRANCH_OPERATING_HOURS (Id, BranchId, DayOfWeek, OpenTime, CloseTime, IsClosed)
VALUES
(NEWID(), @Id, N'Monday',    CAST('09:00' AS time), CAST('17:00' AS time), 0),
(NEWID(), @Id, N'Tuesday',   CAST('09:00' AS time), CAST('17:00' AS time), 0),
(NEWID(), @Id, N'Wednesday', CAST('09:00' AS time), CAST('17:00' AS time), 0),
(NEWID(), @Id, N'Thursday',  CAST('09:00' AS time), CAST('17:00' AS time), 0),
(NEWID(), @Id, N'Friday',    CAST('09:00' AS time), CAST('17:00' AS time), 0),
(NEWID(), @Id, N'Saturday',  NULL, NULL, 1),
(NEWID(), @Id, N'Sunday',    NULL, NULL, 1);

-- Optional: print new Id for follow-up inserts (SERVICES, etc.)
SELECT @Id AS NewBranchId;
GO
