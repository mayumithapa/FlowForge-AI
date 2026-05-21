# FlowForge AI 🤖⚡

> AI-powered workflow automation platform for intelligent lead outreach and campaign management.

![Dashboard](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Stack](https://img.shields.io/badge/Stack-NestJS%20%7C%20React%20%7C%20PostgreSQL%20%7C%20RabbitMQ-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

### 🌐 Live Demo
| | URL |
|--|-----|
| **Frontend** | https://flowforge-ai-psi.vercel.app |
| **Backend API** | https://flowforge-backend.onrender.com/api |

> ⚠️ Free tier — backend may take ~30s to wake up on first request.


## 🚀 Overview

FlowForge AI is a full-stack SaaS platform that lets you build visual AI workflows to automate lead classification, personalized email generation, and multi-channel campaign management — all powered by OpenAI.

### ✨ Key Features

- **🎨 Visual Workflow Builder** — Drag-and-drop node editor (React Flow) with AI, email, logic, and data nodes
- **🤖 AI Nodes** — Classify leads, generate personalized emails, analyze sentiment, summarize content via OpenAI GPT-4o-mini
- **📋 Lead Management** — CSV import with bulk workflow trigger, search, and AI enrichment
- **📧 Email Campaigns** — Fan-out campaigns to lead segments with delivery tracking
- **📊 Analytics Dashboard** — Real-time execution health, queue depth, and 30-day trend charts
- **🔐 Multi-tenant Auth** — JWT + refresh token auth with workspace isolation
- **⚙️ Offline Mock Mode** — Full demo without an OpenAI API key

---

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Frontend  │────▶│   Backend   │────▶│   Worker     │
│  React/Vite │     │   NestJS    │     │  ts-node     │
│  Port 5173  │     │  Port 4000  │     │  (consumer)  │
└─────────────┘     └──────┬──────┘     └──────┬───────┘
                           │                    │
              ┌────────────┼────────────┐       │
              ▼            ▼            ▼       ▼
         PostgreSQL      Redis      RabbitMQ ◀──┘
          (data)        (cache)    (message queue)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, React Flow, Recharts, Tailwind-compatible CSS |
| Backend | NestJS, TypeScript, Prisma ORM, Passport JWT |
| Worker | NestJS microservice (ts-node), RabbitMQ consumer |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Queue | RabbitMQ 3.13 |
| AI | OpenAI GPT-4o-mini (with offline mock fallback) |
| Infrastructure | Docker Compose, Nginx |

---

## 🚦 Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

### 1. Clone & configure

```bash
git clone https://github.com/mayumithapa/FlowForge-AI.git
cd FlowForge-AI
cp .env.example .env
```

Edit `.env` and set your values:
```env
OPENAI_API_KEY=sk-your-key-here   # or leave as sk-replace-me for offline mock
JWT_SECRET=your-secret-here
```

### 2. Start all services

```bash
docker compose -f docker/docker-compose.yml up --build
```

### 3. Seed demo data

```bash
docker compose -f docker/docker-compose.yml exec backend npx prisma db seed
```

### 4. Open the app

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:4000/api |
| Swagger Docs | http://localhost:4000/docs |
| RabbitMQ UI | http://localhost:15672 |

**Demo credentials:**
- Email: `demo@flowforge.dev`
- Password: `demo1234`

---

## 🔄 Workflow Node Types

| Node | Description |
|------|-------------|
| `TRIGGER_MANUAL` | Start a workflow manually or via lead import |
| `TRIGGER_WEBHOOK` | Start via HTTP webhook |
| `AI_CLASSIFY` | Classify lead into hot/warm/cold categories |
| `AI_GENERATE_EMAIL` | Generate personalized outreach email |
| `AI_SENTIMENT` | Analyze sentiment of text |
| `AI_SUMMARIZE` | Summarize text to N words |
| `EMAIL_SEND` | Queue and deliver email to lead |
| `DB_UPDATE_LEAD` | Update lead classification/status |
| `ANALYTICS_RECORD` | Record custom analytics event |
| `CONDITION` | Branch workflow on field value |
| `DELAY` | Wait N milliseconds before next node |

---

## 📁 Project Structure

```
FlowForge-AI/
├── backend/          # NestJS API server
│   ├── src/
│   │   ├── ai/           # OpenAI integration + offline mocks
│   │   ├── auth/         # JWT auth, guards, decorators
│   │   ├── campaign/     # Campaign management
│   │   ├── leads/        # Lead CRUD + CSV import
│   │   ├── workflow/     # Workflow engine + builder API
│   │   ├── analytics/    # Execution metrics
│   │   └── rabbitmq/     # Message queue service
│   └── prisma/       # Database schema + seed
├── frontend/         # React + Vite SPA
│   └── src/
│       ├── pages/        # Route-level page components
│       ├── components/   # Reusable UI components
│       ├── stores/       # Zustand state management
│       └── lib/          # API client, utilities
├── worker/           # RabbitMQ consumer microservice
│   └── src/
│       └── consumers/    # workflow.execute, email.send consumers
├── shared/           # Shared TypeScript types
└── docker/           # Dockerfiles + Compose + Nginx config
```

---

## 🧪 Manual Test Scenarios

1. **Auth** — Register at `/register`, login at `/login`
2. **Workflow Builder** — Create nodes at `/workflows`, connect & publish
3. **Lead Import** — Upload CSV at `/leads` with workflow trigger
4. **Templates** — Create email templates at `/templates`
5. **Campaigns** — Launch campaigns at `/campaigns` with lead UUIDs
6. **Analytics** — View execution charts at `/analytics`
7. **Dashboard** — Overview stats at `/dashboard`

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

---

## 📄 License

MIT © Mayumi Thapa
