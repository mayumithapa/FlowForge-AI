/**
 * Seed script: creates a demo workspace + user + a starter workflow + a few
 * leads so the dashboard isn't empty on first boot.
 *
 *   npm --workspace backend run seed
 */

import { PrismaClient, NodeType, WorkflowStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'demo@flowforge.dev';
  const password = 'demo1234';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Seed: demo user already exists (${email})`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      fullName: 'Demo Owner',
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: 'Demo Workspace',
      slug: 'demo-workspace',
      ownerId: user.id,
      members: { create: { userId: user.id, role: 'OWNER' } },
    },
  });

  const version = await prisma.workflowVersion.create({
    data: {
      version: 1,
      isPublished: true,
      graph: {
        nodes: [
          { id: 'trigger', type: 'TRIGGER_MANUAL', config: {}, positionX: 0, positionY: 0 },
          { id: 'classify', type: 'AI_CLASSIFY', config: { categories: ['hot', 'warm', 'cold'] }, positionX: 250, positionY: 0 },
          { id: 'genemail', type: 'AI_GENERATE_EMAIL', config: { tone: 'friendly', goal: 'invite to demo' }, positionX: 500, positionY: 0 },
          { id: 'send', type: 'EMAIL_SEND', config: {}, positionX: 750, positionY: 0 },
          { id: 'updlead', type: 'DB_UPDATE_LEAD', config: { status: 'CONTACTED' }, positionX: 1000, positionY: 0 },
        ],
        edges: [
          { source: 'trigger', target: 'classify' },
          { source: 'classify', target: 'genemail' },
          { source: 'genemail', target: 'send' },
          { source: 'send', target: 'updlead' },
        ],
      } as any,
      workflow: {
        create: {
          workspaceId: workspace.id,
          name: 'Demo: Classify → Email',
          description: 'Manual trigger → AI classify → AI email → Send → Update lead.',
          status: WorkflowStatus.ACTIVE,
        },
      },
      nodes: {
        create: [
          { nodeKey: 'trigger', type: NodeType.TRIGGER_MANUAL, config: {}, positionX: 0, positionY: 0 },
          { nodeKey: 'classify', type: NodeType.AI_CLASSIFY, config: { categories: ['hot', 'warm', 'cold'] }, positionX: 250, positionY: 0 },
          { nodeKey: 'genemail', type: NodeType.AI_GENERATE_EMAIL, config: { tone: 'friendly', goal: 'invite to demo' }, positionX: 500, positionY: 0 },
          { nodeKey: 'send', type: NodeType.EMAIL_SEND, config: {}, positionX: 750, positionY: 0 },
          { nodeKey: 'updlead', type: NodeType.DB_UPDATE_LEAD, config: { status: 'CONTACTED' }, positionX: 1000, positionY: 0 },
        ],
      },
      edges: {
        create: [
          { sourceKey: 'trigger', targetKey: 'classify' },
          { sourceKey: 'classify', targetKey: 'genemail' },
          { sourceKey: 'genemail', targetKey: 'send' },
          { sourceKey: 'send', targetKey: 'updlead' },
        ],
      },
    },
    include: { workflow: true },
  });

  await prisma.workflow.update({
    where: { id: version.workflow.id },
    data: { publishedVersionId: version.id },
  });

  await prisma.lead.createMany({
    data: [
      { workspaceId: workspace.id, email: 'sara@acme.io', fullName: 'Sara Patel', company: 'Acme', source: 'seed' },
      { workspaceId: workspace.id, email: 'leo@globex.com', fullName: 'Leo Wang', company: 'Globex', source: 'seed' },
      { workspaceId: workspace.id, email: 'maya@initech.com', fullName: 'Maya Singh', company: 'Initech', source: 'seed' },
    ],
  });

  console.log('Seed complete.');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
