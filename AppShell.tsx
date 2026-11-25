import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Building2, Check, ChevronDown, LogOut, Menu, Moon, Sun, User as UserIcon } from 'lucide-react';
import type { AppNotification } from '@core/api/types';
import { regulatoryLine, USE_MOCK } from '@core/config';
import { useAccount } from '@core/hooks/useAccount';
import { useNotifications } from '@core/hooks/useNotifications';
import { useSession } from '@core/hooks/useSession';
import { formatDateTime } from '@core/lib/dates';
import { formatCountdown, initials } from '@core/lib/format';
import { Button, IconButton } from '../components/Button';
import { cn } from '../components/cn';
import { Logo } from '../components/Logo';
import { Modal, useDismiss } from '../components/Overlay';
import { Badge } from '../components/Primitives';
import { useToast } from '../components/Toast';
import { TestPanel } from '../test-panel/TestPanel';
import { useTheme } from '../theme';
import { MOBILE_PRIMARY, NAV, type NavItem } from './nav';

function isActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/payments') return pathname === '/payments' || (pathname.startsWith('/payments/') && !pathname.startsWith('/payments/bulk'));
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function Sidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col bg-sidebar lg:flex">
      <Link to="/dashboard" className="mx-3 mt-4 rounded-md px-2 py-1" aria-label="Cobanq home">
        <Logo />
      </Link>
      <nav className="mt-6 flex-1 space-y-1 px-3" aria-label="Main">
        {NAV.map((item) => {
          const active = isActive(item, pathname);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-sidebar-active text-white' : 'text-sidebar-fg hover:bg-white/5 hover:text-white',
              )}
            >
              <item.icon className={cn('h-[18px] w-[18px]', active && 'text-accent')} aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <p className="px-5 pb-5 text-[11px] leading-4 text-sidebar-fg/70">Cobanq is a trading name of COBANQ LTD.</p>
    </aside>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  const primary = NAV.filter((n) => MOBILE_PRIMARY.includes(n.to));
  const rest = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.to));
  useEffect(() => setMore(false), [pathname]);
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
        {primary.map((item) => {
          const active = isActive(item, pathname);
          return (
            <NavLink key={item.to} to={item.to} aria-current={active ? 'page' : undefined}
              className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', active ? 'text-accent-text' : 'text-muted')}>
              <item.icon className="h-5 w-5" aria-hidden="true" />
              {item.label.replace(' payments', '')}
            </NavLink>
          );
        })}
        <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog"
          className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', rest.some((r) => isActive(r, pathname)) ? 'text-accent-text' : 'text-muted')}>
          <Menu className="h-5 w-5" aria-hidden="true" />
          More
        </button>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="More">
        <ul className="space-y-1">
          {rest.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-ink hover:bg-subtle">
                <item.icon className="h-5 w-5 text-muted" aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, onClose);
  if (!open) return null;
  return <div ref={ref} className={cn('absolute right-0 top-full z-30 mt-2 rounded-lg border border-line bg-surface shadow-lg animate-fade-in', className)}>{children}</div>;
}

