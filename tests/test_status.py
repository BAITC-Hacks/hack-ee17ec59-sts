from datetime import datetime
from pathlib import Path
import shutil

import pytest

from scripts.status import ROOT, render_board


@pytest.fixture
def board(tmp_path):
    (tmp_path / "docs").mkdir()
    shutil.copyfile(ROOT / "docs/PLAN.md", tmp_path / "docs/PLAN.md")
    shutil.copytree(ROOT / "docs/status", tmp_path / "docs/status")
    return tmp_path


def set_start(board, start):
    (board / "docs/status/META.md").write_text(f"START={start} # local time\n", encoding="utf-8")


def update_ticket(board, zone, ticket, state, comment=""):
    path = board / f"docs/status/{zone}.md"
    rows = path.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(rows):
        if line.startswith(f"| {ticket} |"):
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            cells[3], cells[6] = state, comment
            rows[i] = "| " + " | ".join(cells) + " |"
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")


def test_missing_start_is_explicit_and_shared_tickets_count_once(board):
    output = render_board(board, datetime(2026, 9, 23, 15, 0))
    assert "START не заполнен" in output
    assert "Готово: 7.4% (2/27 уникальных тикетов)" in output
    assert "До фриза: 270 минут" in output
    assert "условно" in output


@pytest.mark.parametrize("minute, verdict, late", [(30, "УСПЕВАЕМ", False), (31, "РИСК", True),
                                                   (45, "РИСК", True), (46, "ОТСТАЁМ", True)])
def test_deadline_and_fifteen_minute_threshold(board, minute, verdict, late):
    set_start(board, "10:00")
    output = render_board(board, datetime(2026, 9, 23, 10, minute))
    assert f"Вердикт: {verdict}" in output
    assert ("⚠" in output) == late
    assert ("Режем по списку: E6" in output) == (minute > 45)


def test_midnight_rollover_and_freeze(board):
    set_start(board, "23:30")
    output = render_board(board, datetime(2026, 9, 24, 0, 20))
    assert "Время: T+0:50" in output
    assert "До фриза: 220 минут" in output
    output = render_board(board, datetime(2026, 9, 24, 4, 30))
    assert "До фриза: 0 минут (фриз наступил 30 минут назад)" in output


def test_next_cut_and_partial_timeline_cut(board):
    set_start(board, "10:00")
    update_ticket(board, "engine", "E6", "cut")
    now = datetime(2026, 9, 23, 14, 0)
    assert "Режем по списку: таймлайн из U5" in render_board(board, now)
    update_ticket(board, "ui", "U5", "in-progress", "cut:timeline")
    assert "Режем по списку: Парето из U5" in render_board(board, now)
    update_ticket(board, "ui", "U5", "cut")
    assert "Режем по списку: E5/U7" in render_board(board, now)


def test_shared_done_requires_all_zones(board):
    update_ticket(board, "engine", "I1", "done")
    assert "(2/27" in render_board(board)
    for zone in ("ai-api", "ui"):
        update_ticket(board, zone, "I1", "done")
    assert "(3/27" in render_board(board)


def test_bad_status_fails_clearly(board):
    update_ticket(board, "engine", "S1", "finished")
    with pytest.raises(ValueError, match="неизвестный статус"):
        render_board(board)
