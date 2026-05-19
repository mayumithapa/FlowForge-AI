# FlowForge AI

A production-shape AI workflow automation platform — think Zapier / n8n with AI
nodes baked in. Build flows visually, classify leads, generate personalized
emails, send them at scale, and watch it all happen in real time.

```
                  +-----------+         +-----------+         +-----------+
       HTTP       |  NestJS   |   AMQP  | RabbitMQ  |  AMQP   |  Worker   |
   React (Vite) ->|  backend  | ------> |  topology | ------> |  (NestJS) |
                  +-----+-----+         +-----------+         +-----+-----+
                        |                                           |
                        |          +-------------+                  |
                        +--------->| PostgreSQL  |<-----------------+
                        |          | (Prisma)    |
                        |          +-------------+
                        |          +-------------+
                        +--------->|   Redis     | (rate-limit, cache)
                                   +-------------+
```

## What's inside

| Service    | Stack                                                       |
| ---------- | ----------------------------------------------------------- |
| `backend`  | NestJS, Prisma, Postgres, JWT auth (access + refresh), Swagger |
| `worker`   | NestJS app context, RabbitMQ consumers, workflow engine     |
| `frontend` | React + Vite + Tailwind + shadcn-style UI, Zustand, React Flow |
| `docker`   | Compose for `postgres / redis / rabbitmq / backend / worker / frontend` |

## Quick start (Docker)

```bash
cp .env.example .env
# (optional) put your real OPENAI_API_KEY in .env
docker compose -f docker/docker-compose.yml up --build
```

Then visit:

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:4000/api>
- Swagger: <http://localhost:4000/api/docs>
- RabbitMQ management: <http://localhost:15672> (flowforge / flowforge)

Seed a demo account (after the backend boots once):

```bash
docker compose -f docker/docker-compose.yml exec backend npx prisma db seed
# demo@flowforge.dev / demo1234
```

## Quick start (local dev)