function BusinessSwitcher() {
  const account = useAccount();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const name = account.data?.businessName ?? 'Acme Trading Ltd';
  return (
    <div className="relative min-w-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex h-10 max-w-full items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-subtle">
        <Building2 className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="truncate">{name}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="left-0 right-auto w-64 p-1">
        <div role="menu" aria-label="Switch business">
          <button type="button" role="menuitemradio" aria-checked="true" onClick={() => setOpen(false)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-subtle">
            {name} <Check className="h-4 w-4 text-accent-text" aria-hidden="true" />
          </button>
          <button type="button" role="menuitemradio" aria-checked="false"
            onClick={() => { setOpen(false); toast.push({ title: 'Test version', body: 'Only Acme Trading Ltd is set up in the test data.', tone: 'info' }); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-muted hover:bg-subtle">
            Acme Trading (Europe) BV
          </button>
        </div>
      </Popover>
    </div>
  );
}

function NotificationsBell({ notifications, unread, markRead }: { notifications: AppNotification[]; unread: number; markRead: () => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const toneOf = { success: 'success', warning: 'warning', danger: 'danger', info: 'info' } as const;
  return (
    <div className="relative">
      <IconButton
        label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen((o) => !o); if (!open && unread > 0) markRead(); }}
        className="relative"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white dark:text-[#2A0B08]" aria-hidden="true">{unread}</span>
        )}
      </IconButton>
      <Popover open={open} onClose={() => setOpen(false)} className="w-[min(22rem,calc(100vw-1.5rem))]">
        <div role="dialog" aria-label="Notifications">
          <p className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Notifications</p>
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No updates yet. Payment status changes appear here.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto scrollbar-thin">
              {notifications.slice(0, 15).map((n) => (
                <li key={n.id} className="border-b border-line last:border-0">
                  <button type="button" className="w-full px-4 py-3 text-left hover:bg-subtle"
                    onClick={() => {
                      setOpen(false);
                      if (n.paymentId) navigate(`/payments?payment=${n.paymentId}`);
                      else if (n.batchId) navigate(`/payments/bulk/${n.batchId}`);
                    }}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">{n.title}</span>
                      <Badge tone={toneOf[n.tone]}>{n.tone === 'danger' ? 'Action' : n.tone === 'success' ? 'Done' : 'Update'}</Badge>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                    <span className="mt-1 block text-xs text-muted num">{formatDateTime(n.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Popover>
    </div>
  );
}

const ROLE_LABEL = { MAKER: 'Maker', APPROVER: 'Approver', ADMIN: 'Admin' } as const;

function UserMenu() {
  const account = useAccount();
  const session = useSession();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(false);
  const user = account.data?.user;
  const item = 'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-subtle';
  return (
    <div className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="User menu" onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-full pl-1 pr-2 hover:bg-subtle">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-fg" aria-hidden="true">{user ? initials(user.name) : '…'}</span>
        <ChevronDown className="h-4 w-4 text-muted" aria-hidden="true" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-64 p-1">
        <div className="border-b border-line px-3 py-3">
          <p className="text-sm font-semibold text-ink">{user?.name ?? '—'}</p>
          <p className="truncate text-xs text-muted">{user?.email}</p>
          {user && <Badge tone="info" className="mt-2">{ROLE_LABEL[user.role]}</Badge>}
        </div>
        <div role="menu" aria-label="User menu" className="pt-1">
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); setProfile(true); }}>
            <UserIcon className="h-4 w-4 text-muted" aria-hidden="true" /> Profile
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={theme.resolved === 'dark'} className={item} onClick={theme.toggle}>
            {theme.resolved === 'dark' ? <Sun className="h-4 w-4 text-muted" aria-hidden="true" /> : <Moon className="h-4 w-4 text-muted" aria-hidden="true" />}
            {theme.resolved === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); void session.signOut('manual'); }}>
            <LogOut className="h-4 w-4 text-muted" aria-hidden="true" /> Sign out
          </button>
        </div>
      </Popover>
      <Modal open={profile} onClose={() => setProfile(false)} title="Profile" footer={<Button variant="secondary" onClick={() => setProfile(false)}>Close</Button>}>
        <dl className="divide-y divide-line text-sm">
          {[
            ['Name', user?.name], ['Email', user?.email], ['Role', user ? ROLE_LABEL[user.role] : ''], ['Business', account.data?.businessName],
            ['IBAN', account.data?.iban.replace(/(.{4})(?=.)/g, '$1 ')], ['BIC', account.data?.bic],
            ['Sort code', account.data?.sortCode.replace(/(\d{2})(?=\d)/g, '$1-')], ['Account number', account.data?.accountNumber],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="num text-right font-medium text-ink">{v ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </div>
  );
}

/** Idle warning after 10 minutes; automatic sign-out at 15. Drafts are preserved. */
function IdleGuard() {
  const session = useSession();
  const { touch } = session;
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    const handler = (): void => touch();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [touch]);
  return (
    <Modal
      open={session.idleWarning}
      title="Are you still there?"
      description="For your security we’ll sign you out soon. Any payment you’ve started is saved as a draft."
      footer={<>
        <Button variant="secondary" onClick={() => { void session.signOut('manual'); }}>Sign out now</Button>
        <Button onClick={session.stay} data-autofocus>Stay signed in</Button>
      </>}
    >
      <p className="text-center text-4xl font-semibold text-ink num" role="timer" aria-live="off">{formatCountdown(session.secondsToLogout)}</p>
      <p className="mt-2 text-center text-sm text-muted">until you’re signed out</p>
    </Modal>
  );
}

export function AppShell() {
  const toast = useToast();
  const navigate = useNavigate();
  const { notifications, unread, markRead } = useNotifications((n) => {
    toast.push({
      title: n.title, body: n.body, tone: n.tone,
      action: n.paymentId
        ? { label: 'View payment', onClick: () => navigate(`/payments?payment=${n.paymentId}`) }
        : n.batchId ? { label: 'View batch', onClick: () => navigate(`/payments/bulk/${n.batchId}`) } : undefined,
    });
  });

  return (
    <div className="min-h-[100dvh]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg">Skip to content</a>
      <Sidebar />
      <div className="min-w-0 lg:pl-60">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link to="/dashboard" className="shrink-0 rounded-md lg:hidden" aria-label="Cobanq home"><Logo size="sm" /></Link>
            <BusinessSwitcher />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationsBell notifications={notifications} unread={unread} markRead={markRead} />
            <UserMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 outline-none sm:px-6 lg:pb-12">
          <Outlet />
        </main>
        <footer className="mx-auto hidden max-w-6xl px-6 pb-8 text-xs leading-5 text-muted lg:block">{regulatoryLine()}</footer>
      </div>
      <BottomNav />
      <IdleGuard />
      {USE_MOCK && <TestPanel />}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && <Link to={back.to} className="mb-2 inline-flex items-center text-sm font-medium text-accent-text hover:underline">← {back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
