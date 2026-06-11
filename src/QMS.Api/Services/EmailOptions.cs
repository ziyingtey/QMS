namespace QMS.Api.Services;

public sealed class SmtpOptions
{
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    /// <summary>Use STARTTLS (typical for port 587). Set false for implicit SSL (e.g. port 465).</summary>
    public bool UseStartTls { get; set; } = true;
    public string? User { get; set; }
    public string? Password { get; set; }
    public string FromEmail { get; set; } = "";
    public string FromName { get; set; } = "QGo";
    /// <summary>
    /// When true, skip connecting to SMTP and only log the verification URL (see API console).
    /// Use for local FYP demos without real mail credentials. Must be false in production.
    /// </summary>
    public bool DryRun { get; set; }
}

/// <summary>Public URL of this API (HTTPS), used in verification links. No trailing slash.</summary>
public sealed class PublicUrlOptions
{
    public string ApiPublicBaseUrl { get; set; } = "";
}
