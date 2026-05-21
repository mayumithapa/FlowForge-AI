import { useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Plus, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth';
import { relativeTime } from '@/lib/utils';

interface Workflow { id: string; name: string; publishedVersionId: string | null; }
interface Template { id: string; name: string; }
interface Campaign {
  id: string;
  name: string;
  status: string;
  totalRecipients: number;
  totalSent: number;
  totalOpened: number;
  createdAt: string;
  workflowId: string | null;
  templateId: string | null;
}

export function CampaignsPage() {
  const qc = useQueryClient();
  const { workspace } = useAuthStore();
  const wsId = workspace?.id;

  const [name, setName] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [leadIds, setLeadIds] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Parallel fetch of campaigns + workflows + templates in one shot.
  const results = useQueries({
    queries: [
      {
        queryKey: qk.campaigns(wsId ?? ''),
        queryFn: () => api.get<Campaign[]>(`/workspaces/${wsId}/campaigns`),
        enabled: !!wsId,
      },
      {
        queryKey: qk.workflows(wsId ?? ''),
        queryFn: () => api.get<Workflow[]>(`/workspaces/${wsId}/workflows`),
        enabled: !!wsId,
      },
      {
        queryKey: qk.templates(wsId ?? ''),
        queryFn: () => api.get<Template[]>(`/workspaces/${wsId}/email-templates`),
        enabled: !!wsId,
      },
    ],
  });
  const items = (results[0].data ?? []) as Campaign[];
  const workflows = ((results[1].data ?? []) as Workflow[]).filter((w) => w.publishedVersionId);
  const templates = (results[2].data ?? []) as Template[];

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(`/workspaces/${wsId}/campaigns`, {
        name,
        workflowId: workflowId || undefined,
        templateId: templateId || undefined,
      }),
    onSuccess: () => {
      setName(''); setWorkflowId(''); setTemplateId('');
      qc.invalidateQueries({ queryKey: qk.campaigns(wsId ?? '') });
    },
  });

  const launchMutation = useMutation({
    mutationFn: (id: string) => {
      const ids = leadIds.split(/[,\s]+/).filter(Boolean);
      if (ids.length === 0) throw new Error('Paste lead UUIDs (comma separated) to launch.');
      return api.post<{ launched: number }>(`/workspaces/${wsId}/campaigns/${id}/launch`, { leadIds: ids });
    },
    onSuccess: (r) => {
      setMessage(`Campaign launched for ${r.launched} leads.`);
      qc.invalidateQueries({ queryKey: qk.campaigns(wsId ?? '') });
      qc.invalidateQueries({ queryKey: qk.analyticsSummary(wsId ?? '') });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  return (
    <>
      <PageHeader title="Campaigns" description="Fan out a published workflow to a list of leads." />
      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>New campaign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Workflow</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
              >
                <option value="">— pick a published workflow —</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Template (optional)</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">— none —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={() => createMutation.mutate()} className="w-full" disabled={createMutation.isPending || !name.trim()}>
              <Plus size={16} /> {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3 lg:col-span-2">
          <Card>
            <CardContent className="space-y-2 p-4">
              <Label>Lead IDs to launch (comma separated)</Label>
              <Input value={leadIds} onChange={(e) => setLeadIds(e.target.value)} placeholder="uuid, uuid, uuid" />
              {message && <p className="text-sm text-muted-foreground">{message}</p>}
            </CardContent>
          </Card>

          {items.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{c.name}</span>
                    <Badge variant={c.status === 'RUNNING' ? 'success' : c.status === 'COMPLETED' ? 'secondary' : 'muted'}>
                      {c.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.totalRecipients} recipients · {c.totalSent} sent · {c.totalOpened} opened · {relativeTime(c.createdAt)}
                  </div>
                </div>
                <Button onClick={() => launchMutation.mutate(c.id)} disabled={!c.workflowId || launchMutation.isPending}>
                  <Rocket size={16} /> {launchMutation.isPending ? 'Launching…' : 'Launch'}
                </Button>
              </CardContent>
            </Card>
          ))}
          {items.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No campaigns yet. Create one on the left.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
