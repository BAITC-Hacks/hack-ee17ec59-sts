import { DISTRICT_GEOMETRY, type DistrictGeometry } from "./districtGeometry";

// A display-only outline. Its west and north edges follow the saved OSM
// boundaries of Yesil and Baikonur; the eastern edge remains schematic.
const baikonur = DISTRICT_GEOMETRY.find((district) => district.id === "baikonur");
const yesil = DISTRICT_GEOMETRY.find((district) => district.id === "yesil");
const baikonurRing = baikonur?.coordinates[2]?.[0];
const yesilRing = yesil?.coordinates[0]?.[0];

if (!baikonurRing || !yesilRing) {
  throw new Error("Нет соседних границ для схематичного района Алматы");
}

const baikonurBoundary = baikonurRing.slice(47, 151);
const yesilBoundary = yesilRing.slice(215, 292);

if (baikonurBoundary.length !== 104 || yesilBoundary.length !== 77) {
  throw new Error("Границы соседних районов изменились: проверьте полигон Алматы");
}

const easternOutline: [number, number][] = [
  [71.533, 51.174],
  [71.541, 51.169],
  [71.552, 51.168],
  [71.563, 51.161],
  [71.566, 51.149],
  [71.56, 51.137],
  [71.549, 51.131],
  [71.535, 51.128],
  [71.536, 51.116],
  [71.526, 51.109],
  [71.509, 51.106],
];

export const SCHEMATIC_ALMATY: DistrictGeometry = {
  id: "almaty",
  schematic: true,
  centroid: [71.51, 51.145],
  coordinates: [[[
    ...baikonurBoundary,
    ...easternOutline,
    ...yesilBoundary,
    baikonurBoundary[0],
  ]]],
};
