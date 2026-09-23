Актуальный план — docs/PLAN.md, статус — npm run status

# E3/E4: результаты и контракт для AI/UI

Проверено 2026-09-23 на текущих data/*.json. 694395 валидных сценариев.
Холодный enumerateValid: 2.12 с на этой Windows-машине (Node 22.23.2),
включая материализацию результата. E3 отдельно измерен в 2.29 с.
Результат и рейтинг мемоизированы на время жизни серверного модуля.
Кэш-файл/precompute не нужен: порог <5 с пройден.

Воспроизвести числа и проверить контракт:
`npm test -- tests/optimizer.test.ts --disableConsoleIntercept`.

## Топ-3

Районные меры во всех трёх наборах размещены в Нуре; M2/M12/M14 — городские.

| Меры | Стоимость | Score | D_min | N_crit |
|---|---:|---:|---:|---:|
| M2, M3, M8, M9, M14 | 98 | 57.236735 | 54.091250 | 0 |
| M3, M4, M8, M9, M14 | 91 | 57.225545 | 54.781250 | 0 |
| M3, M7, M8, M10, M12 | 100 | 57.205560 | 54.982500 | 0 |

## Парето, step=5

| Лимит бюджета | Стоимость | Лучший Score | Меры |
|---|---:|---:|---|
| 40–60 | — | нет валидных наборов | — |
| 65 | 62 | 55.788575 | M9, M10, M11, M12, M14 |
| 70 | 68 | 56.673465 | M8, M9, M10, M11, M14 |
| 75 | 72 | 56.867885 | M8, M9, M10, M12, M14 |
| 80 | 72 | 56.867885 | M8, M9, M10, M12, M14 |
| 85 | 83 | 56.895805 | M2, M4, M8, M9, M14 |
| 90 | 88 | 57.188465 | M3, M8, M9, M10, M14 |
| 95 | 91 | 57.225545 | M3, M4, M8, M9, M14 |
| 100 | 98 | 57.236735 | M2, M3, M8, M9, M14 |

Все районные меры в этих точках — Нура. Составы и значения получены перебором,
а не захардкожены в движке. Для бюджета 61 уже есть валидный набор; сетка step=5
показывает первую достижимую точку на 65. Недостижимые бюджеты пропускаются.

## Подключение

Единая точка: `src/lib/simulation/index.ts` (`@/lib/simulation`).
API routes — зона ai; engine их не создаёт. Поиск/советы вызываются на сервере
в Route Handler или серверном инструменте агента; клиент обращается к API.
Импорт не запускает перебор. Прямой вызов оптимизатора в браузере запрещён.

- `enumerateValid()` → неизменяемый мемоизированный массив
  `{scenario, score, cost, dMin, minDistrict, nCrit}`.
- `findBest(topN=10, constraints={})` → лучшие записи того же формата, сортировка
  Score по убыванию, затем стоимость по возрастанию. Нет совпадений → `[]`.
  Ограничения: `budgetMax`, `mustInclude: string[]`, `exclude: string[]`,
  `mustIncludePlaced: {id, district}[]`, `avoidDistricts: DistrictId[]`,
  `minDistrictScore: number` (нижняя граница D каждого района).
- `suggestSwaps(scenario, k=3)` → `{swaps, gapToOptimum, currentScore}`.
  В swaps только валидные улучшения одной меры/её района; у каждого scenario,
  score, scoreDelta, budget, replacedMeasureId/replacedDistrictId,
  addedMeasureId/addedDistrictId. Невалидный вход → пустые swaps и null для чисел.
- `pareto(step=5)` → `{budget, score, cost, scenario}[]`; step — положительное
  целое; сетка начинается с 40 и обязательно включает 100. Недостижимые бюджеты
  пропущены; неверный step → RangeError (проверить в API).
- `timeline(scenario)` → `{valid:true, quarters, score, dAvg, dMin, byMeasure, baseScore}`;
  невалидный вход → `{valid:false, errors}`. Массивы индексированы q=0…8,
  byMeasure[id][q] — доля `max(0,q−lag)/8`. Синергия включается после обоих лагов.
  Пустой сценарий даёт постоянный baseline. `evaluate` — алиас simulateScenario;
  evaluate и timeline используют общий applyScenarioEffects(shareFn) и scoreIndicators.

Передавая найденный сценарий в изменяемую форму UI, скопируйте его (`structuredClone`):
результаты поиска заморожены, чтобы потребитель не повредил общий серверный кэш.

## E3b: худший и перцентиль

Худший: M8 Байконур, M9 Байконур, M10 Байконур, M11 Алматы,
M13 Байконур. Cost 80, Score 52.04091625, D_min 49.18 (Нура), N_crit 3.
Эталонный пример: rank 566 из 694395, percentile 99.9184901965%.

`findWorst(topN=1, constraints?)` использует те же ограничения, что findBest;
сортировка: Score ↑, cost ↑, затем ID мер и районы в каноническом порядке.
`scoreRank(scenario)` делает бинарный поиск по мемоизированным скорам;
возвращает {rank, total, percentile}, невалидный ввод — {error}.
Перцентиль — процент строго худших наборов; равные не считаются худшими.
Для равных Score ранг одинаков: 1 + число лучших, крайние группы закреплены
за 1 (лучшие) и total (худшие). Допуск 1e-10 убирает шум сложения float,
внутренний Score не округляется. При перестановке решений ранг не меняется.
Экспорт: src/lib/simulation/index.ts; UI вызывает поиск через серверный API.

## E3c: инструменты AI

`import { engineTools, executeTool } from '@/lib/simulation/tools'`.
engineTools — формат **Chat Completions** (`{type:'function', function:{name,description,parameters,strict:false}}`),
совместимый с текущим SDK/route. Схемы генерируются из того же Zod, которым
executeTool валидирует вызов. Формат сверён с [OpenAI Docs](https://developers.openai.com/api/docs/guides/function-calling).
Для Responses API нужен адаптер: `engineTools.map(t => ({type:t.type, ...t.function}))`.

Вызовы: evaluate_scenario, validate_scenario, find_best, find_worst,
suggest_swaps, pareto, timeline, score_rank. Сценарий передаётся в поле scenario;
поиск — {topN?, constraints?}, Парето — {step?}, замены — {scenario, k?}.
executeTool принимает объект или JSON-строку из tool_call.function.arguments.
Отправлять результат в tool message через JSON.stringify(result).

find_best: по умолчанию 5 записей, максимум 10; find_worst: по умолчанию 1.
Числа только в ответах инструментов округлены до 2 знаков; кэш не меняется.
Timeline содержит только score[0…8] и byMeasure. Pareto — budget/score/cost;
без многократного повторения составов. Для нужного бюджета вызовите find_best.
Ошибочные аргументы/неизвестный инструмент возвращают {error} по-русски;
validate_scenario при корректных аргументах возвращает доменные valid/errors.
Реальный сетевой LLM-запрос не требуется для проверки этих локальных tools.
