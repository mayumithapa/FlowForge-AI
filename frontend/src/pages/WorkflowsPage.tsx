import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-client';
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
  const qc = useQueryClient();
  const { workspace } = useAuthStore();
  const wsId = workspace?.id;
  const [name, setName] = useState('');

  const { data: items = [] } = useQuery({
    queryKey: qk.workflows(wsId ?? ''),
    queryFn: () => api.get<Workflow[]>(`/workspaces/${wsId}/workflows`),
    enabled: !!wsId,
  });

  const createMutation = useMutation({
    mutationFn: (workflowName: string) =>
      api.post<Workflow>(`/workspaces/${wsId}/workflows`, { name: workflowName }),
    onSuccess: (wf) => {
      qc.invalidateQueries({ queryKey: qk.workflows(wsId ?? '') });
      nav(`/workflows/${wf.id}`);
    },
  });

  const handleCreate = () => {
    if (!name.trim()) return;
    createMutation.mutate(name);
  };

  return (
    <>
      <PageHeader title="Workflows" description="Drag-drop AI automations powering your campaigns." />
      <div className="space-y-6 p-8">
        <Card>
          <CardContent className="flex gap-2 p-4">
            <Input placeholder="New workflow name…" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={handleCreate} disabled={createMutation.isPending || !name.trim()}>
              <Plus size={16} /> {createMutation.isPending ? 'Creating…' : 'Create'}
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
