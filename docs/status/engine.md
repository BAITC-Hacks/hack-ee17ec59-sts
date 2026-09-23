# Статус: engine

| ID | Задача | Дедлайн | Статус | Начато | Готово | Комментарий |
|---|---|---|---|---|---|---|
| S0 | Каркас Next.js/TypeScript и data/*.json | 14:15 | done | — | 15:09 | Готовый MVP; перенесено в TS-план по решению PM. |
| S0a | Единый репозиторий команды без вложенных репо | 14:20 | done | — | 15:09 | Готовый MVP; перенесено в TS-план по решению PM. |
| S1 | Единый TS-контракт: ScenarioInput, SimulationResult, validateScenario, simulateScenario | 14:30 | done | — | 15:09 | Готовый MVP; перенесено в TS-план по решению PM. |
| S2 | TS-only: JSON-импорты, Vitest, lint, pre-push, план и Node-доска | 14:30 | done | 15:09 | 15:16 | lint/build зелёные; Vitest 27 passed; Node-доска и pre-push установлены. |
| U3 | README MVP: проблема, стек, запуск и эталонный сценарий | 17:45 | done | — | 15:09 | README U3/U8 переназначены в engine; эта запись сохраняет завершённую часть MVP. |
| E1 | scoring: лаг, синергии, clip, D, D_avg, Score, N_crit, вклад мер | 15:10 | done | — | 15:19 | Формулы и JSON-каталог проверены; добавлен публичный getBaselineSnapshot() и общий расчет baseline/Score. |
| E2 | Валидатор: 5 мер, бюджет, уникальность, направления, размещение, конфликты | 15:30 | done | — | 15:09 | Готовый MVP; перенесено в TS-план по решению PM. |
| E3 | Оптимизатор: полный перебор, серверная мемоизация + suggestSwaps | 15:50 | done | 15:29 | 15:33 | 694395 сценариев, холодный перебор 2.29 с; top Score 57.236735; 36 тестов, lint/build зелёные. Функции готовы, экспорт: src/lib/simulation/index.ts — enumerateValid, findBest, suggestSwaps (сервер). |
| E3b | Худшие сценарии findWorst + ранг/перцентиль scoreRank | 16:00 | done | 15:49 | 15:50 | findWorst/scoreRank готовы. Для UI: кнопки Лучший/Худший — findBest()[0] / findWorst()[0], строка перцентиля — scoreRank(). Худший 52.04091625; пример 99.91849%; тесты крайних рангов и ограничений зелёные. |
| E3c | engineTools + executeTool для агента | 16:20 | done | 15:52 | 15:54 | 8 tools, JSON Schema/Zod, компактные ответы, русский error; 62 теста, lint/build зелёные. Для ai: import { engineTools, executeTool } from '@/lib/simulation/tools' — передай engineTools в tools запроса, на tool_call вызывай executeTool. |
| E4 | findBest(constraints), pareto(step), timeline(scenario) | 16:20 | done | 15:35 | 15:40 | Все constraints, pareto и timeline готовы; q=8 == evaluate; 40 тестов, lint/build зелёные. Функции готовы, экспорт: src/lib/simulation/index.ts; API — зона ai. Числа/контракт: docs/ENGINE_RESULTS.md. |
| E3a | Применение проверенного совета: сравнение, пять решений, пересчёт и отмена | 16:20 | done | 15:45 | 16:22 | Демо подготовлено: 92 теста, lint/build; браузер Apply/Undo 56.54→56.99→56.54 и 95→86→95. Сервер3000 запущен; ключ пустой, live AI ожидает ввода. docs/DEMO_READY.md. |
| A3 | Агент explain/chat: tool calling, ≤6 итераций, {answer, trace, mode}, demo-questions.json | 16:20 | done | 16:35 | 16:42 | POST /api/agent: fetch, engineTools/executeTool, 6 tool rounds + финал, таймаут 30 с, trace, общий fallback; 110 тестов и один build зелёные. LLM проверен mock fetch. |
| U6 | Dockerfile Next standalone + docker-compose | 16:40 | review | 15:57 | — | Docker/Compose/ignore и standalone готовы; локальные GET / и static JS — HTTP 200. Docker CLI отсутствует, compose smoke нужен на другой машине. После синхронизации 92 теста и standalone build зелёные. |
| I1 | ИНТЕГРАЦИЯ расширенного демо на одной машине, окно 16:50–17:00 | 17:00 | todo | — | — |  |
| E6 | CUT: события (авария → бюджет −15) + лидерборд | 17:20 | cut | — | — | Убрано из объёма по решению PM: сдача в 18:00. |
| U8 | README финал: архитектура Mermaid, скриншоты, числа, демо и тесты | 17:45 | in-progress | 16:31 | — | Владелец engine; ui только добавляет изображения в docs/screenshots/. |
| F0 | ФРИЗ КОДА: после 17:20 только README (engine) и скриншоты в docs/screenshots/ (ui) | 17:20 | todo | — | — |  |
| R1 | Чистый прогон: свежий clone → docker compose up | 17:40 | in-progress | 15:57 | — | Репетиция 15:59:27–16:03:05 (Node 22.23.2), чистый git clone --no-local коммита U6: npm ci 45.37 с, lint 87.97 с, 62 теста 19.28 с, build 65.06 с; всё exit 0, всего 217.73 с. Финал после фриза; Docker недоступен. Удаление ../clean-check отклонено автоматической проверкой (blocked by policy), клон сохранён. |
| R2 | Репетиция демо | 17:55 | todo | — | — |  |
