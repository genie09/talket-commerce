import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAnswers, type AnswerField } from "./answers";

const engraving: AnswerField = {
  id: "engraving",
  required: false,
  minLength: 0,
  maxLength: 20,
  scope: "line",
};

const numberField: AnswerField = {
  id: "number",
  required: true,
  minLength: 1,
  maxLength: 4,
  scope: "unit",
};

test("a line answer is accepted without looking at stock", () => {
  assert.deepEqual(
    validateAnswers([engraving], [{ fieldId: "engraving", unitIndex: 0, value: "7" }], 3),
    { ok: true },
  );
});

test("a missing required answer per unit is rejected", () => {
  assert.deepEqual(
    validateAnswers([numberField], [{ fieldId: "number", unitIndex: 0, value: "7" }], 2),
    { ok: false, reason: "missing-answer" },
  );
});

test("an answer for an unknown field is rejected", () => {
  assert.deepEqual(
    validateAnswers([], [{ fieldId: "engraving", unitIndex: 0, value: "7" }], 1),
    { ok: false, reason: "invalid-answer" },
  );
});
