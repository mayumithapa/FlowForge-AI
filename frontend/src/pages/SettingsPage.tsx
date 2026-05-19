import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  workspaces: Array<{ id: string; name: string; slug: string; role: string }>;
}

export function SettingsPage() {
  const { user, workspace } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get<Profile>('/users/me').then((p) => {
      setProfile(p);
      setFullName(p.fullName ?? '');
    });
  }, []);

  const save = async () => {
    setMessage(null);
    try {
      await api.patch('/users/me', { fullName });
      setMessage('Profile saved.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile and workspace." />
      <div className="grid gap-6 p-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={user?.email ?? ''} disabled />
            </div>
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <Button onClick={save}>Save</Button>
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <Label>Current workspace</Label>
              <div className="rounded-md border border-border p-3 text-sm">
                <div className="font-semibold">{workspace?.name}</div>
                <div className="text-xs text-muted-foreground">/{workspace?.slug}</div>
              </div>
            </div>
            <div className="mt-4 space-y-1">
              <Label>All workspaces</Label>
              <ul className="divide-y divide-border rounded-md border border-border text-sm">
                {profile?.workspaces.map((w) => (
                  <li key={w.id} className="flex items-center justify-between p-2">
                    <span>{w.name}</span>
                    <span className="text-xs text-muted-foreground">{w.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
