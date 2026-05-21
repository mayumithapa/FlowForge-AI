import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-client';
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
  const qc = useQueryClient();
  const { workspace } = useAuthStore();
  const wsId = workspace?.id;

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [triggerWorkflowId, setTriggerWorkflowId] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const leadsQ = useQuery({
    queryKey: qk.leads(wsId ?? '', search),
    queryFn: () =>
      api.get<{ items: Lead[] }>(
        `/workspaces/${wsId}/leads?take=200${search ? `&q=${encodeURIComponent(search)}` : ''}`,
      ),
    enabled: !!wsId,
  });

  const workflowsQ = useQuery({
    queryKey: qk.workflows(wsId ?? ''),
    queryFn: () => api.get<Workflow[]>(`/workspaces/${wsId}/workflows`),
    enabled: !!wsId,
    select: (list) => list.filter((w) => w.publishedVersionId),
  });

  const leads = leadsQ.data?.items ?? [];
  const workflows = workflowsQ.data ?? [];

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const rows = parseCsv(text);
      const payload = {
        workspaceId: wsId!,
        leads: rows.map((r) => ({
          workspaceId: wsId!,
          email: r.email,
          fullName: r.fullName ?? r.name ?? undefined,
          company: r.company ?? undefined,
          source: 'csv-import',
          metadata: r,
        })),
        triggerWorkflowId: triggerWorkflowId || undefined,
      };
      return api.post<{ imported: number }>(`/workspaces/${wsId}/leads/import`, payload);
    },
    onSuccess: (res) => {
      setMessage(`Imported ${res.imported} leads${triggerWorkflowId ? ' and queued workflows' : ''}.`);
      // One mutation, four caches invalidated — the win that justifies TanStack Query.
      qc.invalidateQueries({ queryKey: ['leads', wsId] });
      qc.invalidateQueries({ queryKey: qk.analyticsSummary(wsId ?? '') });
      qc.invalidateQueries({ queryKey: ['analytics', wsId] });
      qc.invalidateQueries({ queryKey: qk.queueStats(wsId ?? '') });
    },
    onError: (err) => setMessage((err as Error).message),
  });

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
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files && importMutation.mutate(e.target.files[0])}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending}>
              <Upload size={16} /> {importMutation.isPending ? 'Importing…' : 'Import CSV'}
            </Button>
          </>
        }
      />

      <div className="space-y-4 p-8">
        <Card>
          <CardContent className="p-4">
            <Input
              placeholder="Search by email or name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput)}
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
                {leads.length === 0 && !leadsQ.isLoading && (
                  <TR>
                    <TD colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                      No leads yet. Drop a CSV above with columns: email, fullName, company.
                    </TD>
                  </TR>
                )}
                {leadsQ.isLoading && (
                  <TR>
                    <TD colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                      Loading…
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
