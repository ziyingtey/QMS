# Local secrets setup

## Why

`appsettings.Development.json` is tracked in git and must not contain real passwords, tokens, or credentials.
The values that were previously committed there have been moved to [.NET User Secrets](https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets), which stores them outside the repo in `~/.microsoft/usersecrets/`.

User secrets are loaded automatically when `ASPNETCORE_ENVIRONMENT=Development` and the project has a `<UserSecretsId>` (already set in `src/QMS.Api/QMS.Api.csproj`).

> **Rotate all previously committed values** — they remain in git history.

## Keys that must be set

| Key | Description | Example |
|-----|-------------|---------|
| `ConnectionStrings:Default` | SQL Server connection string | `Server=localhost,1433;Database=QMS;User Id=sa;Password=<YOUR_PASSWORD>;TrustServerCertificate=True;MultipleActiveResultSets=true` |
| `WalkIn:TokenSecret` | HMAC-SHA256 secret for walk-in QR tokens | any string ≥ 16 chars |
| `Smtp:User` | Gmail (or SMTP) username for outbound email | `you@gmail.com` |
| `Smtp:Password` | Gmail app password (set if sending real email) | 16-char app password |

## Setting secrets (one-time per dev machine)

```bash
cd /path/to/QMS

dotnet user-secrets set "ConnectionStrings:Default" \
  "Server=localhost,1433;Database=QMS;User Id=sa;Password=<YOUR_PASSWORD>;TrustServerCertificate=True;MultipleActiveResultSets=true" \
  --project src/QMS.Api

dotnet user-secrets set "WalkIn:TokenSecret" "<YOUR_WALKIN_SECRET>" --project src/QMS.Api

dotnet user-secrets set "Smtp:User" "<YOUR_SMTP_USER>" --project src/QMS.Api

dotnet user-secrets set "Smtp:Password" "<YOUR_SMTP_PASSWORD>" --project src/QMS.Api
```

Verify (values masked):

```bash
dotnet user-secrets list --project src/QMS.Api | sed 's/=.*/= ***/'
```

## Alternative: environment variables

If you prefer environment variables over user-secrets (e.g. Docker, CI), use the `__` separator:

```bash
export ConnectionStrings__Default="Server=..."
export WalkIn__TokenSecret="..."
export Smtp__User="..."
export Smtp__Password="..."
```

## Notes

- If no connection string is configured (empty or whitespace), the API falls back to EF Core InMemory — useful for quick demos without SQL Server.
- The dev JWT key (`Jwt:Key`) is duplicated in `Program.cs:55` and `appsettings.json` — it is a well-known dev-only value and out of scope here, but should be moved to user-secrets / env vars before any non-local deployment.
