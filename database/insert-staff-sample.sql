/*
  Sample STAFF rows for QMS (staff-web login).

  Prerequisites: database/schema.sql applied; dbo.BRANCHES has at least one row.
  Passwords are ASP.NET Core PasswordHasher<string> (same as AuthController register).
  Default logins (after running this script as-is):
    • staff.manager@local.test  / Passw0rd!  (Role = Manager)
    • staff.teller@local.test   / Passw0rd!  (Role = Staff)

  Role INT:   0 = Staff,   1 = Manager   (see QMS.Domain.Enums.StaffRoleKind)
  Status INT: 0 = Active, 1 = Break, 2 = Offline (see StaffPresenceStatus)

  To attach staff to a specific branch, set @BranchName to an exact BRANCHES.Name match,
  or replace the SELECT with your own BranchId GUID.

  To generate a new hash (email + password must match login):
    dotnet new console -f net8.0 -o /tmp/hashgen && cd /tmp/hashgen
    dotnet add package Microsoft.Extensions.Identity.Core -v 8.0.11
    // Program.cs: new PasswordHasher<string>().HashPassword("you@mail", "YourPass!");
*/

USE QMS;
GO

DECLARE @BranchId UNIQUEIDENTIFIER;
DECLARE @BranchName NVARCHAR(200) = NULL; /* e.g. N'Bandar Sri Damansara' — NULL = first branch by BranchCode */

SELECT @BranchId = b.Id
FROM dbo.BRANCHES AS b
WHERE (@BranchName IS NULL OR b.[Name] = @BranchName)
ORDER BY b.BranchCode ASC;

IF @BranchId IS NULL
BEGIN
    RAISERROR(N'No branch found. Insert BRANCHES first or set @BranchName to an existing Name.', 16, 1);
    RETURN;
END;

/* PasswordHasher hashes for Passw0rd! (each email has its own salt) */
DECLARE @HashManager NVARCHAR(500) = N'AQAAAAIAAYagAAAAEMXWzvGHs0wH/93ofCRHoB32NQjq7uUV6+nZa99A90IV4bM30Gso/XHmfnyq1jvmcQ==';
DECLARE @HashStaff   NVARCHAR(500) = N'AQAAAAIAAYagAAAAEIHk9etAM/Cqktr/AJgeq7+xjc9FGd1AiA6LPe3X1y7qTYpEMuxwQdJ3wpqoMq+X9w==';

IF NOT EXISTS (SELECT 1 FROM dbo.STAFF WHERE Email = N'staff.manager@local.test')
    INSERT INTO dbo.STAFF (Id, Email, PasswordHash, BranchId, [Name], Role, Status)
    VALUES (NEWID(), N'staff.manager@local.test', @HashManager, @BranchId, N'Demo Branch Manager', 1, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.STAFF WHERE Email = N'staff.teller@local.test')
    INSERT INTO dbo.STAFF (Id, Email, PasswordHash, BranchId, [Name], Role, Status)
    VALUES (NEWID(), N'staff.teller@local.test', @HashStaff, @BranchId, N'Demo Teller', 0, 0);

GO
