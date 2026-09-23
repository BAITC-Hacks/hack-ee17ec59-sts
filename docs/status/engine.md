# Статус: engine

| ID | Задача | Дедлайн | Статус | Начато | Готово | Комментарий |
|---|---|---|---|---|---|---|
| S0 | Каркас Next.js/TypeScript и data/*.json | 14:15 | done | — | 15:09 | Готовый MVP; перенесено в TS-план по решению PM. |
| S0a | Единый репозиторий команды без вложенных репо | 14:20 | done | — | 15:09 | Готовый MVP; перенесено в TS-план по решению PM. |
| S1 | Единый TS-контракт: ScenarioInput, SimulationResult, validateScenario, simulateScenario | 14:30 | done | — | 15:09 | Готовый MVP; перенесено в TS-план по решению PM. |
| S2 | TS-only: JSON-импорты, Vitest, lint, pre-push, план и Node-доска | 14:30 | done | 15:09 | 15:16 | lint/build зелёные; Vitest 27 passed; Node-доска и pre-push установлены. |
| E1 | scoring: лаг, синергии, clip, D, D_avg, Score, N_crit, вклад мер | 15:10 | done | — | 15:19 | Формулы и JSON-каталог проверены; добавлен публичный getBaselineSnapshot() и общий расчет baseline/Score. |
| E2 | Валидатор: 5 мер, бюджет, уникальность, направления, размещение, конфликты | 15:30 | done | — | 15:09 | Готовый MVP; перенесено в TS-план по решению PM. |
| E3 | Оптимизатор: полный перебор, серверная мемоизация + suggestSwaps | 15:50 | done | 15:29 | 15:33 | 694395 сценариев, холодный перебор 2.29 с; top Score 57.236735; 36 тестов, lint/build зелёные. Функции готовы, экспорт: src/lib/simulation/index.ts — enumerateValid, findBest, suggestSwaps (сервер). |
| E3b | Худшие сценарии findWorst + ранг/перцентиль scoreRank | 16:00 | done | 15:49 | 15:50 | findWorst/scoreRank готовы. Для UI: кнопки Лучший/Худший — findBest()[0] / findWorst()[0], строка перцентиля — scoreRank(). Худший 52.04091625; пример 99.91849%; тесты крайних рангов и ограничений зелёные. |
| E3c | engineTools + executeTool для агента | 16:20 | todo | — | — | 8 tools; JSON Schema и компактный результат. |
| E4 | findBest(constraints), pareto(step), timeline(scenario) | 16:20 | done | 15:35 | 15:40 | Все constraints, pareto и timeline готовы; q=8 == evaluate; 40 тестов, lint/build зелёные. Функции готовы, экспорт: src/lib/simulation/index.ts; API — зона ai. Числа/контракт: docs/ENGINE_RESULTS.md. |
| U6 | Dockerfile Next standalone + docker-compose | 16:40 | todo | — | — |  |
| I1 | ИНТЕГРАЦИЯ расширенного демо на одной машине, окно 16:50–17:00 | 17:00 | todo | — | — |  |
| E6 | CUT: события (авария → бюджет −15) + лидерборд | 17:20 | cut | — | — | Убрано из объёма по решению PM: сдача в 18:00. |
| F0 | ФРИЗ КОДА: после 17:20 пушит только ui (README) | 17:20 | todo | — | — |  |
| R1 | Чистый прогон: свежий clone → docker compose up | 17:40 | todo | — | — |  |
| R2 | Репетиция демо | 17:55 | todo | — | — |  |