```bash
cp .env.example backend/.env
cp .env.example worker/.env

# Spin only the infra
docker compose -f docker/docker-compose.yml up -d postgres redis rabbitmq

# Backend
cd backend
npm install
npx prisma migrate dev --name init
npm run seed
npm run start:dev

# Worker (separate terminal)
cd worker
npm install
npm run start:dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## The MVP flow (already wired end-to-end)

1. **Register** at `/register` — a workspace is created automatically.
2. **Workflows → New** → open the builder.
3. Drag in `Trigger → AI Classify → AI Generate Email → Send Email → Update Lead`.
4. Save & publish.
5. **Leads → Import CSV** (`email,fullName,company`) and pick the published
   workflow as the trigger.
6. The backend pushes one `workflow.execute.start` per lead onto RabbitMQ; the
   worker runs the DAG, calls OpenAI (or the offline mock when no key), queues
   `email.send`, the email consumer "delivers" it, then `DB_UPDATE_LEAD` flips
   the lead's status.
7. **Dashboard** and **Analytics** show live execution counts, success rate,
   queue depth, and email metrics.

## Database (Phase 1)

See [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma).

### Entities

`User`, `RefreshToken`, `Workspace`, `WorkspaceMember`, `Workflow`,
`WorkflowVersion`, `WorkflowNode`, `WorkflowEdge`, `WorkflowExecution`,
`ExecutionStep`, `Lead`, `EmailTemplate`, `Campaign`, `EmailMessage`,
`AnalyticsEvent`, `JobLog`.

### ERD in plain English

- A `User` belongs to one or more `Workspaces` via `WorkspaceMember`.
- A `Workspace` owns all domain rows (`Workflow`, `Lead`, `Campaign`, etc.) —
  multi-tenant by design.
- A `Workflow` has many `WorkflowVersion`s; only one is "published" at a time.
  Nodes + edges are normalized rows on the version, plus a JSON snapshot of the
  graph for cheap reads.
- A `WorkflowExecution` is an append-only event log with child
  `ExecutionStep`s (one per node).
- `Lead` ⇄ `EmailMessage` for outreach history. `Campaign` fans out a workflow
  across many leads.
- `JobLog` records every queue job (id, attempts, idempotency key, result) for
  observability + retry policy.

### Indexing & soft-delete

- UUID PKs everywhere (`@db.Uuid`).
- `createdAt` + `updatedAt` on every table. `deletedAt` for soft-delete on
  `User`, `Workspace`, `Workflow`, `Lead`, `EmailTemplate`, `Campaign`.
- Compound indexes on `(workspaceId, status)` and `(workspaceId, createdAt)`
  for tenant-scoped queries.
- Unique constraints on `User.email`, `(workspaceId, leadEmail)`,
  `(workflowId, version)`, `JobLog.idempotencyKey`.
- Heavy read-path collections (`Lead`, `WorkflowExecution`) get range indexes
  on `createdAt` to support timeseries dashboards.

### Scaling notes

- **Read replicas**: every query is workspace-scoped so a read replica per
  region is straightforward. Use Prisma's `$extends` to route reads.
- **Partitioning**: `WorkflowExecution`, `ExecutionStep`, `EmailMessage`,
  `AnalyticsEvent` are append-heavy; partition by `createdAt` (monthly) once
  individual tables pass ~50M rows.
- **Hot data in Redis**: workspace summary tiles, lead counts, and the AI rate
  limiter live in Redis.
- **Outbox pattern**: producers write to `JobLog` in the same transaction as
  the domain change, then publish to RabbitMQ. The `idempotencyKey` lets the
  worker dedupe redeliveries.

## Backend (Phase 2)

Modules (all under `backend/src`):

| Module       | Responsibility                                                  |
| ------------ | --------------------------------------------------------------- |
| `auth`       | Register/login/refresh/logout, JWT + hashed refresh tokens, guards |
| `users`      | Profile, memberships                                            |
| `workspace`  | Tenancy guard (`assertMember`), list/get                        |
| `workflow`   | CRUD + versioned graph save/publish + execution producer        |
| `leads`      | Lead CRUD, CSV import, optional workflow trigger                |
| `email`      | Templates, queued message send, message log                     |
| `campaign`   | Fan-out a workflow to a list of leads                           |
| `ai`         | OpenAI facade: classify, sentiment, summarize, generate-email   |
| `queue`      | Queue stats + DLQ inspection                                    |
| `analytics`  | Workspace summary + execution timeseries                        |
| `prisma`     | Global Prisma client (with soft-delete helper)                  |
| `redis`      | Global ioredis client + JSON helpers + rate-limit counter       |
| `rabbitmq`   | Topology setup (exchanges, queues, DLQ), `publish` + `consume`  |
| `health`     | `/api/health` for compose health checks                         |

The same Nest providers are reused by the `worker` service via direct file
imports, so there's a single source of truth for `PrismaService`,
`AiService`, etc.

## Workflow engine (Phase 3)

See [`backend/src/workflow/workflow-engine.service.ts`](backend/src/workflow/workflow-engine.service.ts).

- Loads the published `WorkflowVersion`'s nodes & edges.
- Topo-sorts via Kahn's algorithm. Cycles fail validation up-front in
  `WorkflowService.validateGraph`.
- Persists every step into `ExecutionStep` for full audit + replay.
- Node implementations cover triggers, AI (4 kinds), email send, DB update,
  analytics, condition, delay.
- Execution-level retries piggy-back on RabbitMQ's redelivery with
  exponential backoff. Step-level errors fail the execution; per-attempt state
  lives in `ExecutionStep.attempt`.

## AI (Phase 4)

See [`backend/src/ai`](backend/src/ai).

- Centralised prompt templates in `prompts.ts` — single place to version them.
- OpenAI client with `response_format: json_object` for structured output.
- 3× retries on 429/5xx with exponential backoff.
- Per-workspace token-bucket rate limit in Redis
  (`AI_RATE_LIMIT_PER_MIN`, default 60/min).
- Token usage logged to `JobLog` for billing/cost analytics later.
- **Offline mock mode**: if `OPENAI_API_KEY` is missing the service still
  returns plausible JSON, so the MVP demo runs without an API key.

## Queue system (Phase 5)

Topology (`backend/src/rabbitmq/rabbitmq.constants.ts`):

```
exchange  flowforge.events    (topic, durable)
exchange  flowforge.dlx       (topic, durable)

queue     workflow.execute    binds  workflow.execute.*
queue     workflow.step       binds  workflow.step.*
queue     ai.process          binds  ai.*
queue     email.send          binds  email.send
queue     analytics.record    binds  analytics.*

