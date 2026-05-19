import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { relativeTime } from '@/lib/utils';

interface Lead {
  id: string;
  email: string;
  fullName: string | null;
  company: string | null;
  status: string;
  classification: string | null;
  sentiment: string | null;
  createdAt: string;
}

interface Workflow {
  id: string;
  name: string;
  publishedVersionId: string | null;
}

export function LeadsPage() {
  const { workspace } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [triggerWorkflowId, setTriggerWorkflowId] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    if (!workspace) return;
    const r = await api.get<{ items: Lead[] }>(`/workspaces/${workspace.id}/leads?take=200${search ? `&q=${encodeURIComponent(search)}` : ''}`);
    setLeads(r.items);
    const wfs = await api.get<Workflow[]>(`/workspaces/${workspace.id}/workflows`);
    setWorkflows(wfs.filter((w) => w.publishedVersionId));
  };

  useEffect(() => {
    load();
  }, [workspace]);

  const importCsv = async (file: File) => {
    if (!workspace) return;
    setImporting(true);
    setMessage(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const payload = {
        workspaceId: workspace.id,
        leads: rows.map((r) => ({
          workspaceId: workspace.id,
          email: r.email,
          fullName: r.fullName ?? r.name ?? undefined,
          company: r.company ?? undefined,
          source: 'csv-import',
          metadata: r,
        })),
        triggerWorkflowId: triggerWorkflowId || undefined,
      };
      const res = await api.post<{ imported: number }>(`/workspaces/${workspace.id}/leads/import`, payload);
      setMessage(`Imported ${res.imported} leads${triggerWorkflowId ? ' and queued workflows' : ''}.`);
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Leads"
        description="Upload CSVs, classify with AI, send personalized emails."
        actions={
          <>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              value={triggerWorkflowId}
              onChange={(e) => setTriggerWorkflowId(e.target.value)}
            >
              <option value="">Trigger: none</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => e.target.files && importCsv(e.target.files[0])}
              />
              <Button asChild disabled={importing}>
                <span>
                  <Upload size={16} /> Import CSV
                </span>
              </Button>
            </label>
          </>
        }
      />
      <div className="space-y-4 p-8">
        <Card>
          <CardContent className="p-4">
            <Input
              placeholder="Search by email or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
          </CardContent>
        </Card>

        {message && <div className="rounded-md border border-border bg-card px-4 py-2 text-sm">{message}</div>}

        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Email</TH>
                  <TH>Name</TH>
                  <TH>Company</TH>
                  <TH>Status</TH>
                  <TH>Classification</TH>
                  <TH>Sentiment</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {leads.map((l) => (
                  <TR key={l.id}>
                    <TD className="font-medium">{l.email}</TD>
                    <TD>{l.fullName ?? '—'}</TD>
                    <TD>{l.company ?? '—'}</TD>
                    <TD>
                      <Badge variant="muted">{l.status}</Badge>
                    </TD>
                    <TD>{l.classification ?? '—'}</TD>
                    <TD>{l.sentiment ?? '—'}</TD>
                    <TD>{relativeTime(l.createdAt)}</TD>
                  </TR>
                ))}
                {leads.length === 0 && (
                  <TR>
                    <TD colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                      No leads yet. Drop a CSV above with columns: email, fullName, company.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = (cols[i] ?? '').trim()));
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
