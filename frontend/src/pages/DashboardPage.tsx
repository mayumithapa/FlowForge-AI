import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Activity, CheckCircle2, Mail, TrendingUp, Users, Workflow as WorkflowIcon, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface Summary {
  totalLeads: number;
  newLeadsToday: number;
  activeWorkflows: number;
  executionsLast24h: number;
  successLast24h: number;
  failedLast24h: number;
  successRate: number;
  emailsSent: number;
  emailsOpened: number;
  openRate: number;
  campaignsRunning: number;
}

interface TimeseriesPoint {
  day: string;
  status: string;
  count: number;
}

export function DashboardPage() {
  const { workspace } = useAuthStore();
  const wsId = workspace?.id;

  const summaryQ = useQuery({
    queryKey: qk.analyticsSummary(wsId ?? ''),
    queryFn: () => api.get<Summary>(`/workspaces/${wsId}/analytics/summary`),
    enabled: !!wsId,
  });

  const seriesQ = useQuery({
    queryKey: qk.analyticsExecutions(wsId ?? '', 14),
    queryFn: () => api.get<TimeseriesPoint[]>(`/workspaces/${wsId}/analytics/executions?days=14`),
    enabled: !!wsId,
  });

  const summary = summaryQ.data;
  const series = seriesQ.data ?? [];
  const error = summaryQ.error ?? seriesQ.error;

  const tiles = [
    { title: 'Total leads', value: summary?.totalLeads ?? '—', icon: Users, sub: `${summary?.newLeadsToday ?? 0} new today` },
    { title: 'Active workflows', value: summary?.activeWorkflows ?? '—', icon: WorkflowIcon, sub: `${summary?.campaignsRunning ?? 0} campaigns running` },
    { title: 'Executions / 24h', value: summary?.executionsLast24h ?? '—', icon: Activity, sub: `${summary?.successRate ?? 0}% success rate` },
    { title: 'Emails sent', value: summary?.emailsSent ?? '—', icon: Mail, sub: `${summary?.openRate ?? 0}% open rate` },
  ];

  const chartData = aggregateByDay(series);

  return (
    <>
      <PageHeader title="Dashboard" description={workspace?.name ?? 'Overview of your workspace.'} />
      <div className="p-8">
        {error && <p className="mb-4 text-sm text-destructive">{(error as Error).message}</p>}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <Card key={t.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t.title}</CardTitle>
                <t.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{t.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Executions (14 days)</CardTitle>
            </CardHeader>
            <CardContent style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="SUCCESS" stackId="a" fill="hsl(var(--success))" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="FAILED" stackId="a" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="RUNNING" stackId="a" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>24h health</CardTitle>
            </CardHeader>
            <CardContent>
              <Stat icon={CheckCircle2} color="text-success" label="Successful" value={summary?.successLast24h ?? 0} />
              <Stat icon={XCircle} color="text-destructive" label="Failed" value={summary?.failedLast24h ?? 0} />
              <Stat icon={TrendingUp} color="text-primary" label="Open rate" value={`${summary?.openRate ?? 0}%`} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ icon: Icon, color, label, value }: { icon: any; color: string; label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon size={16} className={color} />
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function aggregateByDay(series: TimeseriesPoint[]) {
  const map = new Map<string, Record<string, number | string>>();
  for (const r of series) {
    const day = new Date(r.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const row = map.get(day) ?? { day };
    row[r.status] = (row[r.status] as number ?? 0) + r.count;
    map.set(day, row);
  }
  return Array.from(map.values()) as { day: string; SUCCESS?: number; FAILED?: number; RUNNING?: number }[];
}
