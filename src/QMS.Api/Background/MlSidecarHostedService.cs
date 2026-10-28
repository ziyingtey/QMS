using System.Diagnostics;
using System.Net.Sockets;
using Microsoft.Extensions.Options;
using QMS.Api.Services;

namespace QMS.Api.Background;

/// <summary>
/// Auto-starts ml/serve_wait_model.py when the API boots, if MlWait is enabled
/// and nothing is already listening on the configured port. Spawns a process only —
/// does not embed the joblib model in C#. API continues if start fails (ETA falls back).
/// </summary>
public sealed class MlSidecarHostedService : IHostedService, IDisposable
{
    private readonly MlWaitOptions _opts;
    private readonly IHostEnvironment _env;
    private readonly ILogger<MlSidecarHostedService> _log;
    private Process? _process;
    private bool _startedByUs;

    public MlSidecarHostedService(
        IOptions<MlWaitOptions> opts,
        IHostEnvironment env,
        ILogger<MlSidecarHostedService> log)
    {
        _opts = opts.Value;
        _env = env;
        _log = log;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_opts.Enabled)
        {
            _log.LogInformation("ML wait sidecar auto-start skipped (MlWait:Enabled=false)");
            return Task.CompletedTask;
        }

        if (!TryParseEndpoint(_opts.BaseUrl, out var host, out var port))
        {
            _log.LogWarning(
                "ML wait sidecar auto-start skipped: could not parse MlWait:BaseUrl '{BaseUrl}'",
                _opts.BaseUrl);
            return Task.CompletedTask;
        }

        if (IsPortAccepting(host, port))
        {
            _log.LogInformation(
                "ML already running on {Host}:{Port} — skipping sidecar spawn",
                host,
                port);
            return Task.CompletedTask;
        }

        var mlDir = ResolveMlDirectory();
        if (mlDir is null)
        {
            _log.LogWarning(
                "ML wait sidecar auto-start failed: could not find ml/serve_wait_model.py " +
                "(searched from ContentRoot={ContentRoot}). ETA will use formula fallback until sidecar is started manually.",
                _env.ContentRootPath);
            return Task.CompletedTask;
        }

        var script = Path.Combine(mlDir, "serve_wait_model.py");
        var python = ResolvePython(mlDir);
        if (python is null)
        {
            _log.LogWarning(
                "ML wait sidecar auto-start failed: no Python found " +
                "(tried {Venv} and python3 on PATH). ETA falls back until sidecar is started manually.",
                Path.Combine(mlDir, ".venv", "bin", "python"));
            return Task.CompletedTask;
        }

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = python,
                WorkingDirectory = mlDir,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            psi.ArgumentList.Add(script);
            psi.ArgumentList.Add("--host");
            psi.ArgumentList.Add(host);
            psi.ArgumentList.Add("--port");
            psi.ArgumentList.Add(port.ToString());

            _process = Process.Start(psi);
            if (_process is null)
            {
                _log.LogWarning("ML wait sidecar Process.Start returned null — ETA falls back");
                return Task.CompletedTask;
            }

