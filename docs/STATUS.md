Актуальный план — docs/PLAN.md, статус — npm run status

# Статус проекта

Обновлено 2026-09-23. Решение PM: только Next.js / TypeScript.

## Работает
- Единый каталог `data/*.json`, проверяемый Zod. TS-движок: `src/lib/simulation/`.
- MVP: пять решений, бюджет, валидатор, Score, результаты районов, синергии и отрицательные эффекты.
- Baseline: Score 52.56, D_avg 56.86, N_crit 2. Пример: расход 95, Score 56.54 ±0.01.
- AI-записка: `src/lib/analysis.ts` + `/api/analyze`; без ключа/при ошибке API — fallback. Tool calling пока не реализован.
- Python-код и Streamlit удалены; `data/geo/` сохранён. Алматы — схематичные границы. React-карта ещё не подключена.
- `npm run status`: Node без внешних зависимостей, зоны engine/ai/ui; 29 уникальных тикетов, 16 done (55.2%).
- `npm run hooks:install` устанавливает pre-push: `npm run lint && npm test`.

## Проверено при миграции
- `npm run lint` — успешно, без предупреждений.
- `npm test` — 27 passed: эталоны, валидация, fallback, геоданные, доска статусов.
- `npm run build` — успешно; маршруты `/`, `/_not-found`, `/api/analyze`.
- Node 22.23.2. Реальный LLM с ключом, браузерный прогон после миграции и чистый Docker-прогон в этой проверке не выполнялись.

После пересчёта плана до 18:00: lint/build зелёные, Vitest — 34 passed. Доска считает сроки по системным часам и META (START/END/FREEZE), комментарии игнорируются.

## Следующие задачи
- engine: E3/E4/E3b/E3c done. U6 Docker — review (контейнерный smoke ждёт машину с Docker), R1 — репетиция сейчас и финал после фриза. AI подключает src/lib/simulation/tools.ts.
- ai: A3 агент explain/chat с инструментами и trace; A4 подключение к UI и промпты.
- ui: U4 AI trace, U5 графики, E5/U7 карта, U8 README; общий R2. Все правки фронта — ui.
- Контрольные точки: 16:20 синк, 16:50–17:00 интеграция, 17:20 фриз, 18:00 конец. E6 cut; README начать сейчас, финал 17:45.
- `START=14:00` сохранён; PM подтверждает владельцев ai/ui. Блокеров для локального MVP нет.

Передача PM: `docs/PM_HANDOFF.md`; подробный план: `docs/PLAN.md`.

suggestSwaps расширен до всех одиночных замен и переноса района; полный оптимизатор готов в optimizer.ts. E3b: findWorst + scoreRank. E3c: 8 engineTools + executeTool, 62 теста, lint/build зелёные. Новый UI использует DecisionSlot/MeasureDetails и русские подписи.

E3 done: enumerateValid/findBest/suggestSwaps экспортированы из src/lib/simulation/index.ts для серверных tools. Полный поиск: 694395 сценариев за 2.29 с, top Score 57.236735, cost 98. Проверки: 36 тестов, lint/build. E4 done: все ограничения, Парето и таймлайн с общей формулой; 40 тестов, lint/build зелёные. Последний замер полного перебора 2.12 с. Таблицы и контракт — docs/ENGINE_RESULTS.md.

U6: Dockerfiles/Compose/standalone готовы; локально GET / и static JS HTTP 200. Docker CLI отсутствует — compose build/up/down не проверены, U6 review. Репетиция R1 в чистом Git-клоне прошла: npm ci 45.37 с, lint 87.97 с, 62 теста 19.28 с, build 65.06 с (всего 217.73 с, Node 22.23.2). Финальный прогон после фриза остаётся открытым. ../clean-check оставлен: автоматическая проверка отклонила удаление (blocked by policy).

При финальной синхронизации получен E3a коллег: проверенный совет с Apply/Undo и /api/advice. Его код и статус сохранены; отчёт чистого клона выше относится к состоянию U6 до этого входящего коммита. После интеграции: 92 теста и standalone build прошли; /api/advice и /api/analyze собраны. Для полного прогона тестов настроены последовательные файлы и таймаут 15 с (поиск + сортировка + assertions).
