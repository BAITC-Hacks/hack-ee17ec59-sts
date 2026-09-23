"""Verify the shared data and fixture interface before engine implementation."""

import json
from pathlib import Path

import pytest

from engine.interface import evaluate, find_best, load_data, suggest_swaps, validate


@pytest.fixture
def contract():
    path = Path(__file__).resolve().parents[1] / "engine" / "contract.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_load_data():
    data = load_data()
    assert set(data) == {"districts", "measures", "synergies", "conflicts", "config"}
    assert len(data["districts"]) == 5
    assert sum(d["pop"] for d in data["districts"]) == pytest.approx(1.0, abs=1e-9)
    assert len(data["measures"]) == 14
    assert sum(data["config"]["weights"].values()) == pytest.approx(1.0, abs=1e-9)


def test_load_data_outside_project_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert len(load_data()["districts"]) == 5


def test_validate_contract(contract):
    assert validate([]) == {
        "ok": contract["evaluate"]["valid"],
        "errors": contract["evaluate"]["errors"],
    }


def test_evaluate_contract(contract):
    assert evaluate([{"id": "M7", "district": "nura"}]) == contract["evaluate"]


def test_find_best_contract(contract):
    assert find_best() == contract["best"]


def test_suggest_swaps_contract(contract):
    assert suggest_swaps([]) == contract["swaps"]


def test_fixture_responses_are_independent(contract):
    result = evaluate([])
    result["districts"].clear()
    assert evaluate([]) == contract["evaluate"]
