import { Construction } from 'lucide-react';
import { LinkButton } from '../components/Button';
import { Card, EmptyState } from '../components/Primitives';
import { PageHeader } from '../layout/AppShell';

/** Tidy placeholder for areas outside this build (Accounts, Statements, Settings). */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState
          icon={<Construction className="h-6 w-6" aria-hidden="true" />}
          title={`${title} isn’t part of this test build`}
          action={<LinkButton to="/payments">Go to Payments</LinkButton>}
        >
          This build covers Payments, Convert, Beneficiaries and Bulk payments. The rest of the app keeps the same layout.
        </EmptyState>
      </Card>
    </>
  );
}
