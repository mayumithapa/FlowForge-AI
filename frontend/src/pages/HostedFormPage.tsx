import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

interface FormField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select';
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface Schema {
  workflowName: string;
  workspaceName: string;
  fields: FormField[];
}

/**
 * Standalone public form page at /f/:token.
 *
 * For non-technical customers who can't even paste a <script> tag — they
 * share this URL via WhatsApp / email signature / social bio. The page is
 * intentionally framed in a way that lets it stand on its own without the
 * authenticated AppShell chrome.
 */
export function HostedFormPage() {
  const { token } = useParams<{ token: string }>();
  const apiBase = useMemo(
    () => (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/api$/, ''),
    [],
  );

  const [schema, setSchema] = useState<Schema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${apiBase}/api/webhooks/${token}/schema`)
      .then((r) => {
        if (!r.ok) throw new Error('This form is not active.');
        return r.json();
      })
      .then((data) => {
        setSchema(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load form.');
        setLoading(false);
      });
  }, [token, apiBase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${apiBase}/api/webhooks/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Submission failed.');
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        {loading && <Centered>Loading…</Centered>}
        {error && !loading && <Centered tone="error">{error}</Centered>}

        {!loading && !error && schema && !submitted && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-lg">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {schema.workspaceName}
            </div>
            <h1 className="mb-6 text-2xl font-semibold text-slate-900">{schema.workflowName}</h1>

            <form onSubmit={submit} className="space-y-4">
              {schema.fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    {f.label} {f.required && <span className="text-rose-500">*</span>}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      rows={4}
                      placeholder={f.placeholder}
                      required={f.required}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                  ) : f.type === 'select' && f.options ? (
                    <select
                      required={f.required}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="">Select…</option>
                      {f.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                      placeholder={f.placeholder}
                      required={f.required}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                  )}
                </div>
              ))}

              {submitError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:opacity-95 disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </form>

            <div className="mt-6 text-right text-[11px] text-slate-400">Powered by FlowForge AI</div>
          </div>
        )}

        {submitted && (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-lg">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-2xl font-bold text-white">
              ✓
            </div>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Thanks — we got it.</h2>
            <p className="text-sm text-slate-500">A reply is on its way to your inbox.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div
      className={`mx-auto max-w-md rounded-xl border bg-white p-12 text-center shadow-sm ${
        tone === 'error' ? 'border-rose-200 text-rose-600' : 'border-slate-200 text-slate-500'
      }`}
    >
      {children}
    </div>
  );
}
