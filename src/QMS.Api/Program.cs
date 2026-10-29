using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using QMS.Api.Background;
using QMS.Api.Hubs;
using QMS.Api.Services;
using QMS.Application.Waiting;
using QMS.Infrastructure;
using QMS.Infrastructure.Persistence;
using System.Text;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    // Mobile/web clients send camelCase; record/DTO properties are PascalCase — must accept both.
    o.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
    o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "QMS API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey))
{
    if (builder.Environment.IsProduction())
        throw new InvalidOperationException("Jwt:Key must be configured in Production (use Jwt__Key env var or user-secrets).");
    jwtKey = "CHANGE_ME_DEV_ONLY_32_CHARS_MIN!!";
}
var keyBytes = Encoding.UTF8.GetBytes(jwtKey);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "QMS",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "QMS",
            IssuerSigningKey = new SymmetricSecurityKey(keyBytes)
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                    context.Token = accessToken;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Customer", p => p.RequireRole("Customer"));
    options.AddPolicy("Staff", p => p.RequireRole("Staff", "Manager"));
    options.AddPolicy("Manager", p => p.RequireRole("Manager"));
});

var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("Dev", policy =>
    {
        policy.AllowAnyHeader().AllowAnyMethod();
        if (corsOrigins is { Length: > 0 })
            policy.WithOrigins(corsOrigins).AllowCredentials();
        else if (builder.Environment.IsDevelopment())
            policy.SetIsOriginAllowed(_ => true);
        // Non-dev with no configured origins → no origins allowed (fail-closed)
    });
});

builder.Services.AddSignalR();
builder.Services.AddSingleton<IPasswordHasher<string>, PasswordHasher<string>>();
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection("Smtp"));
builder.Services.Configure<PublicUrlOptions>(builder.Configuration.GetSection("PublicUrls"));
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<AuthSessionService>();
builder.Services.AddScoped<CustomerNotificationService>();
builder.Services.AddScoped<QmsQueueService>();
builder.Services.Configure<WalkInOptions>(builder.Configuration.GetSection(WalkInOptions.SectionName));
builder.Services.AddSingleton<WalkInTokenService>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IBranchClock, BranchClock>();
// Walk-in rate limit: both per-IP (30/10 min) and per-device (3/10 min) always apply.
// Chained via GlobalLimiter so a request must pass BOTH limiters — changing X-Device-Id
// cannot bypass the per-IP cap. Staff/manager bypass both.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.ContentType = "application/json";
        await ctx.HttpContext.Response.WriteAsync(
            "{\"message\":\"Too many tickets from this device. Please wait a few minutes or ask our staff for help.\"}", ct);
    };

    var ipLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http =>
    {
        if (!WalkInRateLimitRules.IsPublicWalkInIssue(http.Request))
            return RateLimitPartition.GetNoLimiter("other");
        if (http.User.IsInRole("Staff") || http.User.IsInRole("Manager"))
            return RateLimitPartition.GetNoLimiter("staff");
        var ip = http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter("ip:" + ip,
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 });
    });

    var deviceLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http =>
    {
        if (!WalkInRateLimitRules.IsPublicWalkInIssue(http.Request))
            return RateLimitPartition.GetNoLimiter("other");
        if (http.User.IsInRole("Staff") || http.User.IsInRole("Manager"))
            return RateLimitPartition.GetNoLimiter("staff");
        var device = http.Request.Headers["X-Device-Id"].ToString().Trim();
        if (!string.IsNullOrEmpty(device) && device.Length <= 64)
            return RateLimitPartition.GetFixedWindowLimiter("dev:" + device,
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 3, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 });
        return RateLimitPartition.GetNoLimiter("no-device");
    });

    o.GlobalLimiter = PartitionedRateLimiter.CreateChained(ipLimiter, deviceLimiter);
});
builder.Services.AddHostedService<BookingLifecycleHostedService>();
builder.Services.AddHostedService<BranchQueueDayRolloverHostedService>();
builder.Services.AddHostedService<BranchAfterHoursCounterHostedService>();
builder.Services.AddHostedService<MlSnapshotHostedService>();
builder.Services.AddHostedService<MlSidecarHostedService>();
builder.Services.AddScoped<WaitTimeFeatureBuilder>();
builder.Services.AddScoped<CounterSimulationEstimator>();
builder.Services.Configure<MlWaitOptions>(builder.Configuration.GetSection(MlWaitOptions.SectionName));
builder.Services.Configure<ManagerAlertOptions>(builder.Configuration.GetSection(ManagerAlertOptions.SectionName));
builder.Services.AddHttpClient("MlWait", (sp, client) =>
{
    var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<MlWaitOptions>>().Value;
    client.BaseAddress = new Uri(opts.BaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromMilliseconds(Math.Clamp(opts.TimeoutMs, 100, 5000));
});
builder.Services.AddSingleton<FormulaWaitTimeEstimator>();
builder.Services.AddSingleton<IWaitTimeEstimator, MlHttpWaitTimeEstimator>();
builder.Services.AddInfrastructure(builder.Configuration);

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<QmsDbContext>();
    var hub = scope.ServiceProvider.GetRequiredService<IHubContext<QueueHub>>();
    var startupLogger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    await db.Database.EnsureCreatedAsync();
    await BranchOperatingHoursBackfill.EnsureDefaultsAsync(db);
    await ServiceQueueProvisioning.EnsureAsync(db, startupLogger);
    await MlTrainingSchemaEnsure.EnsureAsync(db, startupLogger);
    await BranchAfterHoursCounterSweep.RunAsync(db, hub, startupLogger, CancellationToken.None);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Dev");
// Expo / React Native call http://<host>:5154; redirecting to HTTPS breaks dev (certs, POST body).
if (!app.Environment.IsDevelopment())
    app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();
app.MapHub<QueueHub>("/hubs/queue");

app.Run();
