import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ExecutionStatus, NodeType, Prisma, WorkflowStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ROUTING_KEYS } from '../rabbitmq/rabbitmq.constants';
import {
  CreateWorkflowDto,
  RunWorkflowDto,
  SaveGraphDto,
  UpdateWorkflowDto,
  WorkflowGraphDto,
} from './dto/workflow.dto';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly mq: RabbitMQService,
  ) {}

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------
  async list(userId: string, workspaceId: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.workflow.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { executions: true } } },
    });
  }

  async create(userId: string, workspaceId: string, dto: CreateWorkflowDto) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.workflow.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description ?? null,
        status: WorkflowStatus.DRAFT,
        versions: {
          create: { version: 1, graph: { nodes: [], edges: [] } as unknown as Prisma.InputJsonValue },
        },
      },
      include: { versions: true },
    });
  }

  async get(userId: string, workspaceId: string, id: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    const wf = await this.prisma.workflow.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1, include: { nodes: true, edges: true } },
        publishedVersion: { include: { nodes: true, edges: true } },
      },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
    return wf;
  }

  async update(userId: string, workspaceId: string, id: string, dto: UpdateWorkflowDto) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.workflow.update({
      where: { id },
      data: { name: dto.name, description: dto.description, status: dto.status },
    });
  }

  async remove(userId: string, workspaceId: string, id: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    await this.prisma.workflow.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  // --------------------------------------------------------------------------
  // Graph save + publish (versioned)
  // --------------------------------------------------------------------------
  async saveGraph(userId: string, workspaceId: string, id: string, dto: SaveGraphDto) {
    await this.workspaces.assertMember(userId, workspaceId);
    this.validateGraph(dto.graph);

    return this.prisma.$transaction(async (tx) => {
      const last = await tx.workflowVersion.findFirst({
        where: { workflowId: id },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (last?.version ?? 0) + 1;
      const version = await tx.workflowVersion.create({
        data: {
          workflowId: id,
          version: nextVersion,
          graph: dto.graph as unknown as Prisma.InputJsonValue,
          isPublished: !!dto.publish,
          nodes: {
            create: dto.graph.nodes.map((n) => ({
              nodeKey: n.id,
              type: n.type,
              config: n.config as Prisma.InputJsonValue,
              positionX: n.positionX,
              positionY: n.positionY,
            })),
          },
          edges: {
            create: dto.graph.edges.map((e) => ({
              sourceKey: e.source,
              targetKey: e.target,
              label: e.label ?? null,
            })),
          },
        },
      });

      if (dto.publish) {
        await tx.workflow.update({
          where: { id },
          data: { publishedVersionId: version.id, status: WorkflowStatus.ACTIVE },
        });
      }

      return version;
    });
  }

  // --------------------------------------------------------------------------
  // Execution: producer side. Workers actually run the nodes.
  // --------------------------------------------------------------------------
  async run(userId: string, workspaceId: string, id: string, dto: RunWorkflowDto) {
    await this.workspaces.assertMember(userId, workspaceId);
    const wf = await this.prisma.workflow.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { publishedVersion: { include: { nodes: true, edges: true } } },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
    const version = wf.publishedVersion;
    if (!version) throw new BadRequestException('Workflow has no published version. Save with publish=true first.');

    const execution = await this.prisma.workflowExecution.create({
      data: {
        workspaceId,
        workflowId: id,
        versionId: version.id,
        triggeredBy: `manual:${userId}`,
        status: ExecutionStatus.PENDING,
        input: (dto.input ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.mq.publish(ROUTING_KEYS.WORKFLOW_EXECUTE, {
      executionId: execution.id,
      workflowId: id,
      workspaceId,
    });

    return execution;
  }

  async listExecutions(userId: string, workspaceId: string, workflowId: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.workflowExecution.findMany({
      where: { workspaceId, workflowId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getExecution(userId: string, workspaceId: string, executionId: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    const exec = await this.prisma.workflowExecution.findFirst({
      where: { id: executionId, workspaceId },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });
    if (!exec) throw new NotFoundException('Execution not found');
    return exec;
  }

  // --------------------------------------------------------------------------
  // DAG validation + topological layering. Exported for the engine.
  // --------------------------------------------------------------------------
  validateGraph(graph: WorkflowGraphDto) {
    if (graph.nodes.length === 0) throw new BadRequestException('Graph must have at least one node');
    const ids = new Set(graph.nodes.map((n) => n.id));
    if (ids.size !== graph.nodes.length) throw new BadRequestException('Duplicate node ids');
    for (const e of graph.edges) {
      if (!ids.has(e.source)) throw new BadRequestException(`Edge source ${e.source} missing`);
      if (!ids.has(e.target)) throw new BadRequestException(`Edge target ${e.target} missing`);
    }
    const triggers = graph.nodes.filter((n) =>
      ([NodeType.TRIGGER_MANUAL, NodeType.TRIGGER_WEBHOOK, NodeType.TRIGGER_SCHEDULE] as NodeType[]).includes(n.type),
    );
    if (triggers.length === 0) throw new BadRequestException('Graph needs at least one trigger node');

    // Kahn's algorithm — detects cycles + gives us layers for the engine.
    const indegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const n of graph.nodes) {
      indegree.set(n.id, 0);
      adj.set(n.id, []);
    }
    for (const e of graph.edges) {
      adj.get(e.source)!.push(e.target);
      indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    }
    let visited = 0;
    const layers: string[][] = [];
    let frontier = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    while (frontier.length > 0) {
      layers.push(frontier);
      visited += frontier.length;
      const next: string[] = [];
      for (const id of frontier) {
        for (const child of adj.get(id) ?? []) {
          const d = (indegree.get(child) ?? 0) - 1;
          indegree.set(child, d);
          if (d === 0) next.push(child);
        }
      }
      frontier = next;
    }
    if (visited !== graph.nodes.length) {
      throw new BadRequestException('Graph contains a cycle');
    }
    return layers;
  }
}
