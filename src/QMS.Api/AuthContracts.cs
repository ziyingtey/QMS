namespace QMS.Api;

public sealed record RegisterRequest(string Email, string Password, string? Name);
public sealed record LoginRequest(string Email, string Password);
public sealed record LoginResponse(string Token, string RefreshToken, Guid UserId, string Email, string Role, Guid? BranchId = null);
public sealed record RegisterPendingResponse(bool RequiresEmailVerification, string Message, bool EmailSent);
public sealed record ResendVerificationRequest(string Email);
public sealed record RefreshRequest(string RefreshToken);
