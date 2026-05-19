import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
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
  const { workspace } = useAuthStore();
  const [items, setItems] = useState<Template[]>([]);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const load = async () => {
    if (!workspace) return;
    setItems(await api.get<Template[]>(`/workspaces/${workspace.id}/email-templates`));
  };

  useEffect(() => {
    load();
  }, [workspace]);

  const create = async () => {
    if (!workspace || !name.trim()) return;
    await api.post(`/workspaces/${workspace.id}/email-templates`, { name, subject, bodyMarkdown: body });
    setName(''); setSubject(''); setBody('');
    await load();
  };

  const remove = async (id: string) => {
    if (!workspace) return;
    await api.del(`/workspaces/${workspace.id}/email-templates/${id}`);
    await load();
  };

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
            <Button onClick={create} className="w-full">
              <Plus size={16} /> Create
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
                  <Button size="icon" variant="ghost" onClick={() => remove(t.id)}>
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
