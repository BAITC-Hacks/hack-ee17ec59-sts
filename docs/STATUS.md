# Статус проекта

Обновлено 2026-09-23. Решение PM: только Next.js / TypeScript.

## Работает
- Единый каталог `data/*.json`, проверяемый Zod. TS-движок: `src/lib/simulation/`.
- MVP: пять решений, бюджет, валидатор, Score, результаты районов, синергии и отрицательные эффекты.
- Baseline: Score 52.56, D_avg 56.86, N_crit 2. Пример: расход 95, Score 56.54 ±0.01.
- AI-записка: `src/lib/analysis.ts` + `/api/analyze`; без ключа/при ошибке API — fallback. Tool calling пока не реализован.
- Python-код и Streamlit удалены; `data/geo/` сохранён. Алматы — схематичные границы. React-карта ещё не подключена.
- `npm run status`: Node без внешних зависимостей, зоны engine/ai/ui; 26 уникальных тикетов, 11 done (42.3%).
- `npm run hooks:install` устанавливает pre-push: `npm run lint && npm test`.

## Проверено при миграции
- `npm run lint` — успешно, без предупреждений.
- `npm test` — 27 passed: эталоны, валидация, fallback, геоданные, доска статусов.
- `npm run build` — успешно; маршруты `/`, `/_not-found`, `/api/analyze`.
- Node 22.23.2. Реальный LLM с ключом, браузерный прогон после миграции и чистый Docker-прогон в этой проверке не выполнялись.

## Следующие задачи
- engine: E3 оптимизатор/suggestSwaps; E4 ограничения/Парето/таймлайн; E5 react-leaflet.
- ai: A3 агент explain/chat с инструментами и trace; A4 промпты.
- ui: U4 AI trace, U5 графики, U7 карта, U6 Docker, U8 README; общие R1/R2.
- Контрольные точки: T+2:40 синк, T+3:30 интеграция, T+4:30 фриз.
- `START=14:00` сохранён; PM подтверждает владельцев ai/ui. Блокеров для локального MVP нет.

Передача PM: `docs/PM_HANDOFF.md`; подробный план: `docs/PLAN.md`.

Коллеги добавили suggestSwaps в src/lib/simulation/optimize.ts (перебор одной замены). Это частичная реализация E3; полный поиск с серверной мемоизацией и замером <5 сек ещё предстоит. Новый UI использует DecisionSlot/MeasureDetails и русские подписи.
