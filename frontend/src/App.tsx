import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { WorkflowsPage } from '@/pages/WorkflowsPage';
import { WorkflowBuilderPage } from '@/pages/WorkflowBuilderPage';
import { LeadsPage } from '@/pages/LeadsPage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { CampaignsPage } from '@/pages/CampaignsPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { HostedFormPage } from '@/pages/HostedFormPage';
import { SentEmailsPage } from '@/pages/SentEmailsPage';
import { useAuthStore } from '@/stores/auth';

export default function App() {
  const { accessToken } = useAuthStore();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Public hosted forms — no auth, no AppShell chrome */}
      <Route path="/f/:token" element={<HostedFormPage />} />

      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/workflows/:id" element={<WorkflowBuilderPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/emails" element={<SentEmailsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to={accessToken ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
