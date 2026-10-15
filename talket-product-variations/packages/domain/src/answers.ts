export type AnswerField = {
  id: string;
  required: boolean;
  minLength: number;
  maxLength: number;
  scope: "line" | "unit";
};

export type AnswerInput = {
  fieldId: string;
  unitIndex: number;
  value: string;
};

export type AnswerFailure = {
  ok: false;
  reason: "missing-answer" | "invalid-answer";
};

/** 직접입력은 재고 키가 아니다. 홀드 전에 칸 규칙만 본다. */
export function validateAnswers(
  fields: AnswerField[],
  answers: AnswerInput[],
  quantity: number,
): { ok: true } | AnswerFailure {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return { ok: false, reason: "invalid-answer" };
  }

  for (const answer of answers) {
    const field = fields.find((item) => item.id === answer.fieldId);
    if (!field || !Number.isSafeInteger(answer.unitIndex)) return { ok: false, reason: "invalid-answer" };
    if (field.scope === "line" && answer.unitIndex !== 0) return { ok: false, reason: "invalid-answer" };
    if (field.scope === "unit" && (answer.unitIndex < 0 || answer.unitIndex >= quantity)) {
      return { ok: false, reason: "invalid-answer" };
    }
  }

  for (const field of fields) {
    const indexes = field.scope === "line" ? [0] : Array.from({ length: quantity }, (_, index) => index);
    for (const index of indexes) {
      const matched = answers.filter((answer) => answer.fieldId === field.id && answer.unitIndex === index);
      if (matched.length > 1) return { ok: false, reason: "invalid-answer" };
      const value = matched[0]?.value.trim() ?? "";
      if (value.length === 0) {
        if (field.required) return { ok: false, reason: "missing-answer" };
        continue;
      }
      if (value.length < field.minLength || value.length > field.maxLength) {
        return { ok: false, reason: "invalid-answer" };
      }
    }
  }

  return { ok: true };
}
