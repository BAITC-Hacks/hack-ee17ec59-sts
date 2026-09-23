"""Map contract, offline rendering and user-visible layer behaviour."""

import copy
import json
import math
import socket

import pytest
from streamlit.testing.v1 import AppTest

from app import map_view
from engine import interface

IDS = {"yesil", "almaty", "saryarka", "baikonur", "nura"}
EXAMPLE = [{"id": "M7", "district": "nura"}, {"id": "M11", "district": "nura"},
           {"id": "M12", "district": None}, {"id": "M14", "district": None}]


def geojson():
    return json.loads(map_view.GEOJSON_PATH.read_text(encoding="utf-8"))


def test_map_geojson_has_five_closed_districts():
    document = geojson()
    assert document["type"] == "FeatureCollection"
    assert len(document["features"]) == 5
    assert {f["properties"]["id"] for f in document["features"]} == IDS
    for feature in document["features"]:
        props, geometry = feature["properties"], feature["geometry"]
        assert geometry["type"] in {"Polygon", "MultiPolygon"}
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        assert polygons
        for polygon in polygons:
            assert polygon
            for ring in polygon:
                assert len(ring) >= 4 and ring[0] == ring[-1]
                assert all(math.isfinite(lon) and math.isfinite(lat) and
                           70.8 < lon < 72.1 and 50.7 < lat < 51.7 for lon, lat in ring)
        assert len(props["centroid"]) == 2
        assert props["schematic"] or (props["admin_level"] == "6" and props["osm_relation"])


@pytest.mark.parametrize("scenario", [[], EXAMPLE])
def test_map_render_empty_and_example_offline(scenario, monkeypatch, tmp_path):
    def no_network(*args, **kwargs):
        raise AssertionError("Map rendering must not fetch data")

    original_connect = socket.socket.connect

    def local_connect(sock, address):
        # Windows asyncio creates a loopback socket pair for its event loop.
        if isinstance(address, tuple) and address[0] in {"127.0.0.1", "::1"}:
            return original_connect(sock, address)
        return no_network()

    monkeypatch.setattr(socket, "create_connection", no_network)
    monkeypatch.setattr(socket.socket, "connect", local_connect)
    monkeypatch.chdir(tmp_path)
    app = AppTest.from_string(
        f"from app.map_view import render_map\nrender_map({scenario!r})"
    ).run(timeout=20)
    assert not app.exception
    assert len(app.get("plotly_chart")) == 1
    assert app.subheader[0].value == "Что ухудшилось"
    if scenario:
        assert app.info[0].value == "На весь город: M12, M14"
    # The current engine fixture is deliberately incomplete, not an all-zero map.
    assert any("неполные данные" in caption.value for caption in app.caption)
    for layer in map_view.LAYERS:
        app.radio[0].set_value(layer).run(timeout=20)
        assert not app.exception
        figure = json.loads(app.get("plotly_chart")[0].proto.spec)
        assert figure["layout"]["map"]["style"] == "open-street-map"
        assert set(figure["data"][0]["locations"]) == IDS


@pytest.fixture
def full_result():
    districts = {}
    for district in interface.load_data()["districts"]:
        before = copy.deepcopy(district["I"])
        after = copy.deepcopy(before)
        if district["id"] == "nura":
            after.update(T1=before["T1"] - 2, S1=before["S1"] + 10, S2=before["S2"] + 5)
        districts[district["id"]] = {"before": before, "after": after,
                                     "D_before": 50, "D_after": 45 if district["id"] == "nura" else 60}
    return {"valid": True, "districts": districts, "min_district": "nura"}


def test_map_full_layers_declines_hover_and_markers(full_result, monkeypatch):
    monkeypatch.setattr(interface, "evaluate", lambda scenario: full_result)
    app = AppTest.from_string(
        f"from app.map_view import render_map\nrender_map({EXAMPLE!r})"
    ).run(timeout=20)
    assert not app.exception
    assert app.dataframe[0].value.iloc[0]["Показатель"] == "T1"
    assert app.dataframe[0].value.iloc[0]["Δ"] == -2
    figure = json.loads(app.get("plotly_chart")[0].proto.spec)
    axis = figure["layout"]["coloraxis"]
    assert axis["cmin"] == -axis["cmax"]
    assert axis["colorscale"][1] == [0.5, "#d1d5db"]
    traces = figure["data"]
    markers = [t for t in traces if t.get("mode") == "markers+text"]
    assert {t["name"] for t in markers} == {"M7", "M11"}
    assert markers[0]["lon"] != markers[1]["lon"]
    assert any(t.get("line", {}).get("width") == 5 for t in traces)
    labels = " ".join(str(t.get("text", "")) for t in traces)
    assert "тянет 30% Score" in labels
    assert "только городские эффекты" in labels
    assert "T1: -2.00" in labels
    assert "M7, M11, M12, M14" in labels
    for layer in map_view.LAYERS[1:]:
        app.radio[0].set_value(layer).run(timeout=20)
        assert not app.exception


def test_map_missing_values_are_not_zero():
    rows, _, _ = map_view._district_rows(interface.evaluate([]), interface.load_data(), [], geojson())
    yesil = next(row for row in rows if row["id"] == "yesil")
    assert yesil["after"] is None and yesil["delta"] is None
    assert all(row["critical"] is None for row in rows)


def test_map_invalid_scenario_displays_engine_errors(monkeypatch):
    monkeypatch.setattr(interface, "evaluate", lambda scenario: {"valid": False, "errors": ["Бюджет превышен"]})
    app = AppTest.from_string("from app.map_view import render_map\nrender_map([])").run(timeout=20)
    assert not app.exception
    assert app.error[0].value == "Бюджет превышен"
    assert not app.get("plotly_chart")
