import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ZONES = ["engine", "ai", "ui"];
const STATES = new Set(["todo", "in-progress", "review", "done", "blocked", "cut"]);
const read = path => readFileSync(path, "utf8");
const table = text => text.split(/\r?\n/).filter(line => line.startsWith("|")).map(line =>
  line.replace(/^\||\|$/g, "").split("|").map(cell => cell.trim())
).filter(row => /^[SEAUIFR]\d+[a-z]?$/.test(row[0]));

export function minutes(value) {
  if (!/^\d{1,2}:\d{2}$/.test(value)) throw new Error(`Некорректное время: ${value}`);
  const [h, m] = value.split(":").map(Number);
  if (h >= 24 || m >= 60) throw new Error(`Некорректное время: ${value}`);
  return h * 60 + m;
}

export function loadBoard(root = ROOT) {
  const plan = read(join(root, "docs/PLAN.md"));
  const expected = new Map(table(plan).map(row => [row[0], row]));
  const folder = join(root, "docs/status");
  const files = readdirSync(folder).filter(file => file.endsWith(".md") && file !== "META.md");
  if (files.length !== ZONES.length || ZONES.some(zone => !files.includes(`${zone}.md`))) {
    throw new Error("Нужны только три зональных файла: engine.md, ai.md, ui.md");
  }
  const zones = {};
  for (const zone of ZONES) {
    const seen = new Set();
    zones[zone] = table(read(join(folder, `${zone}.md`))).map(cells => {
      if (cells.length !== 7) throw new Error(`${zone}: ожидается 7 колонок`);
      const [id, task, deadline, status, started, finished, comment] = cells;
      const spec = expected.get(id);
      if (seen.has(id) || !spec) throw new Error(`${zone}: повторный/неизвестный тикет ${id}`);
      if (![zone, "все"].includes(spec[1])) throw new Error(`${zone}: чужой тикет ${id}`);
      if (!STATES.has(status)) throw new Error(`${zone}: неизвестный статус ${status}`);
      if (deadline !== spec[3]) throw new Error(`${zone}: дедлайн ${id} расходится с PLAN.md`);
      seen.add(id);
      return { id, task, deadline, due: minutes(deadline), status, started, finished, comment };
    });
    const missing = [...expected.values()].filter(row => [zone, "все"].includes(row[1]) && !seen.has(row[0]));
    if (missing.length) throw new Error(`${zone}: отсутствуют тикеты ${missing.map(row => row[0]).join(", ")}`);
  }
  return { plan, zones };
}

export function nextCut(plan, grouped) {
  const section = plan.split("## Порядок урезания, если отстаём")[1]?.split("\n## ")[0];
  const line = section?.split("\n").find(line => line.startsWith("1."));
  if (!line) throw new Error("В PLAN.md отсутствует порядок урезания");
  for (const raw of line.split(/\s*→\s*/)) {
    const item = raw.replace(/^\d+\.\s*/, "").replace(/\.$/, "");
    const ids = item.match(/\b[EAUSIFR]\d+[a-z]?\b/g) ?? [];
    const rows = ids.flatMap(id => grouped.get(id) ?? []);
    if (rows.length && rows.every(row => row.status === "cut")) continue;
    const marker = item.includes("таймлайн") ? "cut:timeline" : item.includes("Парето") ? "cut:pareto" : null;
    if (marker && rows.length && rows.every(row => row.comment.toLowerCase().includes(marker))) continue;
    return item;
  }
  return "все пункты уже cut; агент, README и Docker не режем";
}

export function renderBoard(root = ROOT, now = new Date()) {
  const { plan, zones } = loadBoard(root);
  const meta = read(join(root, "docs/status/META.md"));
  const start = /^START\s*=\s*([^#\r\n]+)/m.exec(meta)?.[1]?.trim() ?? "";
  let elapsed = 0;
  let warning = false;
  try {
    elapsed = (now.getHours() * 60 + now.getMinutes() - minutes(start) + 1440) % 1440;
  } catch { warning = true; }
  const lines = warning ? ["ПРЕДУПРЕЖДЕНИЕ: START не заполнен или неверен; T+0:00. Сроки пока не подтверждены."] : [];
  lines.push(`Время: T+${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`);
  const grouped = new Map();
  for (const zone of ZONES) {
    lines.push("", `[${zone}]`, "ID | Задача | Статус | Дедлайн");
    const active = [];
    for (const row of zones[zone]) {
      if (!grouped.has(row.id)) grouped.set(row.id, []);
      grouped.get(row.id).push(row);
      const overdue = elapsed > row.due && !["done", "cut"].includes(row.status);
      lines.push(`${row.id} | ${row.task} | ${row.status}${overdue ? " ⚠" : ""} | T+${row.deadline}`);
      if (row.status === "in-progress") active.push(`${row.id} (начато ${row.started || "не указано"})`);
    }
    lines.push(`В работе: ${active.join(", ") || "нет"}`);
  }
  const groups = [...grouped.values()];
  const done = groups.filter(rows => rows.every(row => row.status === "done")).length;
  const worst = Math.max(0, ...groups.flat().filter(row => !["done", "cut"].includes(row.status)).map(row => elapsed - row.due));
  const verdict = worst > 15 ? "ОТСТАЁМ" : worst > 0 ? "РИСК" : "УСПЕВАЕМ";
  const freeze = grouped.get("F0")?.[0]?.due;
  if (freeze === undefined) throw new Error("Отсутствует тикет фриза F0");
  if (worst > 15) lines.push("", "Режем по списку: " + nextCut(plan, grouped));
  lines.push("", `Вердикт: ${verdict}${warning ? " (условно: START не задан)" : ""}`,
    `Готово: ${(100 * done / grouped.size).toFixed(1)}% (${done}/${grouped.size} уникальных тикетов)`,
    `До фриза: ${Math.max(0, freeze - elapsed)} минут${elapsed >= freeze ? ` (фриз наступил ${elapsed - freeze} минут назад)` : ""}`);
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args[0] !== "--root" || args.length !== 2)) throw new Error("Использование: npm run status [-- --root PATH]");
    console.log(renderBoard(args.length ? resolve(args[1]) : ROOT));
  } catch (error) {
    console.error(`Ошибка доски статусов: ${error.message}`);
    process.exitCode = 1;
  }
}
