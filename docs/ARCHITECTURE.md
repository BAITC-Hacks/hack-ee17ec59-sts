# Архитектура MVP

## 1 Решение

Один Next.js проект содержит UI, детерминированный симулятор и серверный AI endpoint. Расчет работает без сети; сеть требуется только для дополнительного объяснения.

```text
Scenario Builder
      |
      v
validateScenario ---- invalid ---> Validation UI
      |
    valid
      v
simulateScenario
      |
      +----> Results UI
      |
      +----> POST /api/analyze ----> OpenAI
                    |
                    +---- error ----> deterministic fallback
```

## 2 Структура проекта

```text
src/
  app/
    api/
      analyze/
        route.ts
    layout.tsx
    page.tsx
    globals.css
  components/
    scenario/
      ScenarioBuilder.tsx
      DecisionSlot.tsx
      BudgetMeter.tsx
      ValidationSummary.tsx
    results/
      ResultsDashboard.tsx
      ScoreHero.tsx
      DistrictComparison.tsx
      CriticalIndicators.tsx
      MayorBrief.tsx
  lib/
    simulation/
      data.ts
      types.ts
      validate.ts
      simulate.ts
      explainFallback.ts
      scenarios.ts
  schemas/
    analysis.ts
```

Фактическая структура может быть упрощена, но граница между UI, расчетом и AI должна сохраниться.

## 3 Основные типы

```ts
type DistrictId = "yesil" | "almaty" | "saryarka" | "baikonur" | "nura";

type Category =
  | "transport"
  | "ecology"
  | "social"
  | "safety"
  | "services";

type IndicatorId =
  | "T1" | "T2"
  | "E1" | "E2"
  | "S1" | "S2"
  | "B1" | "B2"
  | "C1" | "C2";

type Decision = {
  measureId: string;
  districtId?: DistrictId;
};

type ScenarioInput = {
  decisions: Decision[];
};
```

`Measure` должен содержать ID, название, категорию, scope, стоимость, лаг и таблицу эффектов. `District` должен содержать долю населения и исходные показатели.

## 4 Результат симуляции

```ts
type SimulationResult = {
  valid: true;
  budget: {
    limit: number;
    used: number;
    remaining: number;
  };
  baselineScore: number;
  score: number;
  scoreDelta: number;
  cityAverageBefore: number;
  cityAverageAfter: number;
  weakestDistrictBefore: DistrictId;
  weakestDistrictAfter: DistrictId;
  districts: Array<{
    id: DistrictId;
    scoreBefore: number;
    scoreAfter: number;
    scoreDelta: number;
    indicatorsBefore: Record<IndicatorId, number>;
    indicatorsAfter: Record<IndicatorId, number>;
    indicatorDeltas: Partial<Record<IndicatorId, number>>;
  }>;
  criticalIndicators: Array<{
    districtId: DistrictId;
    indicatorId: IndicatorId;
    value: number;
  }>;
  activatedSynergies: string[];
  contributions: Array<{
    measureId: string;
    districtId?: DistrictId;
    realizedEffects: Partial<Record<IndicatorId, number>>;
  }>;
};
```

Невалидный сценарий возвращается отдельным типом:

```ts
type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };
```

## 5 AI контракт

Запрос:

```ts
type AnalysisRequest = {
  scenario: ScenarioInput;
  result: SimulationResult;
  nearbyAlternatives?: SimulationResult[];
};
```

Ответ:

```ts
type AnalysisResponse = {
  executiveSummary: string;
  strengths: string[];
  tradeoffs: string[];
  risks: string[];
  weakestDistrictInsight: string;
  recommendation: string;
  source: "openai" | "fallback";
};
```

Route handler проверяет вход и выход Zod схемой. При ошибке сети, таймауте или невалидном ответе возвращается `source: "fallback"`.

## 6 Prompt contract

System prompt должен содержать следующие ограничения:

- Ты городской policy analyst.
- Используй только предоставленный JSON.
- Не пересчитывай и не изменяй Score.
- Не придумывай эффекты, меры или районы.
- Все утверждения о числах должны совпадать с JSON.
- Объясни пользу, риск, самый слабый район и один следующий шаг.
- Верни только JSON заданной схемы.

В prompt не нужно передавать полный исходный каталог, если все необходимые эффекты уже находятся в результате.

## 7 Состояние интерфейса

Сценарий хранится в React state. После изменения решения старый результат помечается устаревшим или скрывается. Расчет выполняется синхронно, затем AI explanation загружается отдельно. Пользователь сначала видит Score, не ожидая OpenAI.

## 8 Ошибки

- Ошибка валидации: объяснить правило и не вызывать симуляцию.
- Ошибка расчета: показать безопасное общее сообщение и записать подробность в console для разработки.
- Ошибка AI: показать fallback без красного аварийного экрана.
- Отсутствие ключа: сразу использовать fallback.

## 9 Необходимые проверки

- Сумма весов индикаторов равна 1.
- Сумма долей населения равна 1.
- Baseline равен 52.56 с погрешностью не более 0.01.
- Эталонный сценарий стоит 95 и дает примерно 56.5.
- Отрицательный эффект M11 корректно уменьшает T1.
- Значения clipping ограничиваются 0 и 100.
- Синергия не масштабируется лагом.
- Районные конфликты проверяются по району, M1/M3 глобально.

## 10 Деплой и секреты

- `OPENAI_API_KEY` доступен только серверу.
- `.env.local` находится в `.gitignore`.
- `.env.example` содержит пустое имя переменной и описание.
- Если выполняется Vercel deploy, переменная задается в настройках проекта.
- README содержит точную версию Node и команды `npm install`, `npm run dev`, `npm run build`.
