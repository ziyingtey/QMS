#!/usr/bin/env bash
# Start SQL Server in Docker + create database QMS for local QMS.Api development.
# Password must match ConnectionStrings:Default in appsettings.Development.json
#
# Prerequisites: Docker Desktop installed and running.
# Apple Silicon Mac: if the container exits immediately, add --platform linux/amd64 to docker run below.
#
# Usage (repo root):
#   chmod +x scripts/start-qms-sql-docker.sh && ./scripts/start-qms-sql-docker.sh

set -euo pipefail

SA_PASSWORD="QmsDocker2026!Local"
CONTAINER_NAME="qms-sql"
IMAGE="mcr.microsoft.com/mssql/server:2022-latest"

sqlcmd_try() {
  local q="$1"
  docker exec "$CONTAINER_NAME" /opt/mssql-tools18/bin/sqlcmd \
    -S localhost -U sa -P "$SA_PASSWORD" -C -Q "$q" -b 2>/dev/null \
    || docker exec "$CONTAINER_NAME" /opt/mssql-tools/bin/sqlcmd \
    -S localhost -U sa -P "$SA_PASSWORD" -C -Q "$q" -b 2>/dev/null
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install Docker Desktop (Mac/Windows), then run this script again."
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "[$CONTAINER_NAME] exists — starting if stopped..."
  docker start "$CONTAINER_NAME" >/dev/null
else
  echo "[$CONTAINER_NAME] creating (first run may download the image)..."
  docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=$SA_PASSWORD" \
    -p 1433:1433 --name "$CONTAINER_NAME" \
    -d "$IMAGE"
fi

echo "Waiting for SQL Server (often 15–40 s the first time)..."
ready=0
for _ in $(seq 1 45); do
  if sqlcmd_try "SELECT 1" >/dev/null 2>&1; then
    ready=1
    echo "SQL Server is ready."
    break
  fi
  printf "."
  sleep 2
done
echo
if [ "$ready" != "1" ]; then
  echo "Timeout waiting for SQL Server. Check: docker logs $CONTAINER_NAME"
  exit 1
fi

if sqlcmd_try "IF DB_ID('QMS') IS NULL CREATE DATABASE QMS;"; then
  echo "Database [QMS] is ready."
else
  echo "sqlcmd failed. In VS Code (MSSQL extension) or SSMS: connect to localhost,1433 as sa and run: CREATE DATABASE QMS;"
  exit 1
fi

echo ""
echo "Next:"
echo "  1) Connection string is in appsettings.Development.json (Development profile)."
echo "  2) Run API:  cd src/QMS.Api && dotnet run --environment Development"
echo "  3) VS Code + \"MSSQL\" extension (or SSMS on Windows): Server=localhost,1433  User=sa  Password=$SA_PASSWORD"
echo ""
