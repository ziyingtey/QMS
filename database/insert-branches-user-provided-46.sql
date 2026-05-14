/*
  46 branches — Name / Address / State / Lat / Lng / Operating hours from your list.
  Other columns use project defaults (same idea as insert-branches-user-values.sql).

  Run in SSMS against QMS. BranchCode = MAX(existing)+row; empty DB starts at 101001.
*/

USE QMS;
GO

DECLARE @Branches TABLE (
    RowOrd             INT IDENTITY(1, 1) PRIMARY KEY,
    [Name]             NVARCHAR(200) NOT NULL,
    [Address]          NVARCHAR(400) NOT NULL,
    [State]            NVARCHAR(80) NOT NULL,
    [Latitude]         FLOAT NOT NULL,
    [Longitude]        FLOAT NOT NULL,
    [OperatingHours]   NVARCHAR(200) NULL
);

INSERT INTO @Branches ([Name], [Address], [State], [Latitude], [Longitude], [OperatingHours])
VALUES
    (N'Bandar Sri Damansara', N'6, Jalan Tembaga SD5/2A, Bandar Sri Damansara, 52200 Kuala Lumpur', N'Kuala Lumpur', 3.2014635, 101.6093215, N'Mon-Fri 9:30-16:00'),
    (N'Taman Tun Dr Ismail', N'66, 68 & 70, Jalan Burhanuddin Helmi, Taman Tun Dr. Ismail, 60000 Kuala Lumpur', N'Kuala Lumpur', 3.1526579, 101.5866456, N'Mon-Fri 9:30-16:00'),
    (N'Bandar Menjalara', N'71 & 73, Jalan 3/62A, Bandar Menjalara, Off Jalan Kepong, 52200 Kuala Lumpur', N'Kuala Lumpur', 3.1786511, 101.5876933, N'Mon-Fri 9:30-16:00'),
    (N'Kepong', N'147, 149, 151 & 153, Jalan Rimbunan Raya 1, Laman Rimbunan, 52100 Kepong, Kuala Lumpur', N'Kuala Lumpur', 3.1845462, 101.6430009, N'Mon-Fri 9:30-16:00'),
    (N'Bukit Damansara', N'36-40, Medan Setia 2, Plaza Damansara, 50490 Bukit Damansara, Kuala Lumpur', N'Kuala Lumpur', 3.1602847, 101.6457096, N'Mon-Fri 9:30-16:00'),
    (N'Jinjang', N'Ground Floor & 1st Floor, Bangunan MCA Jinjang, Lot 58062, Jinjang Utara, Jalan Kepong, 52000 Kuala Lumpur', N'Kuala Lumpur', 3.1829735, 101.6483104, N'Mon-Fri 9:30-16:00'),
    (N'Mont Kiara', N'1 & 3, Jalan Solaris 1, Solaris Mont Kiara, 50480 Kuala Lumpur', N'Kuala Lumpur', 3.168726, 101.6493248, N'Mon-Fri 9:30-16:00'),
    (N'Bangsar', N'36 & 38, Jalan Maarof, Bangsar Baru, 59100 Kuala Lumpur', N'Kuala Lumpur', 3.1582808, 101.6506968, N'Mon-Fri 9:30-16:00'),
    (N'Selayang', N'45, 47 & 49, Jalan 2/3A, Pusat Bandar Utara Selayang, Batu Caves, 68100 Kuala Lumpur', N'Kuala Lumpur', 3.1975718, 101.6529882, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Kelang Lama', N'1, 3 & 5, Jalan 1/137B, Jalan Kelang Lama, 58000 Kuala Lumpur', N'Kuala Lumpur', 3.1218474, 101.6515654, N'Mon-Fri 9:30-16:00'),
    (N'Overseas Union Garden', N'3 & 5, Medan Hujan Rahmat, Taman Overseas Union, 58200 Kuala Lumpur', N'Kuala Lumpur', 3.1120101, 101.6515654, N'Mon-Fri 9:30-16:00'),
    (N'Bukit Jalil', N'2 & 2A, Jalan Jalil Jaya 6, Jalil Link, Bukit Jalil, 57000 Kuala Lumpur', N'Kuala Lumpur', 3.1054142, 101.6554943, N'Mon-Fri 9:30-16:00'),
    (N'Segambut', N'73, 75 & 77, Jalan Segambut Pusat, 51200 Kuala Lumpur', N'Kuala Lumpur', 3.1707524, 101.6573395, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Ipoh', N'480, Wisma Yap Ka, 3rd Mile Jalan Ipoh, 51200 Kuala Lumpur', N'Kuala Lumpur', 3.169651, 101.6578573, N'Mon-Fri 9:30-16:00'),
    (N'Taman Desa', N'Lot 1A-3A, Business Centre, Taman Desa, Off Jalan Kelang Lama, 58100 Kuala Lumpur', N'Kuala Lumpur', 3.1291867, 101.6583456, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Tun Sambanthan', N'68, Jalan Tun Sambanthan, Brickfields, 50470 Kuala Lumpur', N'Kuala Lumpur', 3.1528504, 101.6586858, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Kuchai Lama', N'44, 46, 48 & 50, Jalan 6/116B, Kuchai Entrepreneurs'' Park, Off Jalan Kuchai Lama, 58200 Kuala Lumpur', N'Kuala Lumpur', 3.1234643, 101.6651629, N'Mon-Fri 9:30-16:00'),
    (N'Sentul', N'36, 38 & 40, Jalan 14/48A, Sentul Raya, Off Jalan Sentul, 51000 Kuala Lumpur', N'Kuala Lumpur', 3.170968, 101.6832057, N'Mon-Fri 9:30-16:00'),
    (N'Seri Petaling', N'40-44, Jalan Radin Tengah, Bandar Baru Seri Petaling, 57000 Kuala Lumpur', N'Kuala Lumpur', 3.1113012, 101.6623289, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Raja Laut', N'Lot G3 & 1A.2, Bangunan KWSP, 5, Jalan Raja Laut, 50350 Kuala Lumpur', N'Kuala Lumpur', 3.1627772, 101.6847013, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Sultan Sulaiman', N'1st & 2nd Floor, Bangunan Public Bank, No. 6, Jalan Sultan Sulaiman, 50000 Kuala Lumpur', N'Kuala Lumpur', 3.1451481, 101.6871016, N'Mon-Fri 9:30-16:00'),
    (N'Tiong Nam', N'Wisma Public Bank, 300, Jalan Raja Laut, 50350 Kuala Lumpur', N'Kuala Lumpur', 3.1650846, 101.6847013, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Tun H.S. Lee', N'Lot G.01, Plaza First Nationwide, 161, Jalan Tun H.S. Lee, 50000 Kuala Lumpur', N'Kuala Lumpur', 3.1520998, 101.6882542, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Hang Lekiu', N'20-26, Jalan Hang Lekiu, 50100 Kuala Lumpur', N'Kuala Lumpur', 3.1532469, 101.6883939, N'Mon-Fri 9:30-16:00'),
    (N'Salak South', N'31-33, Ground Floor & 1st Floor, Jalan 3/108C, Taman Sungai Besi, Salak South, 57100 Kuala Lumpur', N'Kuala Lumpur', 3.1264522, 101.6700293, N'Mon-Fri 9:30-16:00'),
    (N'Kampung Baru (Islamic Branch)', N'1-1, 1-2 & 2-3, Plaza RAH, No. 111, Jalan Raja Abdullah, Kampung Baru, 50300 Kuala Lumpur', N'Kuala Lumpur', 3.1619281, 101.7019945, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Raja Chulan', N'Level 1 & 7, Menara Public Bank 2, 78, Jalan Raja Chulan, 50200 Kuala Lumpur', N'Kuala Lumpur', 3.1580349, 101.701999, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Bukit Bintang', N'Ground & 1st Floor, Menara Hai-O, Off Jalan Bukit Bintang, 55100 Kuala Lumpur', N'Kuala Lumpur', 3.1517429, 101.7036411, N'Mon-Fri 9:30-16:00'),
    (N'Kuala Lumpur City Main Office', N'Ground Floor, Menara Public Bank, 146, Jalan Ampang, 50450 Kuala Lumpur', N'Kuala Lumpur', 3.1600715, 101.7075537, N'Mon-Fri 9:30-16:00'),
    (N'Changkat Thambi Dollah', N'85, 87 & 89, Changkat Thambi Dollah, Off Jalan Pudu, 55100 Kuala Lumpur', N'Kuala Lumpur', 3.1484426, 101.7055163, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Sungai Besi', N'12, Jalan Sungai Besi, 57100 Kuala Lumpur', N'Kuala Lumpur', 3.1431091, 101.6957422, N'Mon-Fri 9:30-16:00'),
    (N'Medan Idaman', N'4, 6 & 8, Jalan Jernai 3, Medan Idaman Business Centre, Batu 5, Jalan Gombak, 53000 Kuala Lumpur', N'Kuala Lumpur', 3.1848076, 101.6898593, N'Mon-Fri 9:30-16:00'),
    (N'Bintang Walk', N'150, Jalan Bukit Bintang, 55100 Kuala Lumpur', N'Kuala Lumpur', 3.1536088, 101.7060801, N'Mon-Fri 9:30-16:00'),
    (N'Bandar Sri Permaisuri', N'95 & 97, Jalan Dwitasik 1, Bandar Sri Permaisuri, 56000 Cheras, Kuala Lumpur', N'Kuala Lumpur', 3.1297758, 101.6933726, N'Mon-Fri 9:30-16:00'),
    (N'Setapak', N'263, 265, 267 & 269, Jalan Genting Kelang, 53300 Setapak, Kuala Lumpur', N'Kuala Lumpur', 3.1778604, 101.691071, N'Mon-Fri 9:30-16:00'),
    (N'Jalan Pasar', N'44 & 46, Jalan Pasar, 55100 Kuala Lumpur', N'Kuala Lumpur', 3.1442199, 101.6957422, N'Mon-Fri 9:30-16:00'),
    (N'Starparc Point', N'B-01-01 - B-01-03A, Pusat Komersial Setapak, 68 Jalan Taman Ibu Kota, Setapak, 53300 Kuala Lumpur', N'Kuala Lumpur', 3.1801947, 101.6931543, N'Mon-Fri 9:30-16:00'),
    (N'Wangsa Maju', N'22-26, Jalan 1A/27A, Section 1, Wangsa Maju, 53300 Kuala Lumpur', N'Kuala Lumpur', 3.1790245, 101.7043259, N'Mon-Fri 9:30-16:00'),
    (N'Taman Maluri', N'271, 273, 275 & 277, Jalan Mahkota, Taman Maluri, 55100 Cheras, Kuala Lumpur', N'Kuala Lumpur', 3.1439049, 101.701603, N'Mon-Fri 9:30-16:00'),
    (N'Taman Midah', N'2, 4 & 6, Jalan Midah 3, Taman Midah, 56000 Kuala Lumpur', N'Kuala Lumpur', 3.1319755, 101.6716541, N'Mon-Fri 9:30-16:00'),
    (N'Taman Connaught', N'80-84, Jalan Cerdas, Taman Connaught, 56000 Cheras, Kuala Lumpur', N'Kuala Lumpur', 3.1190528, 101.6768952, N'Mon-Fri 9:30-16:00'),
    (N'Taman Cheras', N'1, 3, 5, 7 & 9, Jalan 4/96A, Taman Cheras Makmur, 56100 Kuala Lumpur', N'Kuala Lumpur', 3.1309714, 101.6751287, N'Mon-Fri 9:30-16:00'),
    (N'Pandan Jaya', N'44, Jalan Pandan 2/2, Pandan Jaya, 55100 Kuala Lumpur', N'Kuala Lumpur', 3.1474583, 101.6879474, N'Mon-Fri 9:30-16:00'),
    (N'Taman Melawati', N'262-265, Jalan Bandar 12, Taman Melawati, 53100 Kuala Lumpur', N'Kuala Lumpur', 3.1861555, 101.689962, N'Mon-Fri 9:30-16:00'),
    (N'Pandan Indah', N'1, 3 & 5, Jalan Pandan Indah 1/23, Pandan Indah, 55100 Kuala Lumpur', N'Kuala Lumpur', 3.1440088, 101.6893207, N'Mon-Fri 9:30-16:00'),
    (N'Tangkak', N'125, Jalan Muar, 84900 Tangkak, Johor', N'Johor', 2.7022101, 101.4574331, N'Mon-Fri 9:30-16:00');

DECLARE @Base INT = (SELECT ISNULL(MAX([BranchCode]), 101000) FROM [dbo].[BRANCHES]);

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
    NEWID(),
    @Base + b.[RowOrd],
    b.[Name],
    b.[Address],
    b.[State],
    b.[Latitude],
    b.[Longitude],
    70,
    30,
    80,
    540,
    1020,
    480,
    0,
    b.[OperatingHours],
    CAST(NULL AS NVARCHAR(800)),
    CAST(NULL AS INT),
    CAST(1 AS BIT),
    CAST(NULL AS INT)
FROM @Branches AS b
ORDER BY b.[RowOrd];

SELECT [BranchCode], [Name], [State], [Id]
FROM [dbo].[BRANCHES]
WHERE [BranchCode] > @Base
ORDER BY [BranchCode];
GO
