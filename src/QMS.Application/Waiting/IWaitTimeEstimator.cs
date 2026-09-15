namespace QMS.Application.Waiting;

public interface IWaitTimeEstimator
{
    /// <summary>
    /// Estimate waiting time in minutes from the given queue state.
    /// Returns (estimatedMinutes, source) where source indicates ML or Formula.
    /// </summary>
    (double Minutes, PredictionSource Source) Estimate(WaitTimeFeatures features);
}

public enum PredictionSource
{
    Ml = 0,
    FormulaFallback = 1,
}
