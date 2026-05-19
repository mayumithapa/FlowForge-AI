import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { relativeTime } from '@/lib/utils';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  updatedAt: string;
  _count: { executions: number };
}

export function WorkflowsPage() {
  const nav = useNavigate();
  const { workspace } = useAuthStore();
  const [items, setItems] = useState<Workflow[]>([]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!workspace) return;
    const list = await api.get<Workflow[]>(`/workspaces/${workspace.id}/workflows`);
    setItems(list);
  };

  useEffect(() => {
    load();
  }, [workspace]);

  const create = async () => {
    if (!workspace || !name.trim()) return;
    setCreating(true);
    try {
      const wf = await api.post<Workflow>(`/workspaces/${workspace.id}/workflows`, { name });
      nav(`/workflows/${wf.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageHeader title="Workflows" description="Drag-drop AI automations powering your campaigns." />
      <div className="space-y-6 p-8">
        <Card>
          <CardContent className="flex gap-2 p-4">
            <Input placeholder="New workflow name…" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={create} disabled={creating || !name.trim()}>
              <Plus size={16} /> Create
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((w) => (
            <Card
              key={w.id}
              className="cursor-pointer transition-colors hover:border-primary"
              onClick={() => nav(`/workflows/${w.id}`)}
            >
              <CardContent className="space-y-2 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold">{w.name}</div>
                  <Badge variant={badge(w.status)}>{w.status}</Badge>
                </div>
                {w.description && <p className="text-sm text-muted-foreground">{w.description}</p>}
                <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                  <span>{w._count.executions} executions</span>
                  <span>Updated {relativeTime(w.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))}

          {items.length === 0 && (
            <Card className="md:col-span-2 lg:col-span-3">
              <CardContent className="p-12 text-center text-sm text-muted-foreground">
                No workflows yet. Create your first one above — start with a Trigger → AI Classify → Generate Email → Send Email.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function badge(status: Workflow['status']) {
  switch (status) {
    case 'ACTIVE':
      return 'success' as const;
    case 'DRAFT':
      return 'muted' as const;
    case 'PAUSED':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}
