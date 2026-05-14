/*
  Paste your branches below (Name, Address, State, Lat, Lng, OperatingHours only).
  Run in SSMS against database QMS.

  Auto-filled per row:
    - Id = NEWID()
    - BranchCode = MAX(existing BranchCode) + row number (empty DB → first new row 101001)
    - OnlineQuotaPercent=70, SlotDurationMinutes=30, GeofenceMeters=80
    - ServiceDay 09:00–17:00 (540–1020), ServiceZoneOffsetMinutes=480 (UTC+8)
    - OpeningStatus=0 (Open), AdaptiveSlotCapacityEnabled=1
    - ImageUrl, MaxCapacity, MinSlotTotalCapacity = NULL

  After insert, add SERVICES/COUNTERS via API or separate scripts if you need booking flows.
*/

USE QMS;
GO

DECLARE @Branches TABLE (
    RowOrd        INT IDENTITY(1, 1) PRIMARY KEY,
    [Name]        NVARCHAR(200) NOT NULL,
    [Address]     NVARCHAR(400) NOT NULL,
    [State]       NVARCHAR(80) NOT NULL,
    [Latitude]    FLOAT NOT NULL,
    [Longitude]   FLOAT NOT NULL,
    [OperatingHours] NVARCHAR(200) NULL
);

-- ========== EDIT ONLY THIS BLOCK (add one VALUES line per branch) ==========
INSERT INTO @Branches ([Name], [Address], [State], [Latitude], [Longitude], [OperatingHours])
VALUES
    (N'Example Branch One', N'123 Jalan Contoh, 50000 Kuala Lumpur', N'Kuala Lumpur', 3.1390, 101.6869, N'Mon–Fri 9:00–17:00; Sat 9:30–13:00'),
    (N'Example Branch Two', N'45 Lebuh Example, 10300 George Town', N'Pulau Pinang', 5.4141, 100.3288, N'Daily 10:00–16:00');
-- =============================================================================

DECLARE @Base INT =
    (SELECT ISNULL(MAX([BranchCode]), 101000) FROM [dbo].[BRANCHES]);

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
SELECT
    NEWID() AS [Id],
    @Base + b.[RowOrd] AS [BranchCode],
    b.[Name],
    b.[Address],
    b.[State],
    b.[Latitude],
    b.[Longitude],
    70 AS [OnlineQuotaPercent],
    30 AS [SlotDurationMinutes],
    80 AS [GeofenceMeters],
    540 AS [ServiceDayStartMinutes],
    1020 AS [ServiceDayEndMinutes],
    480 AS [ServiceZoneOffsetMinutes],
    0 AS [OpeningStatus],
    b.[OperatingHours],
    CAST(NULL AS NVARCHAR(800)) AS [ImageUrl],
    CAST(NULL AS INT) AS [MaxCapacity],
    CAST(1 AS BIT) AS [AdaptiveSlotCapacityEnabled],
    CAST(NULL AS INT) AS [MinSlotTotalCapacity]
FROM @Branches AS b
ORDER BY b.[RowOrd];

SELECT [BranchCode], [Name], [Id] FROM [dbo].[BRANCHES] WHERE [BranchCode] > @Base ORDER BY [BranchCode];
GO
