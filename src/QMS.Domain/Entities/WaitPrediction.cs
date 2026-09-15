namespace QMS.Domain.Entities;

/// <summary>
/// Audit log for every production wait-time prediction.
/// Allows comparing ML vs Formula vs Actual after the fact.
/// </summary>
public class WaitPrediction
{
    public Guid Id { get; set; }
    public Guid QueueEntryId { get; set; }
    public DateTimeOffset PredictedAt { get; set; } = DateTimeOffset.UtcNow;
    public double PredictedWaitMinutes { get; set; }

    /// <summary>0 = ML, 1 = FormulaFallback</summary>
    public int PredictionSource { get; set; }

    public string? ModelVersion { get; set; }
    public string? FeatureSchemaVersion { get; set; }

    /// <summary>Filled when ServingStartedAt becomes known. NULL until then.</summary>
    public double? ActualWaitingMinutes { get; set; }
    /// <summary>ActualWaitingMinutes - PredictedWaitMinutes. NULL until actual is known.</summary>
    public double? PredictionError { get; set; }
}
