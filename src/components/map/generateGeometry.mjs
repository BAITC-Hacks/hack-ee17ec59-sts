import { readFileSync, writeFileSync } from "node:fs";

const source = new URL("../../../data/geo/astana_districts.geojson", import.meta.url);
const destination = new URL("./districtGeometry.ts", import.meta.url);
const geojson = JSON.parse(readFileSync(source, "utf8"));

const features = geojson.features.map((feature) => ({
  id: feature.properties.id,
  schematic: feature.properties.schematic,
  centroid: feature.properties.centroid,
  coordinates: feature.geometry.coordinates.map((polygon) =>
    polygon.map((ring) => ring.map(([longitude, latitude]) => [
      Number(longitude.toFixed(6)),
      Number(latitude.toFixed(6)),
    ])),
  ),
}));

const output = `// Generated from data/geo/astana_districts.geojson. Run node src/components/map/generateGeometry.mjs to refresh.\n` +
  `import type { DistrictId } from "@/lib/simulation";\n\n` +
  `export type DistrictGeometry = {\n` +
  `  id: DistrictId;\n` +
  `  schematic: boolean;\n` +
  `  centroid: [number, number];\n` +
  `  coordinates: [number, number][][][];\n` +
  `};\n\n` +
  `export const DISTRICT_GEOMETRY: DistrictGeometry[] = ${JSON.stringify(features)};\n`;

writeFileSync(destination, output, "utf8");