            _startedByUs = true;
            _process.EnableRaisingEvents = true;
            _process.OutputDataReceived += (_, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Data))
                    _log.LogDebug("ML sidecar stdout: {Line}", e.Data);
            };
            _process.ErrorDataReceived += (_, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Data))
                    _log.LogWarning("ML sidecar stderr: {Line}", e.Data);
            };
            _process.BeginOutputReadLine();
            _process.BeginErrorReadLine();

            // Brief wait so a fast crash surfaces in logs; do not block API long.
            Thread.Sleep(400);
            if (_process.HasExited)
            {
                _log.LogWarning(
                    "ML wait sidecar exited immediately (code {Code}). ETA falls back. " +
                    "Check ml/.venv and wait_model.joblib. Command: {Python} {Script} --host {Host} --port {Port} (cwd={Cwd})",
                    _process.ExitCode,
                    python,
                    script,
                    host,
                    port,
                    mlDir);
                _startedByUs = false;
                _process.Dispose();
                _process = null;
                return Task.CompletedTask;
            }

            _log.LogInformation(
                "ML wait sidecar started (pid {Pid}) on http://{Host}:{Port} via {Python}",
                _process.Id,
                host,
                port,
                python);
        }
        catch (Exception ex)
        {
            _log.LogWarning(
                ex,
                "ML wait sidecar auto-start failed — API continues; ETA falls back to formula/simulation");
            KillIfStarted();
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        if (_startedByUs && _process is { HasExited: false })
        {
            try
            {
                _log.LogInformation("Stopping ML wait sidecar (pid {Pid})", _process.Id);
                _process.Kill(entireProcessTree: true);
                _process.WaitForExit(3000);
            }
            catch (Exception ex)
            {
                _log.LogDebug(ex, "ML wait sidecar kill on shutdown");
            }
        }

        return Task.CompletedTask;
    }

    public void Dispose()
    {
        KillIfStarted();
        _process?.Dispose();
        _process = null;
    }

    private void KillIfStarted()
    {
        if (!_startedByUs || _process is null) return;
        try
        {
            if (!_process.HasExited)
                _process.Kill(entireProcessTree: true);
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "ML sidecar kill best-effort failed");
        }
    }

    private string? ResolveMlDirectory()
    {
        var candidates = new List<string>();
        void AddWalk(string? start)
        {
            if (string.IsNullOrWhiteSpace(start)) return;
            var dir = new DirectoryInfo(Path.GetFullPath(start));
            for (var i = 0; i < 6 && dir is not null; i++, dir = dir.Parent)
            {
                var ml = Path.Combine(dir.FullName, "ml");
                if (File.Exists(Path.Combine(ml, "serve_wait_model.py")))
                    candidates.Add(ml);
            }
        }

        AddWalk(_env.ContentRootPath);
        AddWalk(AppContext.BaseDirectory);
        AddWalk(Directory.GetCurrentDirectory());

        return candidates.Distinct(StringComparer.OrdinalIgnoreCase).FirstOrDefault();
    }

    private string? ResolvePython(string mlDir)
    {
        // Unix venv (Mac/Linux) — user is on Mac
        var venvUnix = Path.Combine(mlDir, ".venv", "bin", "python");
        if (File.Exists(venvUnix))
            return venvUnix;

        // Windows venv fallback (kept simple)
        var venvWin = Path.Combine(mlDir, ".venv", "Scripts", "python.exe");
        if (File.Exists(venvWin))
            return venvWin;

        // PATH fallbacks
        foreach (var name in new[] { "python3", "python" })
        {
            try
            {
                var probe = new ProcessStartInfo
                {
                    FileName = name,
                    Arguments = "--version",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                };
                using var p = Process.Start(probe);
                if (p is null) continue;
                p.WaitForExit(2000);
                if (p.ExitCode == 0)
                    return name;
            }
            catch (Exception ex)
            {
                _log.LogDebug(ex, "Python probe failed for candidate '{Candidate}'", name);
            }
        }

        return null;
    }

    private static bool TryParseEndpoint(string baseUrl, out string host, out int port)
    {
        host = "127.0.0.1";
        port = 5099;
        if (string.IsNullOrWhiteSpace(baseUrl))
            return false;
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri))
            return false;
        host = string.IsNullOrEmpty(uri.Host) ? "127.0.0.1" : uri.Host;
        port = uri.IsDefaultPort ? 5099 : uri.Port;
        return port is > 0 and < 65536;
    }

    private bool IsPortAccepting(string host, int port)
    {
        try
        {
            using var client = new TcpClient();
            var connect = client.ConnectAsync(host, port);
            if (!connect.Wait(TimeSpan.FromMilliseconds(250)))
                return false;
            return client.Connected;
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Port probe failed for {Host}:{Port}", host, port);
            return false;
        }
    }
}
