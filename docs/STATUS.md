Актуальный план — docs/PLAN.md, статус — npm run status

# Статус проекта

Обновлено 2026-09-23. Архитектура проекта — Next.js App Router / TypeScript.

## Работает

- Единые данные из data/*.json и TS-движок в src/lib/simulation/.
- Конструктор сценария, валидация, Score, районные результаты и синергии.
- Серверный AI-анализ с шаблонным fallback; проверенный совет об одиночной замене с просмотром, применением и отменой.
- Оптимизатор, constraints, best/worst, rank, Парето и timeline; полный перебор — 694395 наборов за 2.12 с согласно docs/ENGINE_RESULTS.md.
- Движок экспортирует восемь инструментов для будущего агента.
- На версии main npm test: 92 теста в 6 отслеживаемых файлах; полный список находится в tests/.
- GeoJSON районов хранится в data/geo/; граница Алматы схематичная.

## Ещё не завершено

- AI tool-calling агент, trace и подключение к UI: задачи A3/A4/U4. В main нет готового цикла агента.
- React-карта и вкладки Парето/timeline: задачи E5/U7/U5.
- U6 Docker остаётся review: на текущей машине нет Docker CLI, контейнерный smoke здесь не выполнен.
- R1 остаётся in-progress до финального прогона после фриза.
- События и лидерборд вырезаны из объёма; сравнения команд нет.

## Владельцы

README целиком (U3/U8) принадлежит engine. UI отвечает за интерфейс и добавляет изображения только в docs/screenshots/. Роли команды и дедлайны — docs/status/META.md; подробный план — docs/PLAN.md.

Передача PM: docs/PM_HANDOFF.md. Числа и контракты оптимизатора: docs/ENGINE_RESULTS.md.

## A3 — готово 16:42

Engine реализовал POST /api/agent (explain/chat) с engineTools, executeTool, trace, 6 раундами инструментов и финальным ответом. LLM_BASE_URL/LLM_API_KEY/LLM_MODEL через fetch; таймаут 30 с. Без ключа/при сбое explain переиспользует buildFallbackAnalysis, chat возвращает find_best по умолчанию. Демо-вопросы — src/lib/agent/demo-questions.json. Проверено: 110 тестов, один production build; live LLM/UI не входили в этот прогон. E5/U7 done по подтверждению PM; U5 cut:timeline. UI U4/A4 подключают новый маршрут.
