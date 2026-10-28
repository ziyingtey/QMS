using QMS.Application.Waiting;

namespace QMS.Tests;

public class WaitTimeEstimatorTests
{
    // ── FormulaWaitTimeEstimator ──

    private readonly FormulaWaitTimeEstimator _formula = new();

    [Fact]
    public void Formula_ZeroPeopleAhead_ReturnsZero()
    {
        var features = new WaitTimeFeatures
        {
            PeopleAhead = 0,
            NowServing = 0,
            ServiceEligibleActiveCounters = 2,
            DefaultAvgServiceMinutes = 10,
        };

        var (minutes, source) = _formula.Estimate(features);

        Assert.Equal(0, minutes);
        Assert.Equal(PredictionSource.FormulaFallback, source);
    }

    [Fact]
    public void Formula_OneCounter_BasicCalculation()
    {
        var features = new WaitTimeFeatures
        {
            PeopleAhead = 3,
            NowServing = 1,
            ServiceEligibleActiveCounters = 1,
            DefaultAvgServiceMinutes = 10,
        };

        var (minutes, _) = _formula.Estimate(features);

        // (3 + 1) * 10 / 1 = 40
        Assert.Equal(40, minutes);
    }

    [Fact]
    public void Formula_ManyCounters_DividesEvenly()
    {
        var features = new WaitTimeFeatures
        {
            PeopleAhead = 6,
            NowServing = 2,
            ServiceEligibleActiveCounters = 4,
            DefaultAvgServiceMinutes = 10,
        };

        var (minutes, _) = _formula.Estimate(features);

        // (6 + 2) * 10 / 4 = 20
        Assert.Equal(20, minutes);
    }

    [Fact]
    public void Formula_ZeroCounters_TreatedAsOne()
    {
        var features = new WaitTimeFeatures
        {
            PeopleAhead = 3,
            NowServing = 0,
            ServiceEligibleActiveCounters = 0,
            DefaultAvgServiceMinutes = 10,
        };

        var (minutes, _) = _formula.Estimate(features);

        // Math.Max(1, 0) = 1; (3 + 0) * 10 / 1 = 30
        Assert.Equal(30, minutes);
    }

    [Fact]
    public void Formula_UsesRollingAvgWhenAvailable()
    {
        var features = new WaitTimeFeatures
        {
            PeopleAhead = 2,
            NowServing = 0,
            ServiceEligibleActiveCounters = 1,
            RollingAvgServiceMinutes = 7.5,
            DefaultAvgServiceMinutes = 10,
        };

        var (minutes, _) = _formula.Estimate(features);

        // EffectiveAvgServiceMinutes = 7.5; (2 + 0) * 7.5 / 1 = 15
        Assert.Equal(15, minutes);
    }

    // ── Legacy static WaitTimeEstimator ──

    [Fact]
    public void Legacy_ZeroPeopleAhead_ReturnsZero()
    {
        Assert.Equal(0, WaitTimeEstimator.EstimateMinutes(0, 10, 2));
    }

    [Fact]
    public void Legacy_ZeroCounters_ReturnsInfinity()
    {
        Assert.Equal(double.PositiveInfinity, WaitTimeEstimator.EstimateMinutes(5, 10, 0));
    }

    [Fact]
    public void Legacy_BasicCalculation()
    {
        // 5 * 10 / 2 = 25
        Assert.Equal(25, WaitTimeEstimator.EstimateMinutes(5, 10, 2));
    }

    [Fact]
    public void Legacy_AvgZero_ReturnsZero()
    {
        // 5 * 0 / 2 = 0
        Assert.Equal(0, WaitTimeEstimator.EstimateMinutes(5, 0, 2));
    }
}
