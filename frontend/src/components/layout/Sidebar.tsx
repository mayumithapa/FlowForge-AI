import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Workflow,
  BarChart3,
  Mail,
  Inbox,
  Megaphone,
  Settings,
  Users,
  LogOut,
  Zap,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';

const links = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/workflows', icon: Workflow, label: 'Workflows' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/templates', icon: Mail, label: 'Templates' },
  { to: '/campaigns', icon: Megaphone, label: 'Campaigns' },
  { to: '/emails', icon: Inbox, label: 'Sent Emails' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const nav = useNavigate();
  const { user, workspace, logout } = useAuthStore();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-primary to-accent text-primary-foreground">
          <Zap size={18} />
        </div>
        <div>
          <div className="text-sm font-semibold">FlowForge AI</div>
          <div className="text-xs text-muted-foreground">{workspace?.name ?? 'No workspace'}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary/15 text-primary-foreground text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <l.icon size={16} />
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 px-2 text-xs text-muted-foreground">
          Signed in as
          <div className="truncate text-sm text-foreground">{user?.email}</div>
        </div>
        <button
          onClick={async () => {
            await logout();
            nav('/login');
          }}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut size={16} /> Log out
        </button>
      </div>
    </aside>
  );
}
