import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@talket/contracts";
import { DatabaseService } from "../database/database.service";

@Controller()
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get("health")
  async health(): Promise<HealthResponse> {
    const databaseUp = await this.database.ping();
    return {
      ok: databaseUp,
      database: databaseUp ? "up" : "down",
    };
  }
}
