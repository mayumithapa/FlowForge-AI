import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth';

interface Template {
  id: string;
  name: string;
  subject: string;
  bodyMarkdown: string;
  variables: string[];
  updatedAt: string;
}

export function TemplatesPage() {
  const qc = useQueryClient();
  const { workspace } = useAuthStore();
  const wsId = workspace?.id;
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const { data: items = [] } = useQuery({
    queryKey: qk.templates(wsId ?? ''),
    queryFn: () => api.get<Template[]>(`/workspaces/${wsId}/email-templates`),
    enabled: !!wsId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(`/workspaces/${wsId}/email-templates`, { name, subject, bodyMarkdown: body }),
    onSuccess: () => {
      setName(''); setSubject(''); setBody('');
      qc.invalidateQueries({ queryKey: qk.templates(wsId ?? '') });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/workspaces/${wsId}/email-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates(wsId ?? '') }),
  });

  return (
    <>
      <PageHeader title="Email templates" description="Reusable templates for AI-personalized outreach." />
      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>New template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Quick idea for {{company}}" />
            </div>
            <div className="space-y-1">
              <Label>Body</Label>
              <textarea
                className="min-h-[180px] w-full rounded-md border border-input bg-transparent p-2 text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hi {{fullName}}, ..."
              />
            </div>
            <Button onClick={() => createMutation.mutate()} className="w-full" disabled={createMutation.isPending || !name.trim()}>
              <Plus size={16} /> {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3 lg:col-span-2">
          {items.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-base font-semibold">{t.name}</div>
                    <div className="text-sm text-muted-foreground">{t.subject}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(t.id)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  {t.bodyMarkdown}
                </pre>
              </CardContent>
            </Card>
          ))}
          {items.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No templates yet. Create one on the left to use it in campaigns.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
