namespace QMS.Infrastructure.Dispatch;

public interface IDispatchRoundStateStore
{
    ValueTask<int> GetOnlineStreakAsync(Guid branchId, Guid serviceTypeId, CancellationToken cancellationToken);
    ValueTask SetOnlineStreakAsync(Guid branchId, Guid serviceTypeId, int value, CancellationToken cancellationToken);
}

public sealed class MemoryDispatchRoundStateStore : IDispatchRoundStateStore
{
    private readonly Dictionary<(Guid Branch, Guid Service), int> _state = new();
    private readonly object _gate = new();

    public ValueTask<int> GetOnlineStreakAsync(Guid branchId, Guid serviceTypeId, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            return ValueTask.FromResult(_state.GetValueOrDefault((branchId, serviceTypeId)));
        }
    }

    public ValueTask SetOnlineStreakAsync(Guid branchId, Guid serviceTypeId, int value, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            _state[(branchId, serviceTypeId)] = value;
        }

        return ValueTask.CompletedTask;
    }
}
