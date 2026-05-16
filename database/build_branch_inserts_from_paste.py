#!/usr/bin/env python3
"""
Read database/branches_paste_raw.txt (one branch per line, as pasted: N.Name,Address,...,State,lat,lng,hours).
Emit SQL in the same shape as insert-branches-user-values.sql (DECLARE @Branches + INSERT INTO BRANCHES).

Parsing: strip leading index; fix known typos; anchor tail as ,lat,lng,hours
  where hours matches Mon-Fri…; state = segment before lat; name = first segment; address = middle.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW_PATH = ROOT / "branches_paste_raw.txt"
OUT_PATH = ROOT / "insert-branches-from-paste.sql"

TAIL_RE = re.compile(
    r",\s*(?P<lat>-?\d+\.\d+)\s*,\s*(?P<lng>-?\d+\.\d+)\s*,\s*(?P<hours>Mon[^\n,]*?)\s*$",
    re.IGNORECASE,
)


def normalize_line(s: str) -> str:
    s = s.replace("\u201c", '"').replace("\u201d", '"').replace("\u2018", "'").replace("\u2019", "'")
    s = s.replace("\u3001", ",").replace("，", ",")  # some CJK commas
    s = s.replace("`", "'")
    # Kota Damansara row: hours appear before lat/lng — move to end: ,Mon-Fri…lat,lng -> ,lat,lng,Mon-Fri…
    s = re.sub(
        r",\s*(Mon[-\s]?Fri\s+9:30[-\s]?16:00)\s*(\d+\.\d+)\s*,\s*(\d+\.\d+)\s*,?\s*$",
        r",\2,\3,\1",
        s,
        flags=re.I,
    )
    # Segambut-style double comma before hours: ,lat,lng,,Mon
    s = re.sub(r",(\d+\.\d+)\s*,\s*,\s*(Mon)", r",\1,\2", s, flags=re.I)
    return s.strip()


def strip_index(s: str) -> str:
    s = re.sub(r"^[\s—\-\.0-9]+", "", s)
    return s.lstrip(". ").strip()


def parse_line(line: str) -> tuple[str, str, str, float, float, str] | None:
    line = normalize_line(line)
    if not line or line.startswith("—") or line.startswith("-" * 5):
        return None
    if not re.search(r"\d+\.\d+", line):
        return None
    line = strip_index(line)
    m = TAIL_RE.search(line)
    if not m:
        return None
    lat = float(m.group("lat"))
    lng = float(m.group("lng"))
    hours = m.group("hours").strip()
    prefix = line[: m.start()]
    parts = [p.strip() for p in prefix.split(",") if p.strip() != ""]
    if len(parts) < 2:
        return None
    name = parts[0].strip()
    state = parts[-1].strip()
    address = ", ".join(parts[1:-1]).strip() if len(parts) > 2 else ""
    if not name or not state or not address:
        return None
    if len(name) > 200:
        name = name[:200]
    if len(address) > 400:
        address = address[:400]
    if len(state) > 80:
        state = state[:80]
    if len(hours) > 200:
        hours = hours[:200]
    return name, address, state, lat, lng, hours


def sql_str(s: str) -> str:
    return "N'" + s.replace("'", "''") + "'"


def main() -> int:
    if not RAW_PATH.is_file():
        print(f"Missing {RAW_PATH}; create it with your pasted lines.", file=sys.stderr)
        return 1
    raw = RAW_PATH.read_text(encoding="utf-8")
    rows: list[tuple[str, str, str, float, float, str]] = []
    bad: list[str] = []
    for i, line in enumerate(raw.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            p = parse_line(line)
        except Exception:
            p = None
        if p is None:
            if re.search(r"\d+\.", line[:20]) or re.match(r"^[\d—]", line):
                bad.append(f"line {i}: {line[:120]}")
            continue
        rows.append(p)

    if not rows:
        print("No rows parsed.", file=sys.stderr)
        return 1

    values = ",\n    ".join(
        f"({sql_str(n)}, {sql_str(a)}, {sql_str(st)}, {lat}, {lng}, {sql_str(h)})" for n, a, st, lat, lng, h in rows
    )

    sql = f"""/*
  Auto-generated from branches_paste_raw.txt — {len(rows)} branches.
  Run against QMS. BranchCode = MAX(existing)+row (empty DB starts at 101001).
  Service window defaults: 09:30–16:00 local → ServiceDayStartMinutes=570, ServiceDayEndMinutes=960.
  After insert, run insert-service-types-all-branches.sql if you need SERVICES rows.

  Manual fix: Sungai Jarom (236) had no coordinates in the source paste — approximate lat/lng were
  inserted in branches_paste_raw.txt; replace with surveyed values if required.
*/

USE QMS;
GO

DECLARE @Branches TABLE (
    RowOrd        INT IDENTITY(1, 1) PRIMARY KEY,
    [Name]        NVARCHAR(200) NOT NULL,
    [Address]     NVARCHAR(400) NOT NULL,
    [State]       NVARCHAR(80) NOT NULL,
    [Latitude]    FLOAT NOT NULL,
    [Longitude]   FLOAT NOT NULL,
    [OperatingHours] NVARCHAR(200) NULL
);

INSERT INTO @Branches ([Name], [Address], [State], [Latitude], [Longitude], [OperatingHours])
VALUES
    {values};

DECLARE @Base INT =
    (SELECT ISNULL(MAX([BranchCode]), 101000) FROM [dbo].[BRANCHES]);

INSERT INTO [dbo].[BRANCHES] (
    [Id],
    [BranchCode],
    [Name],
    [Address],
    [State],
    [Latitude],
    [Longitude],
    [OnlineQuotaPercent],
    [SlotDurationMinutes],
    [GeofenceMeters],
    [ServiceDayStartMinutes],
    [ServiceDayEndMinutes],
    [ServiceZoneOffsetMinutes],
    [OpeningStatus],
    [OperatingHours],
    [ImageUrl],
    [MaxCapacity],
    [AdaptiveSlotCapacityEnabled],
    [MinSlotTotalCapacity]
)
SELECT
    NEWID() AS [Id],
    @Base + b.[RowOrd] AS [BranchCode],
    b.[Name],
    b.[Address],
    b.[State],
    b.[Latitude],
    b.[Longitude],
    70 AS [OnlineQuotaPercent],
    30 AS [SlotDurationMinutes],
    80 AS [GeofenceMeters],
    570 AS [ServiceDayStartMinutes],
    960 AS [ServiceDayEndMinutes],
    480 AS [ServiceZoneOffsetMinutes],
    0 AS [OpeningStatus],
    b.[OperatingHours],
    CAST(NULL AS NVARCHAR(800)) AS [ImageUrl],
    CAST(NULL AS INT) AS [MaxCapacity],
    CAST(1 AS BIT) AS [AdaptiveSlotCapacityEnabled],
    CAST(NULL AS INT) AS [MinSlotTotalCapacity]
FROM @Branches AS b
ORDER BY b.[RowOrd];

SELECT [BranchCode], [Name], [Id] FROM [dbo].[BRANCHES] WHERE [BranchCode] > @Base ORDER BY [BranchCode];
GO
"""
    OUT_PATH.write_text(sql, encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(rows)} rows).")
    if bad:
        print("Skipped / unparsed lines (review branches_paste_raw.txt):", file=sys.stderr)
        for b in bad[:40]:
            print("  ", b, file=sys.stderr)
        if len(bad) > 40:
            print(f"  ... and {len(bad) - 40} more", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
