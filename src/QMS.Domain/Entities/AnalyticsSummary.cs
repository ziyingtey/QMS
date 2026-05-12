namespace QMS.Domain.Entities;

public class AnalyticsSummary
{
    public Guid Id { get; set; }
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
    public DateOnly ReportDate { get; set; }
    public int TotalCustomers { get; set; }
    public double? AvgWaitingMinutes { get; set; }
    public double? AvgServiceMinutes { get; set; }
    public double? NoShowRate { get; set; }
    public string? PeakHourLabel { get; set; }
    public DateTimeOffset ComputedAt { get; set; } = DateTimeOffset.UtcNow;
}
