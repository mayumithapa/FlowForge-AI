import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [WebhooksModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowEngineService],
  exports: [WorkflowService, WorkflowEngineService],
})
export class WorkflowModule {}
