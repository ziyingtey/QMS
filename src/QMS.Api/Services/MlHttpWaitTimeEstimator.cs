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
                // Serialize up front: JsonContent has no known length, so a synchronous Send streams it chunked
                // without Content-Length. serve_wait_model.py reads exactly Content-Length bytes, so it got an
                // empty body and returned 400 "invalid json" (every live call fell back to the formula).
                Content = new StringContent(
                    JsonSerializer.Serialize(payload, JsonOpts), System.Text.Encoding.UTF8, "application/json"),
            };
            using var resp = client.Send(req);
            if (!resp.IsSuccessStatusCode)
            {
                _log.LogWarning("ML wait sidecar returned {Status}: {Body}", (int)resp.StatusCode,
                    new StreamReader(resp.Content.ReadAsStream()).ReadToEnd());
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
            _log.LogWarning(ex, "ML wait sidecar unavailable — formula fallback");
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

        // FIX: P0 = OnlineBooked (EntryType 0, same encoding as training) + checked in + slot active.
        // The fallback previously tested EntryType == 1 (walk-in). Only used when CallNextPriority is null.
        var callNextPriority = f.CallNextPriority
            ?? (f.EntryType == 0 && f.CheckedIn && slotActive == 1 ? 0 : 1);

        return new Dictionary<string, object?>
        {
            // Queue state
            ["QueueLength"] = queueLen,
            ["CrossLaneQueueLength"] = f.CrossLaneQueueLength ?? (f.OnlineQueueLength + f.WalkInQueueLength),
            ["PeopleAheadCallNext"] = f.PeopleAheadCallNext ?? peopleAhead,
            ["NowServing"] = f.NowServing,
            // Capacity
            ["ActiveCounters"] = Math.Max(1, f.ActiveCounters),
            ["ListeningCounters"] = listening,
            // Time
            ["HourOfDay"] = f.HourOfDay,
            ["DayOfWeek"] = f.DayOfWeek,
            ["IsPeakHour"] = f.IsPeakHour ? 1 : 0,
            // Service duration
            // FIX: training's DefaultAvgServiceMinutes is the static per-service default (avg_min);
            // the rolling value has its own feature. Previously sent EffectiveAvg (rolling ?? default),
            // e.g. DEPOSIT default 10 but rolling 6.4 -> model got 6.4 here instead of 10.
            ["DefaultAvgServiceMinutes"] = f.DefaultAvgServiceMinutes,
            ["RollingAvgServiceMinutes"] = f.RollingAvgServiceMinutes,
            // Entry
            ["EnqueueSequence"] = f.EnqueueSequence,
            ["EntryType"] = f.EntryType,
            ["CheckedIn"] = f.CheckedIn ? 1 : 0,
            // Slot features
            ["SlotActive"] = slotActive,
            ["CallNextPriority"] = callNextPriority,
            ["SlotDurationMinutes"] = f.SlotDurationMinutes,
            ["EarlyCallMinutes"] = f.EarlyCallMinutes,
            ["MinutesUntilSlotEnd"] = f.MinutesUntilSlotEnd,
            ["MinutesSinceSlotStart"] = f.MinutesSinceSlotStart,
            ["OnlineSlotsPerSlot"] = f.OnlineSlotsPerSlot,
            ["OnlineBookedInSlot"] = f.OnlineBookedInSlot,
            ["WalkInInSlot"] = f.WalkInInSlot,
            // Identity
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
