using QMS.Api.Services;

namespace QMS.Tests;

public class NormalizePrefixTests
{
    [Fact]
    public void SingleLetter_ReturnsUppercased()
    {
        Assert.Equal("A", QmsQueueService.NormalizePrefix("a"));
    }

    [Fact]
    public void ThreeLetters_ReturnsUppercased()
    {
        Assert.Equal("ABC", QmsQueueService.NormalizePrefix("abc"));
    }

    [Fact]
    public void Lowercase_Uppercased()
    {
        Assert.Equal("XY", QmsQueueService.NormalizePrefix("xy"));
    }

    [Fact]
    public void FourLetters_Throws()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => QmsQueueService.NormalizePrefix("ABCD"));
        Assert.Contains("1–3", ex.Message);
    }

    [Fact]
    public void EmptyString_Throws()
    {
        Assert.Throws<InvalidOperationException>(() => QmsQueueService.NormalizePrefix(""));
    }

    [Fact]
    public void WhitespaceOnly_Throws()
    {
        Assert.Throws<InvalidOperationException>(() => QmsQueueService.NormalizePrefix("   "));
    }

    [Fact]
    public void DigitsOnly_Throws()
    {
        // Digits are stripped → 0 letters remaining → error
        var ex = Assert.Throws<InvalidOperationException>(() => QmsQueueService.NormalizePrefix("123"));
        Assert.Contains("1–3", ex.Message);
    }

    [Fact]
    public void MixedDigitsAndLetters_StripsDigits()
    {
        Assert.Equal("AB", QmsQueueService.NormalizePrefix("A1B"));
    }
}
