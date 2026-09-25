using System.Text;
using Microsoft.EntityFrameworkCore;
using QMS.Domain.Entities;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

/// <summary>
/// Ensures each ServiceType has a BranchQueue (档 B). Safe to run on every startup.
/// Also applies SQL DDL when using SQL Server so existing databases pick up SERVICE_QUEUES.
/// </summary>
public static class ServiceQueueProvisioning
{
    public static async Task EnsureAsync(QmsDbContext db, ILogger logger, CancellationToken ct = default)
    {
        if (db.Database.IsRelational())
            await EnsureSqlServerSchemaAsync(db, logger, ct);

        var services = await db.ServiceTypes
            .Include(s => s.Queue)
            .ToListAsync(ct);
        if (services.Count == 0) return;

        var existingQueues = await db.BranchQueues.ToListAsync(ct);
        var usedPrefixes = existingQueues
            .GroupBy(q => q.BranchId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.TicketPrefix.ToUpperInvariant()).ToHashSet());

        var created = 0;
        foreach (var svc in services)
        {
            if (svc.QueueId is Guid qid && existingQueues.Any(q => q.Id == qid))
                continue;

            if (!usedPrefixes.TryGetValue(svc.BranchId, out var prefixes))
            {
                prefixes = new HashSet<string>();
                usedPrefixes[svc.BranchId] = prefixes;
            }

            var prefix = ChoosePrefix(svc.Code, svc.Name, prefixes);
            prefixes.Add(prefix.ToUpperInvariant());

            var queue = new BranchQueue
            {
                Id = Guid.NewGuid(),
                BranchId = svc.BranchId,
                Name = string.IsNullOrWhiteSpace(svc.Name) ? svc.Code : svc.Name,
                TicketPrefix = prefix,
                ServiceLevelMinutes = 15,
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow,
            };
            db.BranchQueues.Add(queue);
            svc.QueueId = queue.Id;
            existingQueues.Add(queue);
            created++;
        }

        // Backfill tickets missing QueueId
        var tickets = await db.QueueEntries
            .Where(q => q.QueueId == null)
            .ToListAsync(ct);
        if (tickets.Count > 0)
        {
            var svcMap = services.ToDictionary(s => s.Id);
            foreach (var ticket in tickets)
            {
                if (svcMap.TryGetValue(ticket.ServiceTypeId, out var s) && s.QueueId is Guid qid)
                    ticket.QueueId = qid;
            }
        }

        if (created > 0 || tickets.Count > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation(
                "Service queues provisioned: {Created} new queue(s), {Tickets} ticket(s) backfilled.",
                created, tickets.Count);
        }
    }

    private static string ChoosePrefix(string code, string name, HashSet<string> used)
    {
        static string Norm(string s)
        {
            var sb = new StringBuilder();
            foreach (var ch in s.Trim().ToUpperInvariant())
            {
                if (ch is >= 'A' and <= 'Z') sb.Append(ch);
                if (sb.Length >= 3) break;
            }
            return sb.ToString();
        }

        foreach (var candidate in new[] { Norm(code), Norm(name), "Q" })
        {
            if (string.IsNullOrEmpty(candidate)) continue;
            var p = candidate[..1];
            if (!used.Contains(p)) return p;
            if (candidate.Length >= 2)
            {
                var p2 = candidate[..2];
                if (!used.Contains(p2)) return p2;
            }
        }

        for (var c = 'A'; c <= 'Z'; c++)
        {
            var p = c.ToString();
            if (!used.Contains(p)) return p;
        }

        return Guid.NewGuid().ToString("N")[..3].ToUpperInvariant();
    }

    private static async Task EnsureSqlServerSchemaAsync(QmsDbContext db, ILogger logger, CancellationToken ct)
    {
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                IF OBJECT_ID(N'dbo.SERVICE_QUEUES', N'U') IS NULL
                CREATE TABLE dbo.SERVICE_QUEUES (
                    Id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_SERVICE_QUEUES PRIMARY KEY,
                    BranchId UNIQUEIDENTIFIER NOT NULL,
                    Name NVARCHAR(200) NOT NULL,
                    TicketPrefix NVARCHAR(8) NOT NULL,
                    ServiceLevelMinutes INT NOT NULL CONSTRAINT DF_SERVICE_QUEUES_SLA DEFAULT 15,
                    IsActive BIT NOT NULL CONSTRAINT DF_SERVICE_QUEUES_Active DEFAULT 1,
                    CreatedAt DATETIMEOFFSET NOT NULL CONSTRAINT DF_SERVICE_QUEUES_CreatedAt DEFAULT (TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00')),
                    CONSTRAINT FK_SERVICE_QUEUES_BRANCHES FOREIGN KEY (BranchId) REFERENCES dbo.BRANCHES(Id) ON DELETE CASCADE
                );

                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SERVICE_QUEUES_BranchId_TicketPrefix' AND object_id = OBJECT_ID(N'dbo.SERVICE_QUEUES'))
                    CREATE UNIQUE NONCLUSTERED INDEX IX_SERVICE_QUEUES_BranchId_TicketPrefix ON dbo.SERVICE_QUEUES(BranchId, TicketPrefix);

                IF COL_LENGTH(N'dbo.SERVICES', N'QueueId') IS NULL
                    ALTER TABLE dbo.SERVICES ADD QueueId UNIQUEIDENTIFIER NULL;

                IF COL_LENGTH(N'dbo.QUEUE_TICKETS', N'QueueId') IS NULL
                    ALTER TABLE dbo.QUEUE_TICKETS ADD QueueId UNIQUEIDENTIFIER NULL;

                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_QUEUE_TICKETS_BranchId_TicketNumber' AND object_id = OBJECT_ID(N'dbo.QUEUE_TICKETS'))
                    DROP INDEX IX_QUEUE_TICKETS_BranchId_TicketNumber ON dbo.QUEUE_TICKETS;
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_QUEUE_TICKETS_BranchId_TicketNumber_Open' AND object_id = OBJECT_ID(N'dbo.QUEUE_TICKETS'))
                    CREATE UNIQUE NONCLUSTERED INDEX IX_QUEUE_TICKETS_BranchId_TicketNumber_Open
                    ON dbo.QUEUE_TICKETS(BranchId, TicketNumber) WHERE [State] IN (0, 1, 2);
                """, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SERVICE_QUEUES schema ensure skipped or failed (InMemory / permissions).");
        }
    }
}
