namespace QMS.Domain.Entities;

/// <summary>Many-to-many: a customer may mark several branches as favorites.</summary>
public sealed class CustomerFavoriteBranch
{
    public Guid CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
}
