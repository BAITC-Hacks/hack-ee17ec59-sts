import type { ValidationError, ValidationErrorCode } from "@/lib/simulation";
import { CATEGORY_LABELS } from "@/lib/simulation/labels";

type ValidationSummaryProps = {
  errors: readonly ValidationError[];
  remainingCount: number;
  valid: boolean;
};

const SLOT_MESSAGES: Partial<Record<ValidationErrorCode, string>> = {
  "duplicate-measure": "Эта мера уже выбрана в другом слоте.",
  "district-required": "Выберите район для этой меры.",
  "district-not-allowed": "Для городской меры район не нужен.",
  incompatible: "Эта мера конфликтует с другой выбранной мерой.",
  "unknown-measure": "Выбранная мера не найдена.",
};

const measureForms: Record<Intl.LDMLPluralRule, string> = {
  zero: "мер",
  one: "меру",
  two: "меры",
  few: "меры",
  many: "мер",
  other: "мер",
};

export function remainingMeasuresHint(count: number): string {
  const form = measureForms[new Intl.PluralRules("ru").select(count)];
  return `Выберите ещё ${count} ${form}`;
}

export function validationMessage(error: ValidationError): string {
  if (error.code === "category-limit") {
    const category = Object.keys(CATEGORY_LABELS).find((key) => error.message.includes(key));
    if (category) {
      return error.message.replace(category, CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]);
    }
  }
  return error.message;
}

export function slotValidationMessage(error: ValidationError): string {
  return SLOT_MESSAGES[error.code] ?? validationMessage(error);
}

export function ValidationSummary({ errors, remainingCount, valid }: ValidationSummaryProps) {
  return (
    <div className="mt-4 space-y-3" aria-live="polite">
      {remainingCount > 0 && (
        <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {remainingMeasuresHint(remainingCount)}
        </p>
      )}
      {errors.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
          <p className="font-semibold">Проверьте сценарий:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {errors.map((error, index) => (
              <li key={`${error.code}-${index}`}>{validationMessage(error)}</li>
            ))}
          </ul>
        </div>
      )}
      {valid && <p className="text-sm font-medium text-emerald-700">Сценарий готов к расчёту.</p>}
    </div>
  );
}
