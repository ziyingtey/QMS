using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace QMS.Api.Hubs;

/// <summary>Public read-side hub: customers (incl. anonymous walk-ins) and staff subscribe for live branch updates.</summary>
[AllowAnonymous]
public sealed class QueueHub : Hub
{
    public static string BranchGroup(Guid branchId) => $"branch-{branchId}";

    public async Task WatchBranch(Guid branchId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, BranchGroup(branchId));
    }

    public async Task LeaveBranch(Guid branchId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, BranchGroup(branchId));
    }
}
