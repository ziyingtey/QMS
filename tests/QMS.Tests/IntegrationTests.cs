using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using QMS.Api.Hubs;
using QMS.Api.Services;
using QMS.Application.Waiting;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Bds;
using QMS.Infrastructure.Persistence;

namespace QMS.Tests;

/// <summary>
/// Integration tests using SQLite in-memory DB.
/// </summary>
public class IntegrationTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly QmsDbContext _db;
    private readonly QmsQueueService _service;

    public IntegrationTests()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<QmsDbContext>()
            .UseSqlite(_connection)
            .Options;
        _db = new QmsDbContext(options);
        _db.Database.EnsureCreated();

        var hubContext = new StubHubContext();
        var notifications = new CustomerNotificationService(_db, hubContext);

        _service = new QmsQueueService(
            _db,
            hubContext,
            new NullBdsReportingBridge(),
            notifications,
            new FormulaWaitTimeEstimator(),
            new WaitTimeFeatureBuilder(_db),
            new CounterSimulationEstimator(_db),
            Options.Create(new ManagerAlertOptions()),
            new BranchClock(TimeProvider.System),
            NullLogger<QmsQueueService>.Instance);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    /// <summary>
    /// #2 fix: GetQueueStatusAsync with an unmatched bookingId returns null,
    /// even if a ticket with the same number exists in the branch.
    /// </summary>
    [Fact]
    public async Task GetQueueStatus_UnmatchedBookingId_ReturnsNull()
    {
        var branch = SeedBranch();
        var service = SeedService(branch);
        SeedCounter(branch, service);

        // Create a ticket with no booking
        _db.QueueEntries.Add(new QueueEntry
        {
            Id = Guid.NewGuid(),
            BranchId = branch.Id,
            ServiceTypeId = service.Id,
            TicketNumber = "A001",
            EntryType = QueueEntryType.WalkIn,
            State = QueueEntryState.Waiting,
            CheckedIn = true,
            ServiceDay = new DateOnly(2026, 10, 29),
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await _db.SaveChangesAsync();

        // Query with a random bookingId — should NOT return the ticket
        var result = await _service.GetQueueStatusAsync(
            branch.Id, "A001", default, bookingId: Guid.NewGuid());

        Assert.Null(result);
    }

    /// <summary>
    /// TicketAllocationRetry.IsUniqueConstraintViolation correctly detects SQLite unique violations.
    /// </summary>
    [Fact]
    public async Task TicketAllocationRetry_DetectsSqliteUniqueViolation()
    {
        var branch = SeedBranch();
        var service = SeedService(branch);

        var entry1 = new QueueEntry
        {
            Id = Guid.NewGuid(),
            BranchId = branch.Id,
            ServiceTypeId = service.Id,
            TicketNumber = "B001",
            EntryType = QueueEntryType.WalkIn,
            State = QueueEntryState.Waiting,
            CheckedIn = true,
            ServiceDay = new DateOnly(2026, 10, 29),
            CreatedAt = DateTimeOffset.UtcNow,
        };
        _db.QueueEntries.Add(entry1);
        await _db.SaveChangesAsync();

        // Try to insert a duplicate ticket number for same branch+day
        var entry2 = new QueueEntry
        {
            Id = Guid.NewGuid(),
            BranchId = branch.Id,
            ServiceTypeId = service.Id,
            TicketNumber = "B001", // same
            EntryType = QueueEntryType.WalkIn,
            State = QueueEntryState.Waiting,
            CheckedIn = true,
            ServiceDay = new DateOnly(2026, 10, 29),
            CreatedAt = DateTimeOffset.UtcNow.AddSeconds(1),
        };
        _db.QueueEntries.Add(entry2);

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => _db.SaveChangesAsync());
        Assert.True(TicketAllocationRetry.IsUniqueConstraintViolation(ex));
    }

    // ── Seed helpers ──

    private Branch SeedBranch()
    {
        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            BranchCode = 1,
            Name = "Test Branch",
            ServiceZoneOffsetMinutes = 480,
        };
        _db.Branches.Add(branch);
        _db.SaveChanges();
        return branch;
    }

    private ServiceType SeedService(Branch branch)
    {
        var service = new ServiceType
        {
            Id = Guid.NewGuid(),
            BranchId = branch.Id,
            Code = "TST",
            Name = "Test Service",
            DefaultAvgServiceMinutes = 10,
            OnlineSlotsPerSlot = 5,
        };
        _db.ServiceTypes.Add(service);
        _db.SaveChanges();
        return service;
    }

    private Counter SeedCounter(Branch branch, ServiceType service)
    {
        var counter = new Counter
        {
            Id = Guid.NewGuid(),
            BranchId = branch.Id,
            Number = 1,
            Mode = CounterMode.Active,
        };
        counter.AllowedServices.Add(new CounterAllowedService
        {
            CounterId = counter.Id,
            ServiceTypeId = service.Id,
        });
        _db.Counters.Add(counter);
        _db.SaveChanges();
        return counter;
    }
}

// ── Minimal stubs for IHubContext<QueueHub> (no Moq needed) ──

file sealed class StubHubContext : IHubContext<QueueHub>
{
    public IHubClients Clients { get; } = new StubHubClients();
    public IGroupManager Groups { get; } = new StubGroupManager();
}

file sealed class StubHubClients : IHubClients
{
    private static readonly IClientProxy NoOp = new StubClientProxy();
    public IClientProxy All => NoOp;
    public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => NoOp;
    public IClientProxy Client(string connectionId) => NoOp;
    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => NoOp;
    public IClientProxy Group(string groupName) => NoOp;
    public IClientProxy Groups(IReadOnlyList<string> groupNames) => NoOp;
    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => NoOp;
    public IClientProxy User(string userId) => NoOp;
    public IClientProxy Users(IReadOnlyList<string> userIds) => NoOp;
}

file sealed class StubClientProxy : IClientProxy
{
    public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}

file sealed class StubGroupManager : IGroupManager
{
    public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
    public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
