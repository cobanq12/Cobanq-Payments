import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from '@core/hooks/useSession';
import { Spinner } from './components/Primitives';
import { AppShell } from './layout/AppShell';
import { BeneficiariesPage } from './screens/beneficiaries/BeneficiariesPage';
import { BatchPage } from './screens/bulk/BatchPage';
import { BulkPage } from './screens/bulk/BulkPage';
import { ConvertPage } from './screens/convert/ConvertPage';
import { DashboardPage } from './screens/DashboardPage';
import { LoginPage } from './screens/LoginPage';
import { PaymentsPage } from './screens/payments/PaymentsPage';
import { WizardPage } from './screens/payments/wizard/WizardPage';
import { PlaceholderPage } from './screens/PlaceholderPage';

function Protected() {
  const session = useSession();
  if (session.status === 'loading') return <div className="flex min-h-[100dvh] items-center justify-center"><Spinner /></div>;
  if (session.status === 'signedOut') return <Navigate to="/login" replace />;
  return <AppShell />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/accounts" element={<PlaceholderPage title="Accounts" description="Your balances and account details." />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/payments/new" element={<WizardPage />} />
        <Route path="/payments/bulk" element={<BulkPage />} />
        <Route path="/payments/bulk/:id" element={<BatchPage />} />
        <Route path="/convert" element={<ConvertPage />} />
        <Route path="/beneficiaries" element={<BeneficiariesPage />} />
        <Route path="/statements" element={<PlaceholderPage title="Statements" description="Download statements for any balance." />} />
        <Route path="/settings" element={<PlaceholderPage title="Settings" description="Users, roles, limits and notifications." />} />
        <Route path="*" element={<PlaceholderPage title="Page not found" description="We couldn’t find that page." />} />
      </Route>
    </Routes>
  );
}
