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
const start = value => writeFileSync(join(root, "docs/status/META.md"), `START=${value} # local time\n`);
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
    for (const id of ids) update(zone, id, ["S0", "S0a"].includes(id) ? "done" : id === "S2" ? "in-progress" : "todo");
  }
  start("HH:MM");
});
afterEach(() => {
  if (dirname(resolve(root)) !== temporaryParent || !root.startsWith(join(temporaryParent, "akim-status-"))) {
    throw new Error("Unexpected temporary path");
  }
  rmSync(root, { recursive: true, force: true });
});
it("warns without START and counts shared tickets only once", () => {
  const output = renderBoard(root);
  expect(output).toContain("условно: START не задан");
  expect(output).toContain("(2/26 уникальных тикетов)");
  expect(output).toContain("До фриза: 270 минут");
});
it.each([[30, "УСПЕВАЕМ"], [31, "РИСК"], [45, "РИСК"], [46, "ОТСТАЁМ"]])("handles +%s minutes", (m, verdict) => {
  start("10:00");
  const output = renderBoard(root, new Date(2026, 8, 23, 10, m));
  expect(output).toContain(`Вердикт: ${verdict}`);
  expect(output.includes("⚠")).toBe(m > 30);
  expect(output.includes("Режем по списку: E6")).toBe(m > 45);
});
it("supports midnight and clamps freeze time to zero", () => {
  start("23:30");
  expect(renderBoard(root, new Date(2026, 8, 24, 0, 20))).toContain("До фриза: 220 минут");
  expect(renderBoard(root, new Date(2026, 8, 24, 4, 30))).toContain("До фриза: 0 минут (фриз наступил 30 минут назад)");
});
it("requires all owners to finish a shared ticket", () => {
  update("engine", "I1", "done");
  expect(renderBoard(root)).toContain("(2/26");
  update("ai", "I1", "done"); update("ui", "I1", "done");
  expect(renderBoard(root)).toContain("(3/26");
});
it("respects the cut order and partial timeline cut", () => {
  start("10:00"); const now = new Date(2026, 8, 23, 14, 0);
  update("engine", "E6", "cut");
  expect(renderBoard(root, now)).toContain("Режем по списку: таймлайн из U5");
  update("ui", "U5", "in-progress", "cut:timeline");
  expect(renderBoard(root, now)).toContain("Режем по списку: Парето из U5");
  update("ui", "U5", "cut");
  expect(renderBoard(root, now)).toContain("Режем по списку: E5/U7");
});
it("fails clearly on an unknown status", () => {
  update("engine", "S1", "finished");
  expect(() => renderBoard(root)).toThrow("неизвестный статус");
});