every queue has x-dead-letter-exchange=flowforge.dlx
+ a parallel <queue>.dlq for inspection / replay
```

Reliability:

- Persistent messages, durable queues + exchanges.
- Idempotency key per message (`x-idempotency-key` header + `JobLog`).
- Configurable max attempts; failures past the limit are DLQ'd.
- Exponential backoff between retries (`min(60s, 2^attempt * 1s)`).
- Worker prefetch governed by `WORKER_CONCURRENCY`.
- Survives broker restarts: connections + channels auto-reconnect with a 5s
  backoff and reassert the topology.

## Frontend (Phase 6)

Pages:

| Route             | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `/login`          | Email/password login                                  |
| `/register`       | Create account + workspace                            |
| `/dashboard`      | Summary tiles + executions chart                      |
| `/workflows`      | List + create workflows                               |
| `/workflows/:id`  | **React Flow** drag-drop builder + run               |
| `/leads`          | CSV import, AI enrichments, search                    |
| `/templates`      | Email template CRUD                                   |
| `/campaigns`      | Create + launch fan-out campaigns                     |
| `/analytics`      | Execution timeseries + queue depth                    |
| `/settings`       | Profile + workspaces                                  |

Uses Tailwind tokens (`hsl(var(--*))`), shadcn-pattern components, Zustand for
auth state with localStorage persistence, and `recharts` for charts.

## Docker (Phase 7)

```
docker/
├── docker-compose.yml       # postgres, redis, rabbitmq, backend, worker, frontend
├── Dockerfile.backend       # multi-stage, runs prisma migrate deploy then node
├── Dockerfile.worker        # multi-stage, reuses backend source via workspace
├── Dockerfile.frontend      # Vite build → nginx static serve
└── nginx.conf               # SPA fallback + asset caching
```

- All services on a private `flowforge` network.
- Postgres / Redis / RabbitMQ have healthchecks; backend `depends_on:
  service_healthy`.
- Volumes persist Postgres, Redis, and RabbitMQ between restarts.

## API surface (high level)

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/users/me
PATCH  /api/users/me

GET    /api/workspaces
GET    /api/workspaces/:id

GET    /api/workspaces/:id/workflows
POST   /api/workspaces/:id/workflows
GET    /api/workspaces/:id/workflows/:wid
PATCH  /api/workspaces/:id/workflows/:wid
POST   /api/workspaces/:id/workflows/:wid/graph
POST   /api/workspaces/:id/workflows/:wid/run
GET    /api/workspaces/:id/workflows/:wid/executions
GET    /api/workspaces/:id/workflows/executions/:eid

GET    /api/workspaces/:id/leads
POST   /api/workspaces/:id/leads
POST   /api/workspaces/:id/leads/import
PATCH  /api/workspaces/:id/leads/:lid
DELETE /api/workspaces/:id/leads/:lid

GET    /api/workspaces/:id/email-templates
POST   /api/workspaces/:id/email-templates
PATCH  /api/workspaces/:id/email-templates/:tid
DELETE /api/workspaces/:id/email-templates/:tid
POST   /api/workspaces/:id/emails
GET    /api/workspaces/:id/emails

GET    /api/workspaces/:id/campaigns
POST   /api/workspaces/:id/campaigns
PATCH  /api/workspaces/:id/campaigns/:cid
POST   /api/workspaces/:id/campaigns/:cid/launch

POST   /api/workspaces/:id/ai/classify
POST   /api/workspaces/:id/ai/sentiment
POST   /api/workspaces/:id/ai/summarize
POST   /api/workspaces/:id/ai/generate-email

GET    /api/workspaces/:id/analytics/summary
GET    /api/workspaces/:id/analytics/executions
GET    /api/workspaces/:id/queue/stats
GET    /api/workspaces/:id/queue/failures
GET    /api/health
```

The full schema is also browsable at `/api/docs` (Swagger UI).

## What's intentionally _not_ in scope

- Real email provider integration (SendGrid/SES adapter would slot into
  `EmailConsumer.deliver`).
- OAuth providers (Google/GitHub) — JWT password auth only.
- Multi-region routing / database sharding (notes above describe how it'd
  evolve).
- E2E tests — the structure is unit-test friendly (services + DTOs) but tests
  weren't generated for the MVP.

## License

MIT (or your choice — change before shipping publicly).
