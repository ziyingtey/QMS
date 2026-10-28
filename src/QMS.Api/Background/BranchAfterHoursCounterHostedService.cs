using Microsoft.AspNetCore.SignalR;
using QMS.Api.Hubs;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Background;

/// <summary>
/// Every 60 s, delegates to <see cref="BranchAfterHoursCounterSweep.RunAsync"/> which honours
/// the drain window and active tickets before closing counters.
/// </summary>
public sealed class BranchAfterHoursCounterHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<BranchAfterHoursCounterHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(8), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<QmsDbContext>();
                var hub = scope.ServiceProvider.GetRequiredService<IHubContext<QueueHub>>();
                await BranchAfterHoursCounterSweep.RunAsync(db, hub, logger, stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "After-hours counter sweep failed");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }
}
