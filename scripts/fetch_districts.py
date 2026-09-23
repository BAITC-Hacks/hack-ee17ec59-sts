"""One-off OSM download: pip install shapely; python scripts/fetch_districts.py.

Shapely is used only for download-time geometry checks, never by the app.
No keys required. Existing output is replaced only after all five features pass.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

import httpx
from shapely.geometry import Polygon, MultiPolygon, mapping
from shapely.geometry.polygon import orient
from shapely.validation import explain_validity

ROOT = Path(__file__).resolve().parents[1]
ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
# Approximate display centres, explicitly not surveyed administrative centroids.
DISTRICTS = {
    "yesil": ("Есиль", (71.43, 51.105), ("есил", "есіл", "yesil", "esil")),
    "almaty": ("Алматы", (71.51, 51.145), ("алмат", "almat")),
    "saryarka": ("Сарыарка", (71.39, 51.19), ("сарыар", "saryar")),
    "baikonur": ("Байконур", (71.465, 51.205), ("байкон", "байқоң", "baikon", "baykon")),
    "nura": ("Нура", (71.345, 51.12), ("нура", "нұра", "nura")),
}
QUERY = '[out:json][timeout:25];rel[boundary=administrative](50.95,71.0,51.4,71.8);out tags center;'


def query_overpass(query):
    errors = []
    for endpoint in ENDPOINTS:
        try:
            response = httpx.get(endpoint, params={"data": query}, timeout=40,
                                 headers={"User-Agent": "Akim5-district-export/1.0"})
            response.raise_for_status()
            payload = response.json()
            if payload.get("remark"):
                raise ValueError(payload["remark"])
            return payload["elements"], endpoint
        except (httpx.HTTPError, ValueError, KeyError) as error:
            errors.append(f"{endpoint}: {error}")
            print(errors[-1], file=sys.stderr)
    raise RuntimeError("; ".join(errors))


def stitch(segments):
    """Join relation member ways by endpoints, including reversed ways."""
    pending = [list(segment) for segment in segments]
    rings = []
    while pending:
        ring = pending.pop()
        while ring[-1] != ring[0]:
            for index, segment in enumerate(pending):
                if segment[0] == ring[-1]:
                    ring.extend(segment[1:])
                elif segment[-1] == ring[-1]:
                    ring.extend(segment[-2::-1])
                else:
                    continue
                pending.pop(index)
                break
            else:
                raise ValueError("Unclosed boundary ways")
        if len(ring) < 4:
            raise ValueError("Degenerate ring")
        rings.append(ring)
    return rings


def relation_polygon(relation):
    segments = {"outer": [], "inner": []}
    for member in relation.get("members", []):
        role = member.get("role") or "outer"
        if role not in segments or member["type"] == "node":
            continue
        if member["type"] != "way" or not member.get("geometry"):
            raise ValueError("Unsupported or incomplete boundary member")
        segments[role].append([(p["lon"], p["lat"]) for p in member["geometry"]])
    outers = stitch(segments["outer"])
    holes = stitch(segments["inner"])
    polygons = []
    assigned = 0
    for outer in outers:
        shell = Polygon(outer)
        inside = [hole for hole in holes if shell.covers(Polygon(hole))]
        assigned += len(inside)
        polygons.append(Polygon(outer, inside))
    if assigned != len(holes):
        raise ValueError("Unassigned inner rings")
    shape = MultiPolygon(polygons)
    if not shape.is_valid or shape.is_empty:
        raise ValueError(explain_validity(shape))
    west, south, east, north = shape.bounds
    if not (70.8 < west < east < 72.1 and 50.7 < south < north < 51.7):
        raise ValueError("Boundary outside Astana bounds")
    if not 0.0001 < shape.area < 0.5:
        raise ValueError("Implausible district area")
    return MultiPolygon([orient(polygon, sign=1.0) for polygon in shape.geoms])


def schematic(district_id):
    lon, lat = DISTRICTS[district_id][1]
    return MultiPolygon([Polygon([
        (lon - .024, lat - .015), (lon + .024, lat - .015),
        (lon + .024, lat + .015), (lon - .024, lat + .015),
        (lon - .024, lat - .015),
    ])])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=ROOT / "data/geo/astana_districts.geojson")
    args = parser.parse_args()
    names, candidates, errors = [], {}, {}
    endpoint = None
    try:
        relations, endpoint = query_overpass(QUERY)
        for relation in relations:
            tags = relation.get("tags", {})
            name = tags.get("name:ru", tags.get("name", ""))
            level = tags.get("admin_level")
            names.append({"name": name, "admin_level": level, "relation": relation["id"]})
            print(f"Found: {name} | admin_level={level} | relation={relation['id']}")
            # Discover the district level from named relations, not a hardcoded 8/9.
            if level is None or int(level) <= 4:
                continue
            all_names = " ".join(v.lower() for k, v in tags.items()
                                 if k == "name" or k.startswith("name:"))
            for district_id, (_, _, aliases) in DISTRICTS.items():
                if any(alias in all_names for alias in aliases):
                    candidates.setdefault(district_id, []).append(relation)
    except (RuntimeError, ValueError) as error:
        errors["discovery"] = str(error)
    levels = Counter(r["tags"]["admin_level"] for rs in candidates.values() for r in rs)
    level = levels.most_common(1)[0][0] if levels else None
    print(f"District admin_level: {level or 'not verified (Overpass unavailable/no matches)'}")
    shapes, sources = {}, {}
    for district_id in DISTRICTS:
        matches = [r for r in candidates.get(district_id, []) if r["tags"]["admin_level"] == level]
        try:
            if len(matches) != 1:
                raise ValueError(f"Expected one relation at admin_level={level}; found {len(matches)}")
            relation_id = matches[0]["id"]
            geometry, endpoint = query_overpass(f'[out:json][timeout:25];rel({relation_id});out geom;')
            shapes[district_id] = relation_polygon(next(r for r in geometry if r["id"] == relation_id))
            sources[district_id] = relation_id
        except (RuntimeError, ValueError, StopIteration) as error:
            errors[district_id] = str(error)
    # Administrative interiors should not overlap; do not silently repair OSM data.
    for i, a in enumerate(list(shapes)):
        for b in list(shapes)[i + 1:]:
            if shapes[a].intersection(shapes[b]).area > 1e-7:
                errors[a] = errors[b] = "Overlapping district interiors"
    features = []
    for district_id, (name, _, _) in DISTRICTS.items():
        fallback = district_id not in shapes or district_id in errors
        shape = schematic(district_id) if fallback else shapes[district_id]
        if fallback:
            print(f"FALLBACK {name}: {errors.get(district_id)}", file=sys.stderr)
        centroid = shape.centroid
        features.append({"type": "Feature", "properties": {
            "id": district_id, "name": name, "schematic": fallback,
            "source": "schematic" if fallback else "OpenStreetMap",
            "osm_relation": None if fallback else sources[district_id],
            "admin_level": None if fallback else level,
            "centroid": [centroid.x, centroid.y],
        }, "geometry": mapping(shape)})
    output = {"type": "FeatureCollection", "features": features,
              "metadata": {"fetched_at": datetime.now(timezone.utc).isoformat(),
                           "endpoint": endpoint, "query": QUERY, "found": names,
                           "admin_level": level, "errors": errors,
                           "attribution": "© OpenStreetMap contributors; ODbL 1.0",
                           "license_url": "https://www.openstreetmap.org/copyright"}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(features)} districts to {args.output}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    main()
