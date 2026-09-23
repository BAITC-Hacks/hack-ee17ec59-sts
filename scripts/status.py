"""Print the hackathon board using only the Python standard library.

Shared tickets count once; they are done only when every zone marks them done.
For partial cuts of U5 use cut:timeline / cut:pareto in its comment.
"""

import argparse
from collections import defaultdict
from datetime import datetime
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
STATES = {"todo", "in-progress", "review", "done", "blocked", "cut"}


def minutes(value):
    if not re.fullmatch(r"\d{1,2}:\d{2}", value):
        raise ValueError(f"Некорректное время: {value}")
    hour, minute = map(int, value.split(":"))
    if minute >= 60 or hour >= 24:
        raise ValueError(f"Некорректное время: {value}")
    return hour * 60 + minute


def table_rows(text):
    for line in text.splitlines():
        if line.startswith("|"):
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if cells[0] not in {"ID", "Зона", "Критерий", "---"} and not set(cells[0]) <= {"-", ":"}:
                yield cells


def load_board(root):
    plan = (root / "docs/PLAN.md").read_text(encoding="utf-8")
    expected = {row[0]: row for row in table_rows(plan) if len(row) == 6}
    zones = {}
    for path in sorted((root / "docs/status").glob("*.md")):
        if path.name == "META.md":
            continue
        rows = []
        seen = set()
        for cells in table_rows(path.read_text(encoding="utf-8")):
            if len(cells) != 7:
                raise ValueError(f"{path.name}: ожидается 7 колонок")
            ticket, task, deadline, status, started, finished, comment = cells
            if ticket in seen or ticket not in expected:
                raise ValueError(f"{path.name}: повторный или неизвестный тикет {ticket}")
            if status not in STATES:
                raise ValueError(f"{path.name}: неизвестный статус {status}")
            if expected[ticket][1] not in {path.stem, "все"}:
                raise ValueError(f"{path.name}: тикет {ticket} принадлежит другой зоне")
            if deadline != expected[ticket][3]:
                raise ValueError(f"{path.name}: дедлайн {ticket} расходится с PLAN.md")
            seen.add(ticket)
            rows.append(dict(id=ticket, task=task, deadline=deadline, due=minutes(deadline),
                             status=status, started=started, finished=finished, comment=comment))
        required = {key for key, row in expected.items() if row[1] in {path.stem, "все"}}
        if seen != required:
            raise ValueError(f"{path.name}: отсутствуют тикеты {sorted(required - seen)}")
        zones[path.stem] = rows
    if not {"engine", "ai-api", "ui"}.issubset(zones):
        raise ValueError("Нужны все три файла статусов: engine, ai-api, ui")
    return plan, zones


def next_cut(plan, grouped):
    section = plan.split("## Порядок урезания, если отстаём", 1)[1].split("\n## ", 1)[0]
    line = next(line for line in section.splitlines() if line.startswith("1."))
    for item in re.split(r"\s*→\s*", line):
        item = re.sub(r"^\d+\.\s*", "", item).rstrip(".")
        ids = re.findall(r"\b[EAUSIFR]\d+[a-z]?\b", item)
        rows = [row for ticket in ids for row in grouped.get(ticket, [])]
        if rows and all(row["status"] == "cut" for row in rows):
            continue
        marker = "cut:timeline" if "таймлайн" in item else "cut:pareto" if "Парето" in item else None
        if marker and rows and all(marker in row["comment"].lower() for row in rows):
            continue
        return item
    return "все предусмотренные пункты уже cut; агент, README и Docker не режем"


def render_board(root=ROOT, now=None):
    plan, zones = load_board(root)
    meta = (root / "docs/status/META.md").read_text(encoding="utf-8")
    start = re.search(r"^START\s*=\s*([^#\n]+)", meta, re.MULTILINE)
    warning = None
    try:
        start_minutes = minutes(start.group(1).strip() if start else "")
        current = now or datetime.now()
        elapsed = (current.hour * 60 + current.minute - start_minutes) % (24 * 60)
    except ValueError:
        elapsed = 0
        warning = "ПРЕДУПРЕЖДЕНИЕ: START не заполнен или неверен; T+ считается 0:00. Сроки пока не подтверждены."
    lines = [warning] if warning else []
    lines.append(f"Время: T+{elapsed // 60}:{elapsed % 60:02d}")
    grouped = defaultdict(list)
    for zone in ("engine", "ai-api", "ui"):
        lines.extend(["", f"[{zone}]", "ID | Задача | Статус | Дедлайн"])
        active = []
        for row in zones[zone]:
            grouped[row["id"]].append(row)
            overdue = elapsed > row["due"] and row["status"] not in {"done", "cut"}
            mark = " ⚠" if overdue else ""
            lines.append(f"{row['id']} | {row['task']} | {row['status']}{mark} | T+{row['deadline']}")
            if row["status"] == "in-progress":
                active.append(f"{row['id']} (начато {row['started'] or 'не указано'})")
        lines.append("В работе: " + (", ".join(active) or "нет"))
    done = sum(all(row["status"] == "done" for row in rows) for rows in grouped.values())
    late = {ticket: max(elapsed - row["due"] for row in rows if row["status"] not in {"done", "cut"})
            for ticket, rows in grouped.items()
            if any(elapsed > row["due"] and row["status"] not in {"done", "cut"} for row in rows)}
    worst = max(late.values(), default=0)
    verdict = "ОТСТАЁМ" if worst > 15 else "РИСК" if worst else "УСПЕВАЕМ"
    if worst > 15:
        lines.extend(["", "Режем по списку: " + next_cut(plan, grouped)])
    freeze = next(rows[0]["due"] for ticket, rows in grouped.items() if ticket == "F0")
    lines.extend(["", f"Вердикт: {verdict}" + (" (условно: START не задан)" if warning else ""),
                  f"Готово: {100 * done / len(grouped):.1f}% ({done}/{len(grouped)} уникальных тикетов)",
                  f"До фриза: {max(0, freeze - elapsed)} минут" +
                  (f" (фриз наступил {elapsed - freeze} минут назад)" if elapsed >= freeze else "")])
    return "\n".join(lines)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        print(render_board(args.root))
    except (OSError, ValueError, KeyError, IndexError, StopIteration) as error:
        parser.exit(1, f"Ошибка доски статусов: {error}\n")


if __name__ == "__main__":
    main()
