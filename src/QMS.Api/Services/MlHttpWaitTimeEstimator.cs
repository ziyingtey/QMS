using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using QMS.Application.Waiting;

namespace QMS.Api.Services;

/// <summary>
/// Customer-facing wait ETA via Python joblib sidecar.
/// Falls back to <see cref="FormulaWaitTimeEstimator"/> when disabled, unreachable, or invalid.
/// </summary>
public sealed class MlHttpWaitTimeEstimator : IWaitTimeEstimator
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly FormulaWaitTimeEstimator _formula;
    private readonly MlWaitOptions _opts;
    private readonly ILogger<MlHttpWaitTimeEstimator> _log;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = null, // sklearn feature names are PascalCase
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public MlHttpWaitTimeEstimator(
        IHttpClientFactory httpClientFactory,
        FormulaWaitTimeEstimator formula,
        IOptions<MlWaitOptions> opts,
        ILogger<MlHttpWaitTimeEstimator> log)
    {
        _httpClientFactory = httpClientFactory;
        _formula = formula;
        _opts = opts.Value;
        _log = log;
    }

    public (double Minutes, PredictionSource Source) Estimate(WaitTimeFeatures features)
    {
        if (!_opts.Enabled)
            return _formula.Estimate(features);

        try
        {
            var payload = BuildPayload(features);
            var client = _httpClientFactory.CreateClient("MlWait");
            using var req = new HttpRequestMessage(HttpMethod.Post, "/predict")
            {
                Content = JsonContent.Create(payload, options: JsonOpts),
            };
            using var resp = client.Send(req);
            if (!resp.IsSuccessStatusCode)
            {
                _log.LogDebug("ML wait sidecar returned {Status}", (int)resp.StatusCode);
                return _formula.Estimate(features);
            }

            using var stream = resp.Content.ReadAsStream();
            var parsed = JsonSerializer.Deserialize<MlPredictResponse>(stream, JsonOpts);
            if (parsed is null || parsed.Minutes < 0 || double.IsNaN(parsed.Minutes) || double.IsInfinity(parsed.Minutes))
                return _formula.Estimate(features);

            return (parsed.Minutes, PredictionSource.Ml);
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "ML wait sidecar unavailable — formula fallback");
            return _formula.Estimate(features);
        }
    }

    internal static Dictionary<string, object?> BuildPayload(WaitTimeFeatures f)
    {
        var listening = Math.Max(1, f.ServiceEligibleActiveCounters > 0
            ? f.ServiceEligibleActiveCounters
            : f.ActiveCounters);
        var peopleAhead = Math.Max(0, f.PeopleAhead);
        var queueLen = Math.Max(0, f.QueueLength);
        var prefix = string.IsNullOrEmpty(f.TicketPrefix)
            ? (string.IsNullOrEmpty(f.ServiceCode) ? "X" : f.ServiceCode[..1].ToUpperInvariant())
            : f.TicketPrefix[..1].ToUpperInvariant();

        var slotActive = f.SlotActive
            ?? (f.MinutesSinceSlotStart.HasValue && f.MinutesUntilSlotEnd.HasValue
                && f.MinutesSinceSlotStart >= 0 && f.MinutesUntilSlotEnd > 0 ? 1 : 0);

        var callNextPriority = f.CallNextPriority
            ?? (f.EntryType == 1 && f.CheckedIn && slotActive == 1 ? 0 : 1);

        return new Dictionary<string, object?>
        {
            ["QueueLength"] = queueLen,
            ["CrossLaneQueueLength"] = f.CrossLaneQueueLength ?? (f.OnlineQueueLength + f.WalkInQueueLength),
            ["PeopleAheadCallNext"] = f.PeopleAheadCallNext ?? peopleAhead,
            ["ActiveCounters"] = Math.Max(1, f.ActiveCounters),
            ["ListeningCounters"] = listening,
            ["HourOfDay"] = f.HourOfDay,
            ["DayOfWeek"] = f.DayOfWeek,
            ["IsPeakHour"] = f.IsPeakHour ? 1 : 0,
            ["DefaultAvgServiceMinutes"] = f.EffectiveAvgServiceMinutes,
            ["EnqueueSequence"] = f.EnqueueSequence,
            ["EntryType"] = f.EntryType,
            ["CheckedIn"] = f.CheckedIn ? 1 : 0,
            ["SlotActive"] = slotActive,
            ["CallNextPriority"] = callNextPriority,
            ["BranchCode"] = f.BranchCode,
            ["ServiceCode"] = f.ServiceCode,
            ["TicketPrefix"] = prefix,
        };
    }

    private sealed class MlPredictResponse
    {
        [JsonPropertyName("minutes")]
        public double Minutes { get; set; }

        [JsonPropertyName("source")]
        public string? Source { get; set; }
    }
}
