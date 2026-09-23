import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
const geo = JSON.parse(readFileSync(new URL("../data/geo/astana_districts.geojson", import.meta.url), "utf8"));

it("preserves the five local district geometries and the OSM Almaty boundary", () => {
  expect(geo.type).toBe("FeatureCollection");
  expect(geo.features.map(f => f.properties.id).sort()).toEqual(["almaty", "baikonur", "nura", "saryarka", "yesil"]);
  for (const feature of geo.features) {
    expect(feature.geometry.type).toBe("MultiPolygon");
    for (const polygon of feature.geometry.coordinates) {
      for (const ring of polygon) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring.at(-1));
      }
    }
  }
  const almaty = geo.features.find(f => f.properties.id === "almaty");
  expect(almaty.properties).toMatchObject({ name: "Алматы", schematic: false, source: "OpenStreetMap", osm_relation: 3482819 });
});
