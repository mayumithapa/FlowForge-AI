import { useQueries } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth';

interface Point { day: string; status: string; count: number; }
type QueueStats = Record<string, Record<string, number>>;

export function AnalyticsPage() {
  const { workspace } = useAuthStore();
  const wsId = workspace?.id;

  const results = useQueries({
    queries: [
      {
        queryKey: qk.analyticsExecutions(wsId ?? '', 30),
        queryFn: () => api.get<Point[]>(`/workspaces/${wsId}/analytics/executions?days=30`),
        enabled: !!wsId,
      },
      {
        queryKey: qk.queueStats(wsId ?? ''),
        queryFn: () => api.get<QueueStats>(`/workspaces/${wsId}/queue/stats`),
        enabled: !!wsId,
        // The queue dashboard benefits from a faster refresh than the default 30s.
        refetchInterval: 10_000,
      },
    ],
  });
  const series = (results[0].data ?? []) as Point[];
  const queue = (results[1].data ?? {}) as QueueStats;

  const data = byDay(series);

  return (
    <>
      <PageHeader title="Analytics" description="Workflow execution health and queue depth." />
      <div className="space-y-6 p-8">
        <Card>
          <CardHeader>
            <CardTitle>Executions over 30 days</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="SUCCESS" stroke="hsl(var(--success))" strokeWidth={2} />
                <Line type="monotone" dataKey="FAILED" stroke="hsl(var(--destructive))" strokeWidth={2} />
                <Line type="monotone" dataKey="RUNNING" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Queue health (auto-refreshes every 10s)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(queue).map(([name, counts]) => (
                <div key={name} className="rounded-md border border-border p-4">
                  <div className="text-sm font-semibold">{name}</div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    {Object.entries(counts).map(([status, c]) => (
                      <div key={status}>
                        <div>{status}</div>
                        <div className="text-base font-semibold text-foreground">{c}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(queue).length === 0 && (
                <div className="col-span-full text-sm text-muted-foreground">No jobs recorded yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function byDay(series: Point[]) {
  const map = new Map<string, Record<string, number | string>>();
  for (const r of series) {
    const day = new Date(r.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const row = map.get(day) ?? { day };
    row[r.status] = (row[r.status] as number ?? 0) + r.count;
    map.set(day, row);
  }
  return Array.from(map.values()) as { day: string; SUCCESS?: number; FAILED?: number; RUNNING?: number }[];
}
