import type { HealthResponse } from "@talket/contracts";
import { QuantityConsole } from "./quantity-console";

export const dynamic = "force-dynamic";

type HealthResult = { health: HealthResponse } | { message: string };

async function loadHealth(): Promise<HealthResult> {
  try {
    const response = await fetch("http://127.0.0.1:3001/health", { cache: "no-store" });
    if (!response.ok) return { message: `HTTP ${response.status}` };
    return { health: (await response.json()) as HealthResponse };
  } catch (error) {
    const message = error instanceof Error ? error.message : "연결 실패";
    return { message };
  }
}

export default async function HomePage() {
  const result = await loadHealth();
  const summary =
    "health" in result
      ? result.health.database === "up"
        ? "MySQL 연결됨"
        : "MySQL 연결 안 됨"
      : "API에 연결하지 못했습니다";

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">운영 콘솔</p>
        <h1 className="text-3xl font-semibold tracking-tight">{summary}</h1>
      </div>
      {"health" in result ? (
        <dl className="divide-y rounded-xl border text-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-muted-foreground">database</dt>
            <dd className="font-mono">{result.health.database}</dd>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-muted-foreground">ok</dt>
            <dd className="font-mono">{result.health.ok ? "true" : "false"}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{result.message}</p>
      )}
      <QuantityConsole />
    </main>
  );
}
