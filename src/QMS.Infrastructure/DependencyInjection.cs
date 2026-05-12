using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using QMS.Infrastructure.Bds;
using QMS.Infrastructure.Dispatch;
using QMS.Infrastructure.Persistence;

namespace QMS.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default");
        services.AddDbContext<QmsDbContext>(options =>
        {
            if (string.IsNullOrWhiteSpace(connectionString))
                options.UseInMemoryDatabase("QMS_Dev");
            else
                options.UseSqlServer(connectionString);
        });

        services.AddSingleton<IDispatchRoundStateStore, MemoryDispatchRoundStateStore>();

        services.AddScoped<IBdsReportingBridge>(sp =>
        {
            var cfg = sp.GetRequiredService<IConfiguration>();
            if (!string.Equals(cfg["Bds:Enabled"], "true", StringComparison.OrdinalIgnoreCase))
                return new NullBdsReportingBridge();

            var db = sp.GetRequiredService<QmsDbContext>();
            if (!db.Database.IsRelational()
                || !string.Equals(db.Database.ProviderName, "Microsoft.EntityFrameworkCore.SqlServer", StringComparison.Ordinal))
            {
                return new NullBdsReportingBridge();
            }

            return new SqlServerBdsReportingBridge(
                db,
                sp.GetRequiredService<ILogger<SqlServerBdsReportingBridge>>());
        });

        return services;
    }
}
