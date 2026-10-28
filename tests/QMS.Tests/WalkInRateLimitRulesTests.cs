using Microsoft.AspNetCore.Http;
using QMS.Api.Services;

namespace QMS.Tests;

public class WalkInRateLimitRulesTests
{
    private static DefaultHttpContext MakeContext(string method, string path)
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Method = method;
        ctx.Request.Path = new PathString(path);
        return ctx;
    }

    [Fact]
    public void PostWalkIn_ReturnsTrue()
    {
        var ctx = MakeContext("POST", "/api/Queue/walk-in");
        Assert.True(WalkInRateLimitRules.IsPublicWalkInIssue(ctx.Request));
    }

    [Fact]
    public void PostWalkIn_TrailingSlash_ReturnsTrue()
    {
        var ctx = MakeContext("POST", "/api/Queue/walk-in/");
        Assert.True(WalkInRateLimitRules.IsPublicWalkInIssue(ctx.Request));
    }

    [Fact]
    public void PostWalkIn_CaseInsensitive_ReturnsTrue()
    {
        var ctx = MakeContext("POST", "/API/QUEUE/WALK-IN");
        Assert.True(WalkInRateLimitRules.IsPublicWalkInIssue(ctx.Request));
    }

    [Fact]
    public void GetWalkInMine_ReturnsFalse()
    {
        var ctx = MakeContext("GET", "/api/Queue/walk-in/mine");
        Assert.False(WalkInRateLimitRules.IsPublicWalkInIssue(ctx.Request));
    }

    [Fact]
    public void PostWalkInStaff_ReturnsFalse()
    {
        var ctx = MakeContext("POST", "/api/Queue/walk-in/staff");
        Assert.False(WalkInRateLimitRules.IsPublicWalkInIssue(ctx.Request));
    }

    [Fact]
    public void GetWalkIn_ReturnsFalse()
    {
        var ctx = MakeContext("GET", "/api/Queue/walk-in");
        Assert.False(WalkInRateLimitRules.IsPublicWalkInIssue(ctx.Request));
    }
}
