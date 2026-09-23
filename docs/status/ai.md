# Статус: ai

| ID | Задача | Дедлайн | Статус | Начато | Готово | Комментарий |
|---|---|---|---|---|---|---|
| A1 | Next Route Handler POST /api/analyze: рассчитанный JSON → AI brief | 15:00 | done | — | 15:09 | Готовый MVP; перенесено в TS-план по решению PM. |
| A2 | Детерминированный fallback без LLM-ключа | 15:30 | done | — | 15:09 | Готовый MVP; перенесено в TS-план по решению PM. |
| I1 | ИНТЕГРАЦИЯ расширенного демо на одной машине, окно 16:50–17:00 | 17:00 | todo | — | — |  |
| A4 | Подключение агента к UI + тюнинг промптов на демо-вопросах | 16:50 | todo | — | — |  |
| F0 | ФРИЗ КОДА: после 17:20 только README (engine) и скриншоты в docs/screenshots/ (ui) | 17:20 | todo | — | — |  |
| R2 | Репетиция демо | 17:55 | todo | — | — |  |

A3 → engine, done (начато 16:35, готово 16:42), по решению PM; актуальная строка — docs/status/engine.md.

Для U4: POST /api/agent, body {mode, message, scenario} → {answer, trace, mode}; демо-вопросы — src/lib/agent/demo-questions.json
