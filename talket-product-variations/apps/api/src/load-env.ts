import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(): void {
  let dir = __dirname;

  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }

    const parent = resolve(dir, "..");
    if (parent === dir) return;
    dir = parent;
  }
}
