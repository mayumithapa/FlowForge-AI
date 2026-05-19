import { useEffect, useState } from 'react';
import { Plus, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
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
  const { workspace } = useAuthStore();
  const [items, setItems] = useState<Campaign[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [leadIds, setLeadIds] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    if (!workspace) return;
    const [c, w, t] = await Promise.all([
      api.get<Campaign[]>(`/workspaces/${workspace.id}/campaigns`),
      api.get<Workflow[]>(`/workspaces/${workspace.id}/workflows`),
      api.get<Template[]>(`/workspaces/${workspace.id}/email-templates`),
    ]);
    setItems(c);
    setWorkflows(w.filter((x) => x.publishedVersionId));
    setTemplates(t);
  };

  useEffect(() => {
    load();
  }, [workspace]);

  const create = async () => {
    if (!workspace || !name.trim()) return;
    await api.post(`/workspaces/${workspace.id}/campaigns`, {
      name,
      workflowId: workflowId || undefined,
      templateId: templateId || undefined,
    });
    setName(''); setWorkflowId(''); setTemplateId('');
    await load();
  };

  const launch = async (id: string) => {
    if (!workspace) return;
    const ids = leadIds.split(/[,\s]+/).filter(Boolean);
    if (ids.length === 0) {
      setMessage('Paste lead UUIDs (comma separated) to launch.');
      return;
    }
    setMessage(null);
    try {
      const r = await api.post<{ launched: number }>(`/workspaces/${workspace.id}/campaigns/${id}/launch`, { leadIds: ids });
      setMessage(`Campaign launched for ${r.launched} leads.`);
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

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
            <Button onClick={create} className="w-full">
              <Plus size={16} /> Create
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
                <Button onClick={() => launch(c.id)} disabled={!c.workflowId}>
                  <Rocket size={16} /> Launch
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
