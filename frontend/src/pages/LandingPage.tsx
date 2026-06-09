import { Link } from 'react-router-dom';
import {
  Zap,
  Workflow,
  Mail,
  BarChart3,
  Bot,
  Webhook,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: Workflow,
    title: 'Visual workflow builder',
    description:
      'Design automations with a drag-and-drop canvas. Connect triggers, logic, and actions without writing code.',
  },
  {
    icon: Bot,
    title: 'AI-powered automation',
    description:
      'Generate emails, route decisions, and build workflows from natural language with your choice of AI provider.',
  },
  {
    icon: Mail,
    title: 'Email & campaigns',
    description:
      'Send personalized outreach, manage templates, and track delivery — all orchestrated by your workflows.',
  },
  {
    icon: Webhook,
    title: 'Webhook orchestration',
    description:
      'Trigger flows from any service. Inspect payloads, transform data, and chain multi-step processes.',
  },
  {
    icon: BarChart3,
    title: 'Real-time analytics',
    description:
      'Monitor execution success rates, run times, and errors from a live dashboard built for operators.',
  },
  {
    icon: Zap,
    title: 'Async at scale',
    description:
      'Event-driven processing with RabbitMQ keeps long-running jobs off the request path and fault-tolerant.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-primary to-accent text-primary-foreground">
              <Zap size={18} />
            </div>
            <span className="text-lg font-semibold">FlowForge AI</span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link to="/register">
                Get started
                <ArrowRight size={16} />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
            <Zap size={14} />
            Enterprise workflow automation
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Automate your business{' '}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              with AI
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
            FlowForge AI combines visual workflow building, intelligent routing, and
            real-time processing so your team can ship automations in minutes — not weeks.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link to="/register">
                Start for free
                <ArrowRight size={18} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Sign in to your workspace</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border/60 bg-muted/30 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to automate
            </h2>
            <p className="mt-4 text-muted-foreground">
              From lead capture to email campaigns — build, run, and monitor workflows
              in one platform.
            </p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 text-primary">
                  <Icon size={20} />
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 px-6 py-14 text-center sm:px-12">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Ready to forge your first workflow?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Create a workspace in seconds and start automating with AI-assisted
              workflows, email campaigns, and live analytics.
            </p>
            <Button size="lg" className="mt-8" asChild>
              <Link to="/register">
                Create your workspace
                <ArrowRight size={18} />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-primary to-accent text-primary-foreground">
              <Zap size={14} />
            </div>
            <span>FlowForge AI</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} FlowForge AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
