import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { ROOT, renderBoard } from "../scripts/status.mjs";

let root;
const temporaryParent = resolve(tmpdir());
function update(zone, id, status, comment = "") {
  const path = join(root, `docs/status/${zone}.md`);
  writeFileSync(path, readFileSync(path, "utf8").split(/\r?\n/).map(line => {
    if (!line.startsWith(`| ${id} |`)) return line;
    const cells = line.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    cells[3] = status;
    cells[6] = comment;
    return `| ${cells.join(" | ")} |`;
  }).join("\n"));
}
const meta = (start = "14:00", freeze = "17:20", end = "18:00") => writeFileSync(
  join(root, "docs/status/META.md"),
  `# Comments and CRLF are valid\r\nSTART = ${start} # local time\r\nEND=${end} # end\r\nFREEZE=${freeze} # freeze\r\nengine=Lix\r\nai=Игрок 2\r\nui=Игрок 3\r\n`,
);
const at = (hour, minute) => new Date(2026, 8, 23, hour, minute);
beforeEach(() => {
  root = mkdtempSync(join(temporaryParent, "akim-status-"));
  mkdirSync(join(root, "docs/status"), { recursive: true });
  for (const file of ["PLAN.md", "status/META.md", "status/engine.md", "status/ai.md", "status/ui.md"]) {
    writeFileSync(join(root, "docs", file), readFileSync(join(ROOT, "docs", file)));
  }
  // Deterministic board fixture, independent of teammates' future progress.
  for (const zone of ["engine", "ai", "ui"]) {
    const path = join(root, `docs/status/${zone}.md`);
    const ids = [...readFileSync(path, "utf8").matchAll(/^\| ([SEAUIFR]\d+[a-z]?) \|/gm)].map(m => m[1]);
    const completed = ["S0", "S0a", "S1", "S2", "E1", "E2", "A1", "A2", "U1", "U2", "U3"];
    for (const id of ids) update(zone, id, completed.includes(id) ? "done" : id === "E6" ? "cut" : "todo");
  }
  meta();
});
afterEach(() => {
  if (dirname(resolve(root)) !== temporaryParent || !root.startsWith(join(temporaryParent, "akim-status-"))) {
    throw new Error("Unexpected temporary path");
  }
  rmSync(root, { recursive: true, force: true });
});
it("reads commented META and calculates absolute times at 15:00", () => {
  const output = renderBoard(root, at(15, 0));
  expect(output).toContain("Время: 15:00 (системное, местное)");
  expect(output).toContain("Старт: 14:00 | Фриз: 17:20 | Конец: 18:00");
  expect(output).toContain("(11/28 уникальных тикетов)");
  expect(output).toContain("До фриза: 140 мин");
  expect(output).toContain("До конца: 180 мин");
  expect(output).not.toContain("T+");
});
it.each([[50, "УСПЕВАЕМ"], [51, "РИСК"], [65, "РИСК"], [66, "ОТСТАЁМ"]])("handles absolute deadline +%s minutes past 15:00", (m, verdict) => {
  const output = renderBoard(root, at(15, m));
  expect(output).toContain(`Вердикт: ${verdict}`);
  expect(output.includes("⚠")).toBe(m > 50);
  if (m > 50) expect(output).toContain(`⚠ +${m - 50} мин | 15:50`);
  expect(output.includes("Режем по списку: таймлайн из U5")).toBe(m > 65);
});
it("uses FREEZE and END from META, not a fixed duration after START", () => {
  meta("13:00", "17:20", "18:10");
  const output = renderBoard(root, at(15, 0));
  expect(output).toContain("До фриза: 140 мин");
  expect(output).toContain("До конца: 190 мин");
});
it("does not wrap times before start and clamps expired countdowns to zero", () => {
  expect(renderBoard(root, at(13, 0))).toContain("До фриза: 260 мин");
  expect(renderBoard(root, at(17, 20))).toContain("До фриза: 0 мин (фриз наступил 0 мин назад)");
  const output = renderBoard(root, at(18, 5));
  expect(output).toContain("До фриза: 0 мин (фриз наступил 45 мин назад)");
  expect(output).toContain("До конца: 0 мин (конец наступил 5 мин назад)");
});
it("requires all owners to finish a shared ticket", () => {
  update("engine", "I1", "done");
  expect(renderBoard(root, at(15, 0))).toContain("(11/28");
  update("ai", "I1", "done"); update("ui", "I1", "done");
  expect(renderBoard(root, at(15, 0))).toContain("(12/28");
});
it("respects the cut order and partial timeline cut", () => {
  const now = at(16, 30);
  expect(renderBoard(root, now)).toContain("Режем по списку: таймлайн из U5");
  update("ui", "U5", "in-progress", "cut:timeline");
  expect(renderBoard(root, now)).toContain("Режем по списку: Парето из U5");
  update("ui", "U5", "cut");
  expect(renderBoard(root, now)).toContain("Режем по списку: E5/U7");
});
it("flags the E4 timeline gate exactly at 16:20", () => {
  expect(renderBoard(root, at(16, 19))).not.toContain("Правило урезания:");
  expect(renderBoard(root, at(16, 20))).toContain("E4 не готов к 16:20 — убрать таймлайн, оставить только Парето");
  update("engine", "E4", "done");
  expect(renderBoard(root, at(16, 20))).not.toContain("Правило урезания:");
});
it("does not propose cutting already completed features", () => {
  update("ui", "U5", "done");
  expect(renderBoard(root, at(16, 30))).toContain("Режем по списку: E5/U7");
});
it.each(["START", "END", "FREEZE"])("fails clearly on missing %s", key => {
  const path = join(root, "docs/status/META.md");
  writeFileSync(path, readFileSync(path, "utf8").replace(new RegExp(`^${key}\\s*=.*$`, "m"), ""));
  expect(() => renderBoard(root, at(15, 0))).toThrow(`заполните ${key}=HH:MM`);
});
it("rejects invalid clocks and inconsistent freeze deadlines", () => {
  meta("HH:MM");
  expect(() => renderBoard(root, at(15, 0))).toThrow("Некорректное время");
  meta("14:00", "17:21");
  expect(() => renderBoard(root, at(15, 0))).toThrow("F0 должен совпадать");
  meta("14:00", "18:10");
  expect(() => renderBoard(root, at(15, 0))).toThrow("START < FREEZE <= END");
});
it("fails clearly on an unknown status", () => {
  update("engine", "S1", "finished");
  expect(() => renderBoard(root)).toThrow("неизвестный статус");
});
