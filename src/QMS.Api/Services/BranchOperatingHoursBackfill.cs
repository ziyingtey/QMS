using Microsoft.EntityFrameworkCore;
using QMS.Domain.Entities;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

/// <summary>
/// Seeds Mon–Fri 09:30–16:00 / weekend closed when a branch has no weekly hours rows yet.
/// Matches common branch paste data (e.g. Bandar Sri Permaisuri).
/// </summary>
public static class BranchOperatingHoursBackfill
{
    private static readonly (string Day, bool Closed, int? OpenMin, int? CloseMin)[] Template =
    [
        ("Monday", false, 9 * 60 + 30, 16 * 60),
        ("Tuesday", false, 9 * 60 + 30, 16 * 60),
        ("Wednesday", false, 9 * 60 + 30, 16 * 60),
        ("Thursday", false, 9 * 60 + 30, 16 * 60),
        ("Friday", false, 9 * 60 + 30, 16 * 60),
        ("Saturday", true, null, null),
        ("Sunday", true, null, null),
    ];

    public static async Task EnsureDefaultsAsync(QmsDbContext db, CancellationToken ct = default)
    {
        var configured = await db.BranchOperatingHours.Select(h => h.BranchId).Distinct().ToListAsync(ct);
        var branches = await db.Branches
            .Where(b => !configured.Contains(b.Id))
            .Select(b => b.Id)
            .ToListAsync(ct);

        if (branches.Count == 0)
            return;

        foreach (var branchId in branches)
        {
            foreach (var row in Template)
            {
                db.BranchOperatingHours.Add(new BranchOperatingHour
                {
                    Id = Guid.NewGuid(),
                    BranchId = branchId,
                    DayOfWeek = row.Day,
                    IsClosed = row.Closed,
                    OpenTime = row.OpenMin is int om ? TimeSpan.FromMinutes(om) : null,
                    CloseTime = row.CloseMin is int cm ? TimeSpan.FromMinutes(cm) : null,
                });
            }
        }

        await db.SaveChangesAsync(ct);
    }
}
