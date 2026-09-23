"""Shared engine interface backed by fixture responses until implementation."""

import json
from pathlib import Path


_ROOT = Path(__file__).resolve().parents[1]


def _read_json(path: Path):
    """Read a UTF-8 JSON file and return its decoded value."""
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def _contract() -> dict:
    """Return a fresh copy of the interface response fixtures."""
    return _read_json(_ROOT / "engine" / "contract.json")


def load_data() -> dict:
    """Take no arguments; return districts, measures, synergies, conflicts, config.

    Districts and measures are lists of records; synergies and conflicts are
    lists of rules. Config is the dictionary from data/config.json.
    """
    catalogue = _read_json(_ROOT / "data" / "measures.json")
    return {
        "districts": _read_json(_ROOT / "data" / "districts.json"),
        "measures": catalogue["measures"],
        "synergies": catalogue["synergies"],
        "conflicts": catalogue["conflicts"],
        "config": _read_json(_ROOT / "data" / "config.json"),
    }


def validate(scenario: list[dict]) -> dict:
    """Accept [{"id": "M7", "district": "nura" | None}]; return ok and errors.

    This stub ignores the scenario and maps the fixture's valid field to ok;
    errors is a list of strings. No scenario rules are checked yet.
    """
    result = _contract()["evaluate"]
    return {"ok": result["valid"], "errors": result["errors"]}


def evaluate(scenario: list[dict]) -> dict:
    """Accept [{"id": "M7", "district": "nura" | None}]; return evaluate fixture.

    The dictionary contains validity, errors, scores, district indicators,
    costs, critical indicators, contributions, and applied synergies, exactly
    as in contract.json["evaluate"]. Input is ignored by this stub.
    """
    return _contract()["evaluate"]


def find_best(top_n: int = 10) -> list[dict]:
    """Accept the requested result count; return contract.json["best"].

    Each record has scenario (a list of id/district decisions), score, and cost.
    This stub returns the fixed fixture and ignores top_n.
    """
    return _contract()["best"]


def suggest_swaps(scenario: list[dict], k: int = 3) -> list[dict]:
    """Accept an id/district decision list and count; return swaps fixture.

    Scenario format is [{"id": "M7", "district": "nura" | None}]. Each result
    has remove and add decision dictionaries and score_delta, as specified by
    contract.json["swaps"]. This stub ignores scenario and k.
    """
    return _contract()["swaps"]
