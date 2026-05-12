using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using QMS.Infrastructure.Persistence;

namespace QMS.Infrastructure.Bds;

public sealed class SqlServerBdsReportingBridge : IBdsReportingBridge
{
    private readonly QmsDbContext _db;
    private readonly ILogger<SqlServerBdsReportingBridge> _logger;

    public SqlServerBdsReportingBridge(QmsDbContext db, ILogger<SqlServerBdsReportingBridge> logger)
    {
        _db = db;
        _logger = logger;
    }

    public Task OnTicketIssuedAsync(
        int branchCode,
        string ticketNumber,
        DateTimeOffset takeTimeUtc,
        string serviceCodeOrNum,
        CancellationToken cancellationToken = default) =>
        RunSafeAsync(
            async (cmd, ct) =>
            {
                cmd.CommandText = """
                    MERGE dbo.BDS_QMS_TICKET WITH (HOLDLOCK) AS t
                    USING (SELECT @b AS BRANCH_CD, @t AS TICKET_NUM) AS s
                    ON t.BRANCH_CD = s.BRANCH_CD AND t.TICKET_NUM = s.TICKET_NUM
                    WHEN MATCHED THEN
                        UPDATE SET TAKE_TIME = @take, SERVICE_NUM = @svc
                    WHEN NOT MATCHED THEN
                        INSERT (TICKET_NUM, BRANCH_CD, STAFF_ID, COUNTER_NUM, TAKE_TIME, WAITING_TIME, ACS_PROFILE, CALL_TIME, WORKSTATION_NAME, SERVICE_NUM, VALID_DTTM, PROCESSED_DTTM)
                        VALUES (@t, @b, N'', 0, @take, NULL, N'IHQMS', NULL, N'IH-QMS', @svc, NULL, NULL);
                    """;
                cmd.Parameters.AddWithValue("@b", branchCode);
                cmd.Parameters.AddWithValue("@t", Bds10(ticketNumber));
                cmd.Parameters.AddWithValue("@take", takeTimeUtc.UtcDateTime);
                cmd.Parameters.AddWithValue("@svc", Bds20(serviceCodeOrNum));
                await cmd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
            },
            nameof(OnTicketIssuedAsync),
            cancellationToken);

    public Task OnTicketCalledAsync(
        int branchCode,
        string ticketNumber,
        int counterNumber,
        string staffId10,
        DateTimeOffset callTimeUtc,
        CancellationToken cancellationToken = default) =>
        RunSafeAsync(
            async (cmd, ct) =>
            {
                cmd.CommandText = """
                    UPDATE dbo.BDS_QMS_TICKET
                    SET COUNTER_NUM = @c, CALL_TIME = @call, STAFF_ID = @staff
                    WHERE BRANCH_CD = @b AND TICKET_NUM = @t;
                    """;
                cmd.Parameters.AddWithValue("@b", branchCode);
                cmd.Parameters.AddWithValue("@t", Bds10(ticketNumber));
                cmd.Parameters.AddWithValue("@c", counterNumber);
                cmd.Parameters.AddWithValue("@call", callTimeUtc.UtcDateTime);
                cmd.Parameters.AddWithValue("@staff", Bds10(staffId10));
                await cmd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
            },
            nameof(OnTicketCalledAsync),
            cancellationToken);

    public Task OnTicketCompletedAsync(
        int branchCode,
        string ticketNumber,
        string serviceName20,
        int counterNumber,
        string tellerId10,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? calledAtUtc,
        DateTimeOffset servingStartedUtc,
        DateTimeOffset servingEndedUtc,
        CancellationToken cancellationToken = default) =>
        RunSafeAsync(
            async (cmd, ct) =>
            {
                var callOrStart = calledAtUtc ?? servingStartedUtc;
                var waitSec = (int)Math.Clamp((callOrStart - createdAtUtc).TotalSeconds, 0, int.MaxValue);
                var serveSec = (int)Math.Clamp((servingEndedUtc - servingStartedUtc).TotalSeconds, 0, int.MaxValue);

                cmd.CommandText = """
                    UPDATE dbo.BDS_QMS_TICKET
                    SET WAITING_TIME = @wait
                    WHERE BRANCH_CD = @b AND TICKET_NUM = @t;

                    INSERT INTO dbo.BDS_QMS_AUDIT (
                        TICKET_DATE, BRANCH_CD, TICKET_NUM,
                        ISSUED_TIME, SERVED_TIME, WAITING_TIME, COUNTER, SERVING_TIME,
                        SERVICE, TELLER_ID, WORKSTATION_NAME, VALID_DTTM, PROCESSED_DTTM)
                    VALUES (
                        @ticketDate, @b, @t,
                        @issued, @served, @wait, @counter, @serving,
                        @service, @teller, N'IH-QMS', NULL, NULL);
                    """;
                cmd.Parameters.AddWithValue("@b", branchCode);
                cmd.Parameters.AddWithValue("@t", Bds10(ticketNumber));
                cmd.Parameters.AddWithValue("@wait", waitSec);
                cmd.Parameters.AddWithValue("@ticketDate", servingStartedUtc.UtcDateTime.Date);
                cmd.Parameters.AddWithValue("@issued", servingStartedUtc.UtcDateTime);
                cmd.Parameters.AddWithValue("@served", servingEndedUtc.UtcDateTime);
                cmd.Parameters.AddWithValue("@counter", counterNumber);
                cmd.Parameters.AddWithValue("@serving", serveSec);
                cmd.Parameters.AddWithValue("@service", Bds20(serviceName20));
                cmd.Parameters.AddWithValue("@teller", Bds10(tellerId10));
                await cmd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
            },
            nameof(OnTicketCompletedAsync),
            cancellationToken);

    private async Task RunSafeAsync(
        Func<SqlCommand, CancellationToken, Task> action,
        string op,
        CancellationToken cancellationToken)
    {
        try
        {
            if (_db.Database.GetDbConnection() is not SqlConnection sqlConn)
                return;

            var shouldClose = sqlConn.State != ConnectionState.Open;
            if (shouldClose)
                await _db.Database.OpenConnectionAsync(cancellationToken).ConfigureAwait(false);

            try
            {
                await using var cmd = sqlConn.CreateCommand();
                await action(cmd, cancellationToken).ConfigureAwait(false);
            }
            finally
            {
                if (shouldClose)
                    await _db.Database.CloseConnectionAsync().ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "BDS reporting bridge failed during {Operation}", op);
        }
    }

    private static string Bds10(string value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Length <= 10 ? value : value[..10];
    }

    private static string Bds20(string value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Length <= 20 ? value : value[..20];
    }
}
