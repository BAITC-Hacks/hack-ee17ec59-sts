"use client";

import { useState } from "react";
import { DISTRICTS } from "@/lib/simulation";
import type { DistrictId } from "@/lib/simulation";
import { DISTRICT_GEOMETRY } from "./districtGeometry";

type DistrictMapProps = {
  values?: Partial<Record<DistrictId, number>>;
  selectedDistrictId?: DistrictId;
  highlightedDistrictIds?: readonly DistrictId[];
  disabledDistrictReasons?: Partial<Record<DistrictId, string>>;
  onDistrictClick?: (id: DistrictId) => void;
};

const WIDTH = 640;
const PADDING = 24;
const coordinates = DISTRICT_GEOMETRY.flatMap((feature) => feature.coordinates.flat(2));
const longitudes = coordinates.map(([longitude]) => longitude);
const latitudes = coordinates.map(([, latitude]) => latitude);
const west = Math.min(...longitudes);
const east = Math.max(...longitudes);
const south = Math.min(...latitudes);
const north = Math.max(...latitudes);
const longitudeFactor = Math.cos(((north + south) / 2) * Math.PI / 180);
const longitudeSpan = (east - west) * longitudeFactor;
const latitudeSpan = north - south;
const scale = (WIDTH - PADDING * 2) / longitudeSpan;
const HEIGHT = Math.ceil(latitudeSpan * scale + PADDING * 2);

function project([longitude, latitude]: readonly [number, number]): [number, number] {
  return [
    PADDING + (longitude - west) * longitudeFactor * scale,
    PADDING + (north - latitude) * scale,
  ];
}

const shapes = DISTRICTS.map((district) => {
  const geometry = DISTRICT_GEOMETRY.find((feature) => feature.id === district.id);
  if (!geometry) throw new Error(`Нет геометрии для района ${district.id}`);
  const path = geometry.coordinates.map((polygon) => polygon.map((ring) =>
    ring.map((point, index) => {
      const [x, y] = project(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ") + " Z",
  ).join(" ")).join(" ");
  return { ...district, path, centroid: project(geometry.centroid), schematic: geometry.schematic };
});

function fillFor(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "#cbd5e1";
  const bounded = Math.max(0, Math.min(100, value));
  return `hsl(${(bounded * 1.35).toFixed(1)} 68% 45%)`;
}

export function DistrictMap({
  values,
  selectedDistrictId,
  highlightedDistrictIds = [],
  disabledDistrictReasons = {},
  onDistrictClick,
}: DistrictMapProps) {
  const [hoveredDistrictId, setHoveredDistrictId] = useState<DistrictId | null>(null);
  const hovered = shapes.find((district) => district.id === hoveredDistrictId);
  const schematicDistricts = shapes.filter((district) => district.schematic);

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-5">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full"
        role="group"
        aria-label="Карта районов Астаны"
      >
        {shapes.map((district) => {
          const value = values?.[district.id];
          const reason = disabledDistrictReasons[district.id];
          const selected = selectedDistrictId === district.id;
          const highlighted = highlightedDistrictIds.includes(district.id);
          const focused = hoveredDistrictId === district.id;
          const description = `${district.name}: ${value === undefined ? "нет данных" : `D ${value.toFixed(2)}`}${reason ? `. Недоступно: ${reason}` : ""}${district.schematic ? ". Граница схематичная" : ""}`;

          return (
            <g key={district.id}>
              <path
                d={district.path}
                fill={fillFor(value)}
                fillRule="evenodd"
                stroke={reason ? "#be123c" : selected ? "#1d4ed8" : highlighted ? "#d97706" : "#ffffff"}
                strokeWidth={focused ? 5 : selected || highlighted || reason ? 3 : 1.5}
                strokeDasharray={district.schematic ? "6 4" : undefined}
                className={`${reason ? "cursor-not-allowed" : onDistrictClick ? "cursor-pointer" : "cursor-default"} focus:outline-none`}
                role={onDistrictClick ? "button" : "img"}
                tabIndex={0}
                aria-label={description}
                aria-disabled={Boolean(reason) || undefined}
                onMouseEnter={() => setHoveredDistrictId(district.id)}
                onMouseLeave={() => setHoveredDistrictId(null)}
                onFocus={() => setHoveredDistrictId(district.id)}
                onBlur={() => setHoveredDistrictId(null)}
                onClick={() => { if (!reason) onDistrictClick?.(district.id); }}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && !reason) {
                    event.preventDefault();
                    onDistrictClick?.(district.id);
                  }
                }}
              >
                <title>{description}</title>
              </path>
              <text
                x={district.centroid[0]}
                y={district.centroid[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
                className="fill-slate-950 text-[18px] font-semibold"
                paintOrder="stroke"
                stroke="white"
                strokeWidth="3"
                strokeLinejoin="round"
              >
                {district.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex items-center gap-3 text-xs text-slate-600">
        <span>0</span>
        <div
          className="h-2.5 flex-1 rounded-full"
          style={{ background: "linear-gradient(90deg, hsl(0 68% 45%), hsl(67.5 68% 45%), hsl(135 68% 45%))" }}
          aria-label="Шкала значений от 0 до 100"
        />
        <span>100</span>
      </div>
      <p className="mt-2 min-h-5 text-sm text-slate-700" aria-live="polite">
        {hovered
          ? `${hovered.name}: ${values?.[hovered.id] === undefined ? "нет данных" : `D ${values[hovered.id]?.toFixed(2)}`}${disabledDistrictReasons[hovered.id] ? ` · ${disabledDistrictReasons[hovered.id]}` : ""}`
          : "Наведите на район или выберите его с клавиатуры."}
      </p>
      {schematicDistricts.length > 0 && (
        <p className="mt-2 text-xs leading-5 text-amber-800">
          Граница района {schematicDistricts.map((district) => district.name).join(", ")} показана схематично и не является административной границей.
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Границы: <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors, ODbL 1.0</a>.
      </p>
    </div>
  );
}
