"""District map. All simulation values come exclusively from engine.interface."""

from html import escape
import json
import math
from pathlib import Path

import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from engine import interface

GEOJSON_PATH = Path(__file__).resolve().parents[1] / "data/geo/astana_districts.geojson"
LAYERS = ("Изменение D района", "D после решений", "Критичные показатели (кол-во < 40)")
DELTA_COLORS = [[0, "#b2182b"], [.5, "#d1d5db"], [1, "#216e4e"]]


def _number(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def _fmt(value):
    return f"{value:.2f}" if _number(value) else "нет данных"


def _district_rows(result, catalogue, scenario, geojson):
    measures = {m["id"]: m for m in catalogue["measures"]}
    expected = {d["id"]: set(d["I"]) for d in catalogue["districts"]}
    local = {f["properties"]["id"]: [] for f in geojson["features"]}
    city = []
    for decision in scenario:
        measure = measures.get(decision.get("id"), {})
        if measure.get("scope") == "city":
            city.append(measure["id"])
        elif measure.get("scope") == "district" and decision.get("district") in local:
            local[decision["district"]].append(measure["id"])
    rows, declines = [], []
    for feature in geojson["features"]:
        props = feature["properties"]
        district_id = props["id"]
        values = result.get("districts", {}).get(district_id, {})
        before, after = values.get("before", {}), values.get("after", {})
        changes = [(key, after[key] - before[key]) for key in before.keys() & after.keys()
                   if _number(before[key]) and _number(after[key])]
        top = sorted((item for item in changes if item[1] != 0), key=lambda item: (-abs(item[1]), item[0]))[:3]
        for key, delta in changes:
            if delta < 0:
                declines.append({"Район": props["name"], "Показатель": key,
                                 "До": before[key], "После": after[key], "Δ": delta})
        complete = expected.get(district_id, set()).issubset(
            {key for key, value in after.items() if _number(value)})
        d_before, d_after = values.get("D_before"), values.get("D_after")
        delta = d_after - d_before if _number(d_before) and _number(d_after) else None
        critical = sum(value < 40 for value in after.values() if _number(value)) if complete else None
        top_text = "; ".join(f"{escape(key)}: {change:+.2f}" for key, change in top)
        if not top_text:
            top_text = "без изменений" if complete and changes else "нет данных"
        applied = local[district_id] + city
        hover = f"<b>{escape(props['name'])}</b><br>D: {_fmt(d_before)} → {_fmt(d_after)}<br>"
        hover += f"Δ D: {delta:+.2f}<br>" if delta is not None else "Δ D: нет данных<br>"
        hover += f"Топ-3 изменений: {top_text}<br>Меры: {', '.join(applied) or 'нет'}"
        if not complete:
            hover += "<br>Движок вернул неполные показатели"
        rows.append({"id": district_id, "name": props["name"], "delta": delta,
                     "after": d_after if _number(d_after) else None, "critical": critical,
                     "hover": hover, "local": local[district_id], "complete": complete,
                     "centroid": props["centroid"]})
    return rows, list(dict.fromkeys(city)), declines


def _build_figure(rows, geojson, layer, weakest):
    # Neutral base keeps districts visible when the engine response is partial.
    figure = go.Figure(go.Choroplethmap(
        geojson=geojson, locations=[r["id"] for r in rows], featureidkey="properties.id",
        z=[0] * len(rows), colorscale=[[0, "#d1d5db"], [1, "#d1d5db"]],
        showscale=False, marker_opacity=.8, marker_line_width=1,
        text=[r["hover"] for r in rows], hovertemplate="%{text}<extra></extra>",
        name="Районы",
    ))
    metric = dict(zip(LAYERS, ("delta", "after", "critical")))[layer]
    available = [r for r in rows if _number(r[metric])]
    if available:
        limit = max(1, max(abs(r[metric]) for r in available))
        scale = DELTA_COLORS if metric == "delta" else "YlOrRd" if metric == "critical" else "Viridis"
        bounds = (-limit, limit) if metric == "delta" else (0, 10) if metric == "critical" else (0, 100)
        colored = px.choropleth_map(
            available, geojson=geojson, locations="id", featureidkey="properties.id",
            color=metric, color_continuous_scale=scale, range_color=bounds,
            custom_data=["hover"], map_style="open-street-map", opacity=.82,
        )
        colored.update_traces(hovertemplate="%{customdata[0]}<extra></extra>")
        figure.add_traces(colored.data)
        figure.update_layout(coloraxis=colored.layout.coloraxis)
        figure.update_coloraxes(colorbar_title=layer)
    for row in rows:
        lon, lat = row["centroid"]
        labels = [row["name"]]
        if row["id"] == weakest:
            labels.append("тянет 30% Score")
            feature = next(f for f in geojson["features"] if f["properties"]["id"] == weakest)
            geom = feature["geometry"]
            polygons = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
            for polygon in polygons:
                for ring in polygon:
                    figure.add_trace(go.Scattermap(lon=[p[0] for p in ring], lat=[p[1] for p in ring],
                                                  mode="lines", line={"width": 5, "color": "#111827"},
                                                  hoverinfo="skip", showlegend=False, name="Слабейший район"))
        if not row["local"]:
            labels.append("только городские эффекты")
        if not row["complete"]:
            labels.append("неполные данные")
        figure.add_trace(go.Scattermap(lon=[lon], lat=[lat], mode="text",
                                      text=["<br>".join(labels)], textposition="top center",
                                      textfont={"size": 12, "color": "#111827"},
                                      hoverinfo="skip", showlegend=False, name=row["name"]))
        count = len(row["local"])
        for index, measure_id in enumerate(row["local"]):
            angle = 2 * math.pi * index / max(1, count)
            radius = .006 if count > 1 else 0
            figure.add_trace(go.Scattermap(
                lon=[lon + radius * math.cos(angle) / math.cos(math.radians(lat))],
                lat=[lat + radius * math.sin(angle)], mode="markers+text", text=[measure_id],
                textposition="bottom center", marker={"size": 14, "color": "#172554"},
                hovertemplate=f"{measure_id} · {escape(row['name'])}<extra></extra>",
                name=measure_id, showlegend=False,
            ))
    figure.update_layout(map={"style": "open-street-map", "center": {"lon": 71.43, "lat": 51.15}, "zoom": 10},
                         height=650, margin={"l": 0, "r": 0, "t": 10, "b": 0}, uirevision="astana-districts")
    return figure


def render_map(scenario):
    """Render a list of {id, district} decisions; return the figure for integration/tests.

    No Overpass requests are made here. OSM background tiles load in the browser.
    Missing engine values stay unknown; this module never calculates D or Score.
    """
    scenario = list(scenario or [])
    catalogue = interface.load_data()
    result = interface.evaluate(scenario)
    if not result.get("valid", True):
        st.error("; ".join(result.get("errors", [])) or "Сценарий не прошёл проверку")
        return None
    geojson = json.loads(GEOJSON_PATH.read_text(encoding="utf-8"))
    layer = st.radio("Слой карты", LAYERS, key="district_map_layer")
    rows, city, declines = _district_rows(result, catalogue, scenario, geojson)
    if city:
        st.info("На весь город: " + ", ".join(city))
    if any(f["properties"].get("schematic") for f in geojson["features"]):
        st.warning("Границы схематичные: полигоны показывают расположение районов, а не административные границы.")
    if any(not row["complete"] or row["after"] is None for row in rows):
        st.caption("Движок вернул неполные данные. Отсутствующие значения не рассчитываются и не считаются нулевыми; серые районы могут означать отсутствие данных.")
    known = [r for r in rows if r["after"] is not None]
    weakest = min(known, key=lambda r: r["after"])["id"] if len(known) == len(rows) else result.get("min_district")
    figure = _build_figure(rows, geojson, layer, weakest)
    st.plotly_chart(figure, width="stretch", key="district_map")
    st.caption("© OpenStreetMap contributors · ODbL. Границы читаются локально; подложке OpenStreetMap нужен интернет.")
    st.subheader("Что ухудшилось")
    if declines:
        st.dataframe(sorted(declines, key=lambda row: row["Δ"]), hide_index=True, width="stretch")
    else:
        st.write("В доступных результатах отрицательных изменений нет.")
    return figure
