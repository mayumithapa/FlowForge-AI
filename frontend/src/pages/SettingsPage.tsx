import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, Crown, Shield, Eye, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { relativeTime } from '@/lib/utils';

interface Member {
  id: string;
  role: string;
  createdAt: string;
  user: { id: string; email: string; fullName: string | null; avatarUrl: string | null };
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  OWNER: <Crown size={12} className="text-yellow-500" />,
  ADMIN: <Shield size={12} className="text-blue-500" />,
  MEMBER: <User size={12} className="text-muted-foreground" />,
  VIEWER: <Eye size={12} className="text-muted-foreground" />,
};

export function SettingsPage() {
  const qc = useQueryClient();
  const { workspace, user } = useAuthStore();
  const wsId = workspace?.id;
  const [tab, setTab] = useState<'general' | 'members'>('members');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const membersQ = useQuery({
    queryKey: ['members', wsId],
    queryFn: () => api.get<Member[]>(`/workspaces/${wsId}/members`),
    enabled: !!wsId,
  });

  const invitesQ = useQuery({
    queryKey: ['invites', wsId],
    queryFn: () => api.get<Invite[]>(`/workspaces/${wsId}/invites`),
    enabled: !!wsId,
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      api.post(`/workspaces/${wsId}/invites`, { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      setMsg({ text: `Invite sent to ${inviteEmail}!`, ok: true });
      setInviteEmail('');
      qc.invalidateQueries({ queryKey: ['invites', wsId] });
    },
    onError: (err: any) => setMsg({ text: err.message, ok: false }),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (inviteId: string) =>
      api.del(`/workspaces/${wsId}/invites/${inviteId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites', wsId] }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      api.del(`/workspaces/${wsId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', wsId] }),
    onError: (err: any) => setMsg({ text: err.message, ok: false }),
  });

  const members = membersQ.data ?? [];
  const invites = invitesQ.data ?? [];

  return (
    <>
      <PageHeader title="Settings" description="Manage your workspace and team." />

      <div className="space-y-6 p-8">
        {/* Tab switcher */}
        <div className="inline-flex rounded-lg border border-border p-1">
          {(['general', 'members'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'members' ? `Team (${members.length})` : 'General'}
            </button>
          ))}
        </div>

        {/* ── General tab ─────────────────────────────────────────────────────── */}
        {tab === 'general' && (
          <Card>
            <CardContent className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-xs font-medium">Workspace name</label>
                <Input defaultValue={workspace?.name} readOnly className="max-w-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Your email</label>
                <Input defaultValue={user?.email} readOnly className="max-w-sm" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Members tab ──────────────────────────────────────────────────────── */}
        {tab === 'members' && (
          <div className="space-y-6">
            {/* Invite form */}
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 text-sm font-semibold">Invite a team member</div>
                <div className="flex gap-2">
                  <Input
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && inviteEmail && inviteMutation.mutate()}
                    className="flex-1"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                  <Button
                    onClick={() => inviteEmail && inviteMutation.mutate()}
                    disabled={!inviteEmail || inviteMutation.isPending}
                  >
                    <UserPlus size={15} />
                    {inviteMutation.isPending ? 'Sending…' : 'Invite'}
                  </Button>
                </div>
                {msg && (
                  <p className={`mt-2 text-xs ${msg.ok ? 'text-emerald-500' : 'text-red-500'}`}>
                    {msg.text}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Current members */}
            <Card>
              <CardContent className="p-0">
                <div className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Current members
                </div>
                <Table>
                  <THead>
                    <TR>
                      <TH>Member</TH>
                      <TH>Role</TH>
                      <TH>Joined</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {members.map((m) => (
                      <TR key={m.id}>
                        <TD>
                          <div className="font-medium">{m.user.fullName ?? m.user.email}</div>
                          <div className="text-xs text-muted-foreground">{m.user.email}</div>
                        </TD>
                        <TD>
                          <span className="inline-flex items-center gap-1 text-sm">
                            {ROLE_ICONS[m.role]}
                            {m.role}
                          </span>
                        </TD>
                        <TD className="text-muted-foreground">{relativeTime(m.createdAt)}</TD>
                        <TD>
                          {m.user.id !== user?.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (window.confirm(`Remove ${m.user.email} from the workspace?`)) {
                                  removeMemberMutation.mutate(m.user.id);
                                }
                              }}
                              className="text-red-500 hover:text-red-600"
                            >
                              <Trash2 size={13} />
                            </Button>
                          )}
                        </TD>
                      </TR>
                    ))}
                    {members.length === 0 && !membersQ.isLoading && (
                      <TR>
                        <TD colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                          No members yet.
                        </TD>
                      </TR>
                    )}
                  </TBody>
                </Table>
              </CardContent>
            </Card>

            {/* Pending invites */}
            {invites.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <div className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pending invites
                  </div>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Email</TH>
                        <TH>Role</TH>
                        <TH>Expires</TH>
                        <TH></TH>
                      </TR>
                    </THead>
                    <TBody>
                      {invites.map((inv) => (
                        <TR key={inv.id}>
                          <TD className="font-medium">{inv.email}</TD>
                          <TD>
                            <Badge variant="muted">{inv.role}</Badge>
                          </TD>
                          <TD className="text-muted-foreground">{relativeTime(inv.expiresAt)}</TD>
                          <TD>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelInviteMutation.mutate(inv.id)}
                              className="text-muted-foreground hover:text-red-500"
                            >
                              <Trash2 size={13} /> Cancel
                            </Button>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
