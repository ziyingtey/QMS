using Microsoft.EntityFrameworkCore;

namespace QMS.Api.Services;

/// <summary>
/// Helpers for detecting and retrying ticket-number unique-index violations.
/// Daily ticket numbers (e.g. A001) are allocated as Max+1 without a lock, so two
/// concurrent walk-ins can race and hit the unique index on (BranchId, ServiceDay, TicketNumber).
/// </summary>
public static class TicketAllocationRetry
{
    /// <summary>Max attempts before giving up on a unique ticket-number collision.</summary>
    public const int MaxTicketNumberAttempts = 3;

    /// <summary>
    /// Returns true when the <see cref="DbUpdateException"/> was caused by a unique-index violation.
    /// Supports SQL Server (error 2601/2627) and SQLite (error code 19 / "UNIQUE constraint failed").
    /// </summary>
    public static bool IsUniqueConstraintViolation(DbUpdateException ex)
    {
        // SQL Server: Microsoft.Data.SqlClient.SqlException wraps error numbers 2601 / 2627
        if (ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx)
            return sqlEx.Number is 2601 or 2627;

        // SQLite: the message contains "UNIQUE constraint failed" and SQLite error code 19
        var inner = ex.InnerException;
        if (inner is not null)
        {
            var msg = inner.Message;
            if (msg.Contains("UNIQUE constraint failed", StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }
}
