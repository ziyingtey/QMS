using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using QMS.Infrastructure.Persistence;

namespace QMS.Infrastructure;

public sealed class QmsDbContextFactory : IDesignTimeDbContextFactory<QmsDbContext>
{
    public QmsDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("QMS_CONNECTION")
                 ?? "Server=(localdb)\\mssqllocaldb;Database=QMS;Trusted_Connection=True;TrustServerCertificate=True";

        var options = new DbContextOptionsBuilder<QmsDbContext>().UseSqlServer(cs).Options;
        return new QmsDbContext(options);
    }
}
