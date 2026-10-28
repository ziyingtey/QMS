namespace QMS.Api.Services;

/// <summary>
/// Predicate for the walk-in rate limiter: only the public POST /api/Queue/walk-in endpoint
/// should be rate-limited. GET walk-in/mine (page load) and POST walk-in/staff (staff-issued)
/// are excluded so page reloads don't burn the device budget.
/// </summary>
public static class WalkInRateLimitRules
{
    private const string WalkInPath = "/api/Queue/walk-in";

    /// <summary>
    /// Returns true when <paramref name="request"/> is a public walk-in ticket issue
    /// (POST /api/Queue/walk-in, case-insensitive, optional trailing slash).
    /// </summary>
    public static bool IsPublicWalkInIssue(HttpRequest request)
    {
        if (!HttpMethods.IsPost(request.Method))
            return false;

        var path = request.Path.Value;
        if (path is null)
            return false;

        // Exact match (case-insensitive) or with a single trailing slash
        return path.Equals(WalkInPath, StringComparison.OrdinalIgnoreCase)
               || path.Equals(WalkInPath + "/", StringComparison.OrdinalIgnoreCase);
    }
}
