using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
            .Select(c => new CustomerMeDto(c.Email, c.Name, c.Phone, c.PreferredBranchId))
            .FirstOrDefaultAsync(cancellationToken);
        return row is null ? Unauthorized() : Ok(row);
    }

    [HttpPut("me/preferred-branch")]
    public async Task<ActionResult<CustomerMeDto>> SetPreferredBranch(
        [FromBody] SetPreferredBranchRequest body,
        CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == userId, cancellationToken);
        if (customer is null) return Unauthorized();

        if (body.PreferredBranchId is not null
            && !await db.Branches.AnyAsync(b => b.Id == body.PreferredBranchId, cancellationToken))
            return BadRequest(new { message = "Branch not found." });

        customer.PreferredBranchId = body.PreferredBranchId;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(new CustomerMeDto(customer.Email, customer.Name, customer.Phone, customer.PreferredBranchId));
    }
}

public sealed record CustomerMeDto(string Email, string Name, string? Phone, Guid? PreferredBranchId);

public sealed record SetPreferredBranchRequest(Guid? PreferredBranchId);
