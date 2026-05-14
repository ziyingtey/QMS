/*
  Manual INSERT into EF table [BRANCHES] (SQL Server).
  - [BranchCode] must be UNIQUE (see IX_BRANCHES_BranchCode in EF model).
  - [OpeningStatus]: 0 = Open, 1 = Closed (enum BranchOpeningStatus).
  - Times: ServiceDayStartMinutes / ServiceDayEndMinutes = minutes from midnight (e.g. 540 = 09:00, 1020 = 17:00).
  - [ServiceZoneOffsetMinutes]: e.g. 480 = UTC+8 for Malaysia.

  After you add branches, you usually need SERVICES + COUNTERS for that branch
  (see QmsDataSeeder.cs) or the customer app may show empty services.
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
    [ServiceDayStartMinutes],
    [ServiceDayEndMinutes],
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
    540,
    1020,
    480,
    0,
    N'Mon–Fri 9:00–17:00',
    NULL,
    NULL,
    1,
    NULL
);

-- Optional: print new Id for follow-up inserts (SERVICES, etc.)
SELECT @Id AS NewBranchId;
GO
