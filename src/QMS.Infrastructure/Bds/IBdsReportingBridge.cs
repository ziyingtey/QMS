namespace QMS.Infrastructure.Bds;

/// <summary>
/// Mirrors queue lifecycle into bank BDS reporting tables (optional; see Bds:Enabled).
/// Operational source of truth remains EF entities (QueueEntries, etc.).
/// </summary>
public interface IBdsReportingBridge
{
    Task OnTicketIssuedAsync(
        int branchCode,
        string ticketNumber,
        DateTimeOffset takeTimeUtc,
        string serviceCodeOrNum,
        CancellationToken cancellationToken = default);

    Task OnTicketCalledAsync(
        int branchCode,
        string ticketNumber,
        int counterNumber,
        string staffId10,
        DateTimeOffset callTimeUtc,
        CancellationToken cancellationToken = default);

    Task OnTicketCompletedAsync(
        int branchCode,
        string ticketNumber,
        string serviceName20,
        int counterNumber,
        string tellerId10,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? calledAtUtc,
        DateTimeOffset servingStartedUtc,
        DateTimeOffset servingEndedUtc,
        CancellationToken cancellationToken = default);
}
