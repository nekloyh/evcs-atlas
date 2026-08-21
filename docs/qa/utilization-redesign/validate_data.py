"""Đối chiếu độc lập semantics Sử dụng trên ba package thật đang ship."""

from __future__ import annotations

import json
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).parents[3]
OUT = Path(__file__).parent / "data-validation.json"


def validate(code: str) -> dict:
    base = ROOT / "web/public/data/p" / code
    manifest = json.loads((base / "manifest.json").read_text())
    stations = pq.read_table(
        base / "stations.parquet",
        columns=["station_id", "station_code", "scope", "n_ports", "h3_r8", "lat", "lng"],
    ).to_pylist()
    profile = pq.read_table(
        base / "station_occupancy_profile_168h.parquet",
        columns=["station_code", "dow", "hour", "occ", "observed_h"],
    ).to_pylist()
    by_code = {s["station_code"]: s for s in stations}
    in_rows = [s for s in stations if s["scope"] == "IN"]
    all_ports = sum(s["n_ports"] for s in in_rows if s["n_ports"] is not None and s["n_ports"] > 0)
    buckets = [dict(busy=0.0, ports=0, stations=set(), observed_port_hours=0.0) for _ in range(168)]
    station_hours = 0
    known_zero = None
    rejected_observed = 0
    rejected_missing_ports = 0
    buffer_rows = 0
    for row in profile:
        station = by_code.get(row["station_code"])
        if not station:
            continue
        if station["scope"] != "IN":
            buffer_rows += 1
            continue
        t = int(row["dow"]) * 24 + int(row["hour"])
        ports = station["n_ports"]
        observed = row["observed_h"]
        if ports is None or ports <= 0:
            rejected_missing_ports += 1
            continue
        if observed is not None:
            buckets[t]["observed_port_hours"] += float(observed) * ports
        if observed is None or observed < 1:
            rejected_observed += 1
            continue
        occ = row["occ"]
        if occ is None:
            continue
        b = buckets[t]
        b["busy"] += float(occ)
        b["ports"] += ports
        b["stations"].add(row["station_code"])
        station_hours += 1
        if float(occ) == 0 and known_zero is None:
            known_zero = {"station_id": station["station_id"], "t": t, "h3_r8": station["h3_r8"]}
    values = [b["busy"] / b["ports"] if b["ports"] else None for b in buckets]
    valid = [(t, v) for t, v in enumerate(values) if v is not None]
    peak_t, peak = max(valid, key=lambda x: x[1]) if valid else (None, None)
    trough_t, trough = min(valid, key=lambda x: x[1]) if valid else (None, None)
    missing_t = min(range(168), key=lambda t: len(buckets[t]["stations"]))
    unusable = next((x for x in manifest.get("unusable_layers", []) if x.get("layer") == "occupancy"), None)
    return {
        "package": code,
        "occupancy_usable": unusable is None,
        "disabled_reason": unusable.get("reason") if unusable else None,
        "timezone": manifest.get("snapshots", {}).get("occupancy_hour_tz"),
        "in_stations": len(in_rows),
        "installed_ports_known": all_ports,
        "stations_missing_ports": sum(s["n_ports"] is None or s["n_ports"] <= 0 for s in in_rows),
        "eligible_station_hours": station_hours,
        "rejected_observed_floor": rejected_observed,
        "rejected_missing_ports": rejected_missing_ports,
        "buffer_profile_rows_excluded": buffer_rows,
        "valid_aggregate_hours": len(valid),
        "peak": {"t": peak_t, "ratio": peak},
        "trough": {"t": trough_t, "ratio": trough},
        "missing_heavy": {
            "t": missing_t,
            "contributing_stations": len(buckets[missing_t]["stations"]),
            "observed_ports": buckets[missing_t]["ports"],
            "port_coverage": buckets[missing_t]["ports"] / all_ports if all_ports else None,
        },
        "known_zero_station_hour": known_zero,
    }


result = {"method": "IN + n_ports>0 + observed_h>=1 + finite occ; aggregate=sum(occ)/sum(n_ports)",
          "packages": [validate(code) for code in ("01", "68", "11")]}
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(result, ensure_ascii=False, indent=2))
