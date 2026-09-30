import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { archetypes, commands, commerceEvents, orderStates } from "./vocabulary";

test("archetypes stay the five allocation models", () => {
  assert.deepEqual(archetypes, [
    "quantity",
    "session-seat",
    "time-slot",
    "interval",
    "shipping",
  ]);
});

test("order states follow the shared lifecycle", () => {
  assert.deepEqual(orderStates, [
    "draft",
    "on-sale",
    "held",
    "sold",
    "fulfilled",
    "refunded",
    "settled",
  ]);
});

test("events and write commands stay explicit", () => {
  assert.deepEqual(commerceEvents, [
    "list",
    "hold",
    "release",
    "sell",
    "fulfill",
    "change",
    "refund",
    "settle",
  ]);
  assert.deepEqual(commands, ["hold", "confirm-sale", "change", "refund"]);
});

test("domain package does not depend on Nest or MySQL", () => {
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const names = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ];

  assert.equal(
    names.some((name) => name.startsWith("@nestjs") || name === "mysql2"),
    false,
  );
});
