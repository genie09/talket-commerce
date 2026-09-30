import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { QuantityModule } from "./quantity/quantity.module";

@Module({
  imports: [DatabaseModule, QuantityModule],
  controllers: [HealthController],
})
export class AppModule {}
