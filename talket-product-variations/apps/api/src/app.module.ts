import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { CommerceModule } from "./commerce/commerce.module";

@Module({
  imports: [DatabaseModule, CommerceModule],
  controllers: [HealthController],
})
export class AppModule {}
