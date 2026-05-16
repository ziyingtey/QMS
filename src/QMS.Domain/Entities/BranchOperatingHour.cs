namespace QMS.Domain.Entities;

/// <summary>One calendar weekday for a branch (Mon–Sun). When <see cref="IsClosed"/> is true, times are ignored.</summary>
public class BranchOperatingHour
{
    public Guid Id { get; set; }
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;

    /// <summary>English name matching <see cref="System.DayOfWeek"/> (Monday … Sunday).</summary>
    public string DayOfWeek { get; set; } = string.Empty;

    public TimeSpan? OpenTime { get; set; }
    public TimeSpan? CloseTime { get; set; }
    public bool IsClosed { get; set; }
}
