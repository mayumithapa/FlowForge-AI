import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-client';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Connection,
  Handle,
  Position,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import {
  Bot,
  Brain,
  CheckSquare,
  Database,
  GitBranch,
  Hourglass,
  LineChart,
  Mail,
  Play,
  Save,
  Sparkles,
  Webhook,
  Wand2,
  Zap,
} from 'lucide-react';

const NODE_CATALOG: {
  type: string;
  label: string;
  icon: any;
  color: string;
  defaultConfig: Record<string, unknown>;
}[] = [
  { type: 'TRIGGER_MANUAL', label: 'Manual Trigger', icon: Play, color: 'from-emerald-500 to-emerald-700', defaultConfig: {} },
  { type: 'TRIGGER_WEBHOOK', label: 'Webhook Trigger', icon: Webhook, color: 'from-emerald-500 to-emerald-700', defaultConfig: {} },
  { type: 'AI_CLASSIFY', label: 'AI Classify Lead', icon: Brain, color: 'from-violet-500 to-fuchsia-600', defaultConfig: { categories: ['hot', 'warm', 'cold'] } },
  { type: 'AI_SENTIMENT', label: 'AI Sentiment', icon: Sparkles, color: 'from-violet-500 to-fuchsia-600', defaultConfig: {} },
  { type: 'AI_SUMMARIZE', label: 'AI Summarize', icon: Bot, color: 'from-violet-500 to-fuchsia-600', defaultConfig: { maxWords: 60 } },
  { type: 'AI_GENERATE_EMAIL', label: 'AI Generate Email', icon: Wand2, color: 'from-violet-500 to-fuchsia-600', defaultConfig: { tone: 'professional', goal: 'introduce our product' } },
  { type: 'EMAIL_SEND', label: 'Send Email', icon: Mail, color: 'from-sky-500 to-blue-700', defaultConfig: {} },
  { type: 'DB_UPDATE_LEAD', label: 'Update Lead', icon: Database, color: 'from-amber-500 to-orange-700', defaultConfig: {} },
  { type: 'ANALYTICS_RECORD', label: 'Record Analytics', icon: LineChart, color: 'from-amber-500 to-orange-700', defaultConfig: { event: 'workflow.custom' } },
  { type: 'CONDITION', label: 'Condition', icon: GitBranch, color: 'from-slate-500 to-slate-700', defaultConfig: { field: 'category', equals: 'hot' } },
  { type: 'DELAY', label: 'Delay', icon: Hourglass, color: 'from-slate-500 to-slate-700', defaultConfig: { ms: 1000 } },
];

interface WorkflowData {
  id: string;
  name: string;
  status: string;
  publishedVersionId: string | null;
  versions: { id: string; version: number; nodes: any[]; edges: any[] }[];
  publishedVersion: { id: string; nodes: any[]; edges: any[] } | null;
}

