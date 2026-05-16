using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using QMS.Api.Background;
using QMS.Api.Hubs;
using QMS.Api.Services;
using QMS.Application.Capacity;
using QMS.Infrastructure;
using QMS.Infrastructure.Persistence;
using System.Text;

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

var jwtKey = builder.Configuration["Jwt:Key"] ?? "CHANGE_ME_DEV_ONLY_32_CHARS_MIN!!";
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

builder.Services.AddCors(options =>
{
    options.AddPolicy("Dev", policy =>
    {
        policy
            .AllowAnyHeader()
            .AllowAnyMethod()
            .SetIsOriginAllowed(_ => true);
    });
});

builder.Services.AddSignalR();
builder.Services.AddSingleton<ICapacityEngine, CapacityEngine>();
builder.Services.AddSingleton<IPasswordHasher<string>, PasswordHasher<string>>();
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddScoped<QmsQueueService>();
builder.Services.AddHostedService<BookingLifecycleHostedService>();
builder.Services.AddHostedService<BranchQueueDayRolloverHostedService>();
builder.Services.AddInfrastructure(builder.Configuration);

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<QmsDbContext>();
    await db.Database.EnsureCreatedAsync();
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
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<QueueHub>("/hubs/queue");

app.Run();
