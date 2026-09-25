namespace QMS.Api.Services;

/// <summary>Config for the Python joblib sidecar (ml/serve_wait_model.py).</summary>
public sealed class MlWaitOptions
{
    public const string SectionName = "MlWait";

    /// <summary>When false, always use formula fallback.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Base URL of serve_wait_model.py (no trailing slash).</summary>
    public string BaseUrl { get; set; } = "http://127.0.0.1:5099";

    /// <summary>Hard timeout so a down sidecar never stalls Track UI.</summary>
    public int TimeoutMs { get; set; } = 400;
}