function FlowNode({ data, selected }: NodeProps) {
  const meta = NODE_CATALOG.find((c) => c.type === data.type);
  const Icon = meta?.icon ?? Zap;
  return (
    <div
      className={`min-w-[180px] rounded-lg border bg-card text-card-foreground shadow-md transition-all ${
        selected ? 'border-primary ring-2 ring-primary/40' : 'border-border'
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className={`flex items-center gap-2 rounded-t-lg bg-gradient-to-br ${meta?.color ?? 'from-slate-500 to-slate-700'} px-3 py-2 text-white`}>
        <Icon size={14} />
        <span className="text-xs font-semibold uppercase tracking-wide">{meta?.label ?? data.type}</span>
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {Object.keys(data.config ?? {}).length === 0 ? 'No config' : Object.entries(data.config).slice(0, 2).map(([k, v]) => (
          <div key={k} className="truncate">
            <span className="text-foreground">{k}</span>: {String(Array.isArray(v) ? v.join(',') : v)}
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function WorkflowBuilderPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { workspace } = useAuthStore();
  const wsId = workspace?.id;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<Node | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const nodeTypes = useMemo(() => ({ flowforge: FlowNode }), []);

  const workflowQ = useQuery({
    queryKey: qk.workflow(wsId ?? '', id ?? ''),
    queryFn: () => api.get<WorkflowData>(`/workspaces/${wsId}/workflows/${id}`),
    enabled: !!wsId && !!id,
  });
  const workflow = workflowQ.data ?? null;

  useEffect(() => {
    if (!workflow) return;
    const version = workflow.publishedVersion ?? workflow.versions[0];
    if (version) {
      setNodes(
        version.nodes.map((n) => ({
          id: n.nodeKey,
          type: 'flowforge',
          position: { x: n.positionX, y: n.positionY },
          data: { type: n.type, config: n.config },
        })),
      );
      setEdges(
        version.edges.map((e: any, i: number) => ({
          id: `e${i}-${e.sourceKey}-${e.targetKey}`,
          source: e.sourceKey,
          target: e.targetKey,
          animated: true,
        })),
      );
    }
  }, [workflow, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true }, eds)), [setEdges]);

  const addNode = (type: string) => {
    const meta = NODE_CATALOG.find((c) => c.type === type)!;
    const newNode: Node = {
      id: `${type}-${Date.now().toString(36)}`,
      type: 'flowforge',
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { type, config: { ...meta.defaultConfig } },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const saveMutation = useMutation({
    mutationFn: ({ publish }: { publish: boolean }) => {
      const graph = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.data.type,
          config: n.data.config ?? {},
          positionX: n.position.x,
          positionY: n.position.y,
        })),
        edges: edges.map((e) => ({ source: e.source, target: e.target, label: e.label as string | undefined })),
      };
      return api.post(`/workspaces/${wsId}/workflows/${workflow!.id}/graph`, { graph, publish });
    },
    onSuccess: (_data, { publish }) => {
      setMessage(publish ? 'Saved & published!' : 'Draft saved.');
      qc.invalidateQueries({ queryKey: qk.workflow(wsId ?? '', id ?? '') });
      qc.invalidateQueries({ queryKey: qk.workflows(wsId ?? '') });
    },
    onError: (err) => setMessage((err as Error).message),
  });
  const saving = saveMutation.isPending;
  const save = (publish: boolean) => saveMutation.mutate({ publish });

  const runMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>(`/workspaces/${wsId}/workflows/${workflow!.id}/run`, {
        input: { source: 'manual-run' },
      }),
    onSuccess: (execution) => {
      setMessage(`Execution queued: ${execution.id.slice(0, 8)}…`);
      qc.invalidateQueries({ queryKey: qk.workflowExecutions(wsId ?? '', id ?? '') });
      qc.invalidateQueries({ queryKey: qk.analyticsSummary(wsId ?? '') });
    },
    onError: (err) => setMessage((err as Error).message),
  });
  const run = () => runMutation.mutate();

  const updateSelectedConfig = (key: string, value: string) => {
    if (!selected) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selected.id) return n;
        let parsed: unknown = value;
        if (value.startsWith('[') || value.startsWith('{')) {
          try { parsed = JSON.parse(value); } catch { /* ignore */ }
        } else if (!Number.isNaN(Number(value)) && value.trim() !== '') {
          parsed = Number(value);
        }
        return { ...n, data: { ...n.data, config: { ...(n.data.config ?? {}), [key]: parsed } } };
      }),
    );
  };

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title={workflow?.name ?? 'Workflow'}
        description="Drag nodes onto the canvas, connect them, then publish to run."
        actions={
          <>
            <Badge variant={workflow?.publishedVersionId ? 'success' : 'muted'}>
              {workflow?.publishedVersionId ? 'Published' : 'Draft'}
            </Badge>
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>
              <Save size={16} /> Save
            </Button>
            <Button onClick={() => save(true)} disabled={saving}>
              <CheckSquare size={16} /> Save & publish
            </Button>
            <Button variant="secondary" onClick={run} disabled={!workflow?.publishedVersionId}>
              <Play size={16} /> Run
            </Button>
            <Button variant="ghost" onClick={() => nav('/workflows')}>
              Close
            </Button>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-60 shrink-0 overflow-y-auto border-r border-border bg-card p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add node</div>
          <div className="space-y-1">
            {NODE_CATALOG.map((n) => (
              <button
                key={n.type}
                onClick={() => addNode(n.type)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
              >
                <span className={`grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br ${n.color} text-white`}>
                  <n.icon size={14} />
                </span>
                {n.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onSelectionChange={(s) => setSelected(s.nodes?.[0] ?? null)}
            fitView
          >
            <Background gap={16} size={1} color="hsl(var(--border))" />
            <MiniMap maskColor="rgba(0,0,0,0.3)" />
            <Controls />
          </ReactFlow>
        </div>

        <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-card p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</div>
          {!selected && <p className="text-sm text-muted-foreground">Select a node to edit its configuration.</p>}
          {selected && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">{selected.data.type}</div>
              <div className="text-xs text-muted-foreground">{selected.id}</div>
              {Object.keys(selected.data.config ?? {}).length === 0 && (
                <p className="text-xs text-muted-foreground">This node has no configurable fields.</p>
              )}
              {Object.entries(selected.data.config ?? {}).map(([k, v]) => (
                <div key={k} className="space-y-1">
                  <label className="text-xs font-medium">{k}</label>
                  <input
                    className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                    defaultValue={typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    onBlur={(e) => updateSelectedConfig(k, e.target.value)}
                  />
                </div>
              ))}
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => {
                  setNodes((nds) => nds.filter((n) => n.id !== selected.id));
                  setEdges((eds) => eds.filter((e) => e.source !== selected.id && e.target !== selected.id));
                  setSelected(null);
                }}
              >
                Delete node
              </Button>
            </div>
          )}
        </aside>
      </div>

      {message && (
        <div className="border-t border-border bg-card px-8 py-2 text-xs text-muted-foreground">{message}</div>
      )}
    </div>
  );
}
