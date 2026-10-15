import { Module, OnModuleInit } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { ensureSchema } from "../database/schema";
import { CommerceController } from "./commerce.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [CommerceController],
})
export class CommerceModule implements OnModuleInit {
  constructor(private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await ensureSchema(this.database.pool);
  }
}
