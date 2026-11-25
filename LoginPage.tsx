import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { regulatoryLine, USE_MOCK } from '@core/config';
import { useSession } from '@core/hooks/useSession';
import { signInSchema, type SignInValues } from '@core/payments/schemas';
import { Button } from '../components/Button';
import { Input } from '../components/Form';
import { Logo } from '../components/Logo';
import { Alert } from '../components/Primitives';

/** Mock sign-in. Any email and password work in the test version. */
export function LoginPage() {
  const session = useSession();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: 'sam.carter@acmetrading.example', password: 'test-password' },
  });
  if (session.status === 'signedIn') return <Navigate to="/dashboard" replace />;
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo size="lg" /></div>
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="text-xl font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Collect, convert, send and pay from one business account.</p>
          {session.signedOutReason === 'idle' && (
            <Alert tone="info" className="mt-4" title="You were signed out" live>
              <p>We signed you out after 15 minutes without activity. Any payment you’d started is saved as a draft.</p>
            </Alert>
          )}
          <form className="mt-5 space-y-4" noValidate onSubmit={handleSubmit(async () => { await session.signIn(); })}>
            <Input label="Email" type="email" autoComplete="username" error={errors.email?.message} {...register('email')} />
            <Input label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
            <Button type="submit" block size="lg" loading={isSubmitting}>Sign in</Button>
          </form>
          {USE_MOCK && <p className="mt-4 text-center text-xs text-muted">Test version — any email and password will sign you in.</p>}
        </div>
        <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {regulatoryLine()}
        </p>
      </div>
    </div>
  );
}
