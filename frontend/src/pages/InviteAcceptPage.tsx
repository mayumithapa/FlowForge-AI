import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface InviteInfo {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  workspace: { name: string; slug: string };
}

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const nav = useNavigate();
  const { accessToken, user } = useAuthStore();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<InviteInfo>(`/invites/${token}`, { auth: false })
      .then(setInvite)
      .catch((err) => setError(err.message || 'Invite not found or expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    if (!accessToken) {
      // Redirect to login, come back here after
      nav(`/login?redirect=/invite/${token}`);
      return;
    }
    setAccepting(true);
    try {
      const res = await api.post<{ workspaceId: string; workspaceName: string }>(
        `/invites/${token}/accept`,
        {},
      );
      setAccepted(true);
      // Reload to pick up new workspace membership
      setTimeout(() => nav('/dashboard'), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invite.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-white">
            <Zap size={20} />
          </div>
          <span className="text-xl font-bold text-white">FlowForge AI</span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-white">
              <Loader2 className="animate-spin" size={32} />
              <p>Loading invite…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 text-center">
              <XCircle size={40} className="text-red-400" />
              <h2 className="text-lg font-semibold text-white">Invite Invalid</h2>
              <p className="text-sm text-slate-400">{error}</p>
              <Button onClick={() => nav('/login')} variant="outline" className="mt-2">
                Go to Login
              </Button>
            </div>
          )}

          {accepted && (
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle size={40} className="text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">You're in! 🎉</h2>
              <p className="text-sm text-slate-400">Redirecting to your dashboard…</p>
            </div>
          )}

          {invite && !error && !accepted && !loading && (
            <div className="space-y-6 text-center">
              <div>
                <p className="text-sm text-slate-400">You've been invited to join</p>
                <h2 className="mt-1 text-2xl font-bold text-white">{invite.workspace.name}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  as a <span className="font-semibold text-indigo-300">{invite.role}</span>
                </p>
              </div>

              {user && user.email !== invite.email && (
                <div className="rounded-lg bg-yellow-500/10 p-3 text-xs text-yellow-300">
                  You're logged in as <strong>{user.email}</strong> but this invite is for{' '}
                  <strong>{invite.email}</strong>. Please log in with the correct account.
                </div>
              )}

              {!accessToken && (
                <p className="text-xs text-slate-400">
                  You'll need to log in or register to accept this invite.
                </p>
              )}

              <Button
                className="w-full"
                onClick={handleAccept}
                disabled={accepting || (!!user && user.email !== invite.email)}
              >
                {accepting ? (
                  <><Loader2 size={15} className="animate-spin" /> Accepting…</>
                ) : !accessToken ? (
                  'Log in to Accept'
                ) : (
                  'Accept Invitation'
                )}
              </Button>

              <p className="text-xs text-slate-500">
                Invite sent to {invite.email} · Expires {new Date(invite.expiresAt).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
