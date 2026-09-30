import { Module, OnModuleInit } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { ensureSchema } from "../database/schema";
import { QuantityController } from "./quantity.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [QuantityController],
})
export class QuantityModule implements OnModuleInit {
  constructor(private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await ensureSchema(this.database.pool);
  }
}
