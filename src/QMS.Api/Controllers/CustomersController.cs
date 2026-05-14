using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QMS.Domain.Entities;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "Customer")]
public sealed class CustomersController(QmsDbContext db) : ControllerBase
{
    [HttpGet("me")]
    public async Task<ActionResult<CustomerMeDto>> Me(CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var row = await db.Customers.AsNoTracking()
            .Where(c => c.Id == userId)
            .Select(c => new CustomerMeDto(
                c.Email,
                c.Name,
                c.Phone,
                c.FavoriteBranches.Select(f => f.BranchId).ToArray()))
            .FirstOrDefaultAsync(cancellationToken);
        return row is null ? Unauthorized() : Ok(row);
    }

    [HttpPost("me/favorite-branches/toggle")]
    public async Task<ActionResult<CustomerMeDto>> ToggleFavoriteBranch(
        [FromBody] ToggleFavoriteBranchRequest body,
        CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (!await db.Branches.AnyAsync(b => b.Id == body.BranchId, cancellationToken))
            return BadRequest(new { message = "Branch not found." });

        var customer = await db.Customers
            .Include(c => c.FavoriteBranches)
            .FirstOrDefaultAsync(c => c.Id == userId, cancellationToken);
        if (customer is null) return Unauthorized();

        var existing = customer.FavoriteBranches.FirstOrDefault(f => f.BranchId == body.BranchId);
        if (existing is not null)
            customer.FavoriteBranches.Remove(existing);
        else
            customer.FavoriteBranches.Add(new CustomerFavoriteBranch { CustomerId = customer.Id, BranchId = body.BranchId });

        await db.SaveChangesAsync(cancellationToken);

        return Ok(new CustomerMeDto(
            customer.Email,
            customer.Name,
            customer.Phone,
            customer.FavoriteBranches.Select(f => f.BranchId).ToArray()));
    }
}

public sealed record CustomerMeDto(string Email, string Name, string? Phone, IReadOnlyList<Guid> FavoriteBranchIds);

public sealed record ToggleFavoriteBranchRequest(Guid BranchId);
