import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Eye, EyeOff, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-client';

interface Props {
  workspaceId: string;
  workflowId: string;
  webhookToken: string | null;
  webhookSecret: string | null;
  /** True if the workflow's published version actually contains a webhook trigger. */
  publishedHasWebhook: boolean;
}

/**
 * Inspector sub-panel shown when a Webhook Trigger node is selected.
 *
 * Surfaces three things the customer needs:
 *   1) The public POST URL (paste into Tally/Typeform/their backend)
 *   2) An embed snippet (drop into Wix/WordPress/static HTML)
 *   3) The HMAC signing secret (with rotate)
 */
export function WebhookInspector({
  workspaceId,
  workflowId,
  webhookToken,
  webhookSecret,
  publishedHasWebhook,
}: Props) {
  const qc = useQueryClient();
  const [secretVisible, setSecretVisible] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<'url' | 'embed' | 'curl' | 'security'>('url');

  // The frontend doesn't know the backend's public URL — derive it from the
  // configured API URL. We strip the trailing /api so the webhook path joins
  // cleanly.
  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/api$/, '');
  const webhookUrl = webhookToken ? `${apiBase}/api/webhooks/${webhookToken}` : '';
  const hostedFormUrl = webhookToken ? `${window.location.origin}/f/${webhookToken}` : '';
  const widgetSrc = `${window.location.origin}/widget.js`;

  const embedSnippet = useMemo(
    () =>
      webhookToken
        ? `<div id="flowforge-form"></div>\n<script src="${widgetSrc}" data-token="${webhookToken}" data-api="${apiBase}" data-target="#flowforge-form"></script>`
        : '',
    [webhookToken, widgetSrc, apiBase],
  );

  const curlSnippet = useMemo(
    () =>
      webhookToken
        ? `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "raj@example.com",
    "fullName": "Raj Kumar",
    "company": "Acme Corp",
    "message": "I want a demo"
  }'`
        : '',
    [webhookToken, webhookUrl],
  );

  const rotateMutation = useMutation({
    mutationFn: () =>
      api.post<{ webhookToken: string; webhookSecret: string }>(
        `/workspaces/${workspaceId}/workflows/${workflowId}/webhook/rotate-secret`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workflow(workspaceId, workflowId) });
    },
  });

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    });
  };

  if (!webhookToken) {
    return (
      <div className="space-y-3 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        <p>
          A webhook URL will be generated automatically the first time you <strong>Save & publish</strong> this
          workflow with the Webhook Trigger node.
        </p>
      </div>
    );
  }

  if (!publishedHasWebhook) {
    return (
      <div className="space-y-3 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        <p>
          Webhook credentials exist for this workflow but the currently published version doesn't include a Webhook
          Trigger. Click <strong>Save & publish</strong> to make the URL live again.
        </p>
        <CodeBlock label="Webhook URL" value={webhookUrl} onCopy={copy} copiedLabel={copied} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
        <TabButton active={tab === 'url'} onClick={() => setTab('url')}>URL</TabButton>
        <TabButton active={tab === 'embed'} onClick={() => setTab('embed')}>Embed</TabButton>
        <TabButton active={tab === 'curl'} onClick={() => setTab('curl')}>cURL</TabButton>
        <TabButton active={tab === 'security'} onClick={() => setTab('security')}>Security</TabButton>
      </div>

      {tab === 'url' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            POST JSON or form-encoded data to this URL. The body must include at least an <code>email</code> field.
          </p>
          <CodeBlock label="Webhook URL" value={webhookUrl} onCopy={copy} copiedLabel={copied} />
          <a
            href={hostedFormUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink size={12} /> Open hosted form
          </a>
        </div>
      )}

      {tab === 'embed' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Paste this anywhere on your site (Wix, WordPress, static HTML). A styled form will appear and
            submissions will flow into this workflow.
          </p>
          <CodeBlock label="Embed snippet" value={embedSnippet} onCopy={copy} copiedLabel={copied} multiline />
          <p className="text-xs text-muted-foreground">
            Or share the hosted page directly:{' '}
            <a className="text-primary hover:underline" href={hostedFormUrl} target="_blank" rel="noreferrer">
              {hostedFormUrl}
            </a>
          </p>
        </div>
      )}

      {tab === 'curl' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Test from your terminal:</p>
          <CodeBlock label="cURL" value={curlSnippet} onCopy={copy} copiedLabel={copied} multiline />
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            For production, sign each request with this HMAC secret. Send the signature in the{' '}
            <code>X-FlowForge-Signature</code> header as <code>sha256=&lt;hex&gt;</code>. Unsigned requests are still
            accepted by default — useful for Tally/Typeform integrations.
          </p>
          <div>
            <label className="text-xs font-medium">Signing secret</label>
            <div className="mt-1 flex items-center gap-1">
              <input
                className="flex-1 rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs"
                value={secretVisible ? webhookSecret ?? '' : '•'.repeat(48)}
                readOnly
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSecretVisible((v) => !v)}
                title={secretVisible ? 'Hide' : 'Reveal'}
              >
                {secretVisible ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => webhookSecret && copy(webhookSecret, 'secret')}
                disabled={!secretVisible}
                title="Copy"
              >
                {copied === 'secret' ? <Check size={14} /> : <Copy size={14} />}
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              if (window.confirm('Rotate the signing secret? The old one will stop working immediately.')) {
                rotateMutation.mutate();
              }
            }}
            disabled={rotateMutation.isPending}
          >
            <RefreshCw size={14} /> {rotateMutation.isPending ? 'Rotating…' : 'Rotate secret'}
          </Button>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

function CodeBlock({
  label,
  value,
  onCopy,
  copiedLabel,
  multiline,
}: {
  label: string;
  value: string;
  onCopy: (v: string, label: string) => void;
  copiedLabel: string | null;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium">{label}</label>
        <button
          onClick={() => onCopy(value, label)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {copiedLabel === label ? <Check size={12} /> : <Copy size={12} />}
          {copiedLabel === label ? 'Copied' : 'Copy'}
        </button>
      </div>
      {multiline ? (
        <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed">
          {value}
        </pre>
      ) : (
        <input
          className="w-full rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs"
          value={value}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}
