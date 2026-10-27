using Microsoft.EntityFrameworkCore;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

/// <summary>
/// Startup safety net for existing databases (EnsureCreated never alters an existing table): adds the
/// ML_TRAINING_DATA v4 columns (IdleListeningCounters, CounterSimEtaMinutes) if missing, same statements as
/// database/migrations/005_ml_training_v4_features.sql. Without them every ML snapshot insert would fail.
/// </summary>
public static class MlTrainingSchemaEnsure
{
    public static async Task EnsureAsync(QmsDbContext db, ILogger logger, CancellationToken ct = default)
    {
        if (!db.Database.IsRelational()) return;
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                IF OBJECT_ID(N'dbo.ML_TRAINING_DATA', N'U') IS NOT NULL
                BEGIN
                    IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'IdleListeningCounters') IS NULL
                        ALTER TABLE dbo.ML_TRAINING_DATA ADD IdleListeningCounters INT NULL;
                    IF COL_LENGTH(N'dbo.ML_TRAINING_DATA', N'CounterSimEtaMinutes') IS NULL
                        ALTER TABLE dbo.ML_TRAINING_DATA ADD CounterSimEtaMinutes FLOAT NULL;
                END
                -- Branch drain window after closing (outside the ML table guard).
                IF OBJECT_ID(N'dbo.BRANCHES', N'U') IS NOT NULL
                   AND COL_LENGTH(N'dbo.BRANCHES', N'AfterHoursDrainWindowMinutes') IS NULL
                    ALTER TABLE dbo.BRANCHES ADD AfterHoursDrainWindowMinutes INT NOT NULL
                        CONSTRAINT DF_BRANCHES_AfterHoursDrainWindowMinutes DEFAULT (60);
                """, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ML_TRAINING_DATA v4 column ensure failed; run database/migrations/005_ml_training_v4_features.sql.");
        }
    }
}
