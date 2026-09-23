# AGENTS — Akim-5

## Решение PM и стек
Только Next.js App Router / TypeScript / React. Python, FastAPI и Streamlit отменены.
Единственный каталог данных — data/*.json. src/lib/simulation/data.ts проверяет JSON через Zod и адаптирует поля, не хранит копии значений.
Чистый TS-движок в src/lib/simulation не зависит от React, сети и LLM. Его index.ts — единый контракт.
LLM объясняет рассчитанный JSON; не считает Score. OpenAI SDK используется только на сервере; без ключа UI использует детерминированный fallback.
Для будущего агента A3: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL. Текущий /api/analyze пока принимает OPENAI_API_KEY; миграция конфигурации входит в A3.
Секреты — только .env.local, в Git только .env.example. БД, авторизация и GPU для MVP не нужны.

## Источники истины
- docs/PLAN.md — актуальный TS-план и сроки; docs/status/META.md — старт и владельцы.
- docs/SIMULATION_SPEC.md — формулы; data/*.json — единственные числовые данные.
- docs/ARCHITECTURE.md — архитектура и контракты; src/lib/simulation/types.ts — фактические TS-типы.
- docs/STATUS.md и docs/PM_HANDOFF.md — сводка проверенного состояния.

## Зоны по реальным путям
| Зона | Ответственность |
|---|---|
| engine | data/**, src/lib/simulation/**, tests/**, scripts/**, .githooks/**, AGENTS.md, docs/PLAN.md, README.md целиком (U3/U8), Dockerfile, docker-compose.yml, .dockerignore, next.config.ts; U6/R1 |
| ai | src/lib/analysis.ts, src/app/api/analyze/**; будущие агент/инструменты рядом в src/lib и новые API routes |
| ui | src/components/scenario/**, src/components/results/** (включая карту E5/U7), src/app/page.tsx, src/app/layout.tsx, src/app/globals.css, только скриншоты в docs/screenshots/ |

Общие package.json, lockfile, типы и конфигурация изменяются последовательно с согласованием владельцев. Не перемещать чужие модули без договорённости. Код создаётся через AI-агентов; значимые действия фиксируются в своём docs/log/<имя>.md. Чужие журналы не редактировать.

## Правила main — смысл сохранён
main — интеграционная ветка; обычная работа напрямую в main запрещена. Исключение — явно порученная пользователем/PM интеграция, включая эту TS-only миграцию.
Рабочие ветки: codex/damir/simulation-engine, codex/rasul/scenario-builder, codex/shah/results-ai. База feature-веток — codex/damir/simulation-engine, пока команда не согласует другой base commit.
Damir объединяет ветки на контрольных точках. Нельзя перезаписывать main чужим каркасом или удалять src/ и Next.js конфигурацию.
Перед работой: git pull --rebase, прочитать статусы и журналы коллег. Перед push: маленький коммит, свой журнал и статус, git pull --rebase, затем git push. Не переписывать чужую историю force push.
Перед merge обязательны npm run lint, npm test, npm run build и основной пользовательский сценарий.
Установка версионируемого хука: npm run hooks:install. .githooks/pre-push выполняет npm run lint && npm test и блокирует push при ошибке. Не обходить хук через --no-verify.

## Реальная реализация и готовность
- validateScenario проверяет ровно 5 решений, бюджет, дубли, направления, размещение и конфликты; ошибки на русском.
- simulateScenario меняет результат от входа. Пустой сценарий поддерживается только для baseline; UI не принимает его как готовый набор решений.
- Baseline: Score 52.56, D_avg 56.86, N_crit 2. Пример: cost 95, Score 56.54 ±0.01.
- UI и AI не копируют расчёты. Мемоизация оптимизатора — на сервере; критерий E3 — полный холодный поиск <5 сек.
- Внешние данные валидируются; исключения AI не ломают числовой расчёт и fallback.
- Fixtures не считаются реализацией. Проверяются baseline, эталон, invalid cases и зависимость результата от сценария.
- До обязательного MVP не добавлять auth, БД, мультиплеер и GPU. E6 cut по решению PM; карта E5 разрешена планом PM.

## Статусы — обязательно для агента
- Перед началом тикета: npm run status — посмотри, что готово у других и нет ли блокеров.
- Начал: в docs/status/<своя зона>.md поставь in-progress и Начато HH:MM.
- Закончил: done, Готово HH:MM; в комментарии что сделано и проверено.
- Застрял >15 мин или ждёшь другую зону: blocked и причина, сообщи человеку.
- Правишь только свой файл статуса; PLAN.md — зона engine. Первичная TS-миграция, пересчёт сроков и перенос владельцев E5/U7/U6/R1 разрешены PM.
- Статус коммитится вместе с кодом тикета. Общие I1/F0/R2 подтверждаются каждой зоной; R1 принадлежит engine.
- Дедлайны — абсолютное местное время HH:MM; START/END/FREEZE обязательны в META.md. В конце ответа — итог npm run status: вердикт, процент done, до фриза и до конца.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
