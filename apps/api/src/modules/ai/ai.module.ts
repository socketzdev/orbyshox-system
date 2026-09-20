import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { AiToolsService } from "./ai-tools.service";
import { GeminiService } from "./gemini.service";
import { AiConversationsService } from "./ai-conversations.service";
import { GymModule } from "../gym/gym.module";
import { ServiceOrdersModule } from "../service-orders/service-orders.module";

@Module({
  imports: [GymModule, ServiceOrdersModule],
  controllers: [AiController],
  providers: [AiService, AiToolsService, GeminiService, AiConversationsService],
  exports: [AiService, AiToolsService, AiConversationsService],
})
export class AiModule {}
