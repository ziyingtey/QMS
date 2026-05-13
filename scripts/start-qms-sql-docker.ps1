# Start SQL Server in Docker on Windows + create database QMS for QMS.Api.
# Password must match ConnectionStrings:Default in appsettings.Development.json
#
# Prerequisites: Docker Desktop for Windows installed and running (WSL2 backend).
# If port 1433 is already used by a local SQL Server, change -p 14333:1433 below and use Server=localhost,14333 in your connection string.
#
# Run in PowerShell (repo root), as Administrator if Docker requires it:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\scripts\start-qms-sql-docker.ps1

$ErrorActionPreference = "Stop"
$SaPassword = "QmsDocker2026!Local"
$ContainerName = "qms-sql"
$Image = "mcr.microsoft.com/mssql/server:2022-latest"

function Test-Docker {
    docker version 2>$null | Out-Null
    if (-not $?) { throw "Docker not found. Install Docker Desktop for Windows and ensure it is running." }
}

function Invoke-SqlCmdInContainer {
    param([string]$Query)
    docker exec $ContainerName /opt/mssql-tools18/bin/sqlcmd `
        -S localhost -U sa -P $SaPassword -C -Q $Query -b 2>$null
    if ($LASTEXITCODE -eq 0) { return $true }
    docker exec $ContainerName /opt/mssql-tools/bin/sqlcmd `
        -S localhost -U sa -P $SaPassword -C -Q $Query -b 2>$null
    return ($LASTEXITCODE -eq 0)
}

Test-Docker

$exists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^${ContainerName}$" -Quiet
if ($exists) {
    Write-Host "[$ContainerName] exists — starting if stopped..."
    docker start $ContainerName | Out-Null
}
else {
    Write-Host "[$ContainerName] creating (first run may download the image)..."
    docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=$SaPassword" `
        -p 1433:1433 --name $ContainerName -d $Image
}

Write-Host "Waiting for SQL Server (often 20-60 s the first time)..."
$ready = $false
for ($i = 0; $i -lt 45; $i++) {
    if (Invoke-SqlCmdInContainer "SELECT 1") {
        $ready = $true
        Write-Host "SQL Server is ready."
        break
    }
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 2
}
Write-Host ""

if (-not $ready) {
    Write-Host "Timeout. Check: docker logs $ContainerName"
    exit 1
}

if (-not (Invoke-SqlCmdInContainer "IF DB_ID('QMS') IS NULL CREATE DATABASE QMS;")) {
    Write-Host "sqlcmd failed. In SSMS connect to localhost,1433 as sa and run: CREATE DATABASE QMS;"
    exit 1
}

Write-Host "Database [QMS] is ready."
Write-Host ""
Write-Host "Next:"
Write-Host "  1) appsettings.Development.json: Server=localhost,1433; Database=QMS; User Id=sa; Password=$SaPassword (already set if you use repo defaults)"
Write-Host "  2) Run API:  cd src\QMS.Api; dotnet run --environment Development"
Write-Host "  3) SSMS: Server name = localhost,1433  Authentication = SQL Server Authentication  Login = sa  Password = $SaPassword"
Write-Host ""
