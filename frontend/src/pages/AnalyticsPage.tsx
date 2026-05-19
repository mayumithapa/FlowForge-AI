import { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface Point { day: string; status: string; count: number; }
interface QueueStats { [queue: string]: Record<string, number> }

export function AnalyticsPage() {
  const { workspace } = useAuthStore();
  const [series, setSeries] = useState<Point[]>([]);
  const [queue, setQueue] = useState<QueueStats>({});

  useEffect(() => {
    if (!workspace) return;
    api.get<Point[]>(`/workspaces/${workspace.id}/analytics/executions?days=30`).then(setSeries);
    api.get<QueueStats>(`/workspaces/${workspace.id}/queue/stats`).then(setQueue).catch(() => undefined);
  }, [workspace]);

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
            <CardTitle>Queue health</CardTitle>
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
