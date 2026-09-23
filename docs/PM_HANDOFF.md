Актуальный план — docs/PLAN.md, статус — npm run status

# Передача PM — TS-only, 2026-09-23

## Решение принято
Единственная архитектура — Next.js/TypeScript. Python-код и Streamlit удалены из репозитория. data/*.json — единственный источник данных, data/geo/ сохранён для будущей React-карты.

## Этап и готовый MVP
В main есть пять решений, бюджет, валидация, детерминированный Score, районные результаты, синергии, API AI-объяснения и fallback. Числа считает src/lib/simulation; AI находится в src/lib/analysis.ts и src/app/api/analyze/route.ts. UI — src/components/scenario и src/components/results.
Vitest проверяет пустой baseline (Score 52.56, D_avg 56.86, N_crit 2), пример (cost 95, Score 56.54 ±0.01), правила валидации и fallback. Пустой ввод разрешён в расчёте baseline, но пользовательский validateScenario требует пять решений.
Новый lint использует ESLint CLI, pre-push выполняет lint и Vitest; npm run status работает на Node без внешних зависимостей.

## Следующие задачи
- engine: E3/E4 done (694395 сценариев, 2.12 с, все ограничения/Парето/таймлайн). E3b/E3c тоже done: findWorst, scoreRank и engineTools/executeTool. U6/R1 переданы engine; Docker smoke ожидает доступную машину, чистый прогон репетируется сейчас. E5 и весь фронт — ui. API и UI подключают экспорты из src/lib/simulation/index.ts; контракт и таблицы — docs/ENGINE_RESULTS.md. Геоданные уже есть; Алматы схематичный, предупреждение обязательно.
- ai: A3 агент explain/chat с tool calling ≤6 итераций, answer/trace, LLM_BASE_URL/LLM_API_KEY/LLM_MODEL и demo_questions.json; A4 тюнинг. Сейчас работает только анализ JSON через OPENAI_API_KEY и fallback; полноценного агента ещё нет.
- ui: U4 AI с trace, U5 Парето/Таймлайн, E5/U7 карта, U8 финальный README; R2 репетиция. U6/R1 теперь engine.

## Контрольные точки и действия PM
Синк 16:20, интеграция 16:50–17:00, фриз 17:20, конец 18:00. START=14:00 сохранён в docs/status/META.md; PM нужно подтвердить владельцев ai/ui вместо «Игрок 2/3». Распределить будущие задачи по реальным путям из AGENTS.md.
Доска отражает завершённый базовый MVP отдельно от оставшихся фич; процент — доля уникальных тикетов, не оценка качества продукта. Общие задачи считаются done после подтверждения всех зон.
E6 уже cut. Порядок урезания: таймлайн → Парето → карта. Если E4 не готов к 16:20 — оставляем только Парето. README начать сейчас, финал 17:45. Агент, README, Docker не режем.

## Проверки
Команды приёмки: npm run lint, npm test, npm run build, npm run status. Проверено: lint и build зелёные; Vitest — 62 passed, доска работает. S2 done. Закрыто 16/29 уникальных тикетов (55.2%); это доля задач, не процент готовности продукта. Реальный API с ключом и чистый Docker-прогон остаются отдельными проверками.

suggestSwaps теперь учитывает замену меры и перенос района, возвращает {swaps, gapToOptimum, currentScore}; полный перебор и мемоизация реализованы в optimizer.ts. Новый UI использует DecisionSlot/MeasureDetails и русские подписи.

U6: Dockerfiles/Compose/standalone готовы; локально GET / и static JS HTTP 200. Docker CLI отсутствует — compose build/up/down не проверены, U6 review. Репетиция R1 в чистом Git-клоне прошла: npm ci 45.37 с, lint 87.97 с, 62 теста 19.28 с, build 65.06 с (всего 217.73 с, Node 22.23.2). Финальный прогон после фриза остаётся открытым. ../clean-check оставлен: автоматическая проверка отклонила удаление (blocked by policy).

При финальной синхронизации получен E3a коллег: проверенный совет с Apply/Undo и /api/advice. Его код и статус сохранены; отчёт чистого клона выше относится к состоянию U6 до этого входящего коммита. После интеграции: 92 теста и standalone build прошли; /api/advice и /api/analyze собраны. Для полного прогона тестов настроены последовательные файлы и таймаут 15 с (поиск + сортировка + assertions).
