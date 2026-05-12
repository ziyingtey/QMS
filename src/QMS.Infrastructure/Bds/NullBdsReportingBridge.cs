namespace QMS.Infrastructure.Bds;

public sealed class NullBdsReportingBridge : IBdsReportingBridge
{
    public Task OnTicketIssuedAsync(
        int branchCode,
        string ticketNumber,
        DateTimeOffset takeTimeUtc,
        string serviceCodeOrNum,
        CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task OnTicketCalledAsync(
        int branchCode,
        string ticketNumber,
        int counterNumber,
        string staffId10,
        DateTimeOffset callTimeUtc,
        CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task OnTicketCompletedAsync(
        int branchCode,
        string ticketNumber,
        string serviceName20,
        int counterNumber,
        string tellerId10,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? calledAtUtc,
        DateTimeOffset servingStartedUtc,
        DateTimeOffset servingEndedUtc,
        CancellationToken cancellationToken = default) => Task.CompletedTask;
}
