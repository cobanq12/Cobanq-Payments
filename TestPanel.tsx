import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, RotateCcw } from 'lucide-react';
import type { Role } from '@core/api/types';
import { useAdapters } from '@core/adapters';
import { sampleMixed, sampleUkPayroll, sampleWithErrors } from '@core/bulk/samples';
import { rowsToCsv } from '@core/bulk/template';
import { SESSION } from '@core/config';
import { useSession } from '@core/hooks/useSession';
import { useTestSettings } from '@core/hooks/useTestSettings';
import { formatDate, formatHm, nextWorkingDay, onOrNextWorkingDay } from '@core/lib/dates';
import { Button } from '../components/Button';
import { Switch } from '../components/Form';
import { Drawer, Modal } from '../components/Overlay';
import { Badge } from '../components/Primitives';
import { Segmented } from '../components/Tabs';
import { useToast } from '../components/Toast';

const MAGIC: [string, string][] = [
  ['Sort code 00-00-00', 'Confirmation of Payee: no match'],
  ['Sort code 11-11-11', 'Close match (suggests “Acme Tradng Limited”)'],
  ['Sort code 22-22-22', 'Confirmation of Payee unavailable'],
  ['Sort code 33-33-33', 'Match, but the account type differs'],
  ['Sort code 40-00-00, any account', 'Cobanq account → internal transfer'],
  ['Any other valid sort code', 'Confirmation of Payee: match'],
  ['Amount ending .13', 'Payment fails (beneficiary bank rejected), refunded'],
  ['Amount ending .31', 'In review, clears to Completed after 20 s'],
  ['Amount ending .77', 'Returned after 15 s (account closed), refunded'],
  ['Name containing TEST SANCTION', 'In review, then rejected with a generic message'],
  ['IBAN starting DE00', 'Fails the mod-97 check (invalid IBAN)'],
  ['IBAN from Germany / France / Netherlands', 'SEPA Instant reachable'],
  ['IBAN from Portugal', 'SEPA Instant not reachable → SEPA Credit Transfer only'],
  ['One-time code 000000', 'SCA failure (3 wrong codes lock for 5 minutes)'],
  ['Amount over £1,000,000 to a UK account', 'Faster Payments disabled, CHAPS recommended'],
];

const SAMPLE_IBANS: [string, string][] = [
  ['Germany', 'DE89 3704 0044 0532 0130 00'],
  ['France', 'FR14 2004 1010 0505 0001 3M02 606'],
  ['Netherlands', 'NL91 ABNA 0417 1643 00'],
  ['Portugal', 'PT50 0002 0123 1234 5678 9015 4'],
  ['Invalid', 'DE00 3704 0044 0532 0130 00'],
  ['US routing (ABA)', '021000021'],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-5 first:pt-0 last:border-0">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

/** Floating test panel (mock backend only): roles, mock clock, toggles, magic values, sample files, reset. */
export function TestPanel() {
  const t = useTestSettings();
  const session = useSession();
  const { fileSaver } = useAdapters();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  if (!t.available) return null;
  const s = t.settings;
  const ukNow = t.ukNow;
  const hhmm = `${String(Math.floor(ukNow.minutes / 60)).padStart(2, '0')}:${String(ukNow.minutes % 60).padStart(2, '0')}`;
  const weekday = onOrNextWorkingDay(ukNow.date);
  const saturday = (() => { let d = ukNow.date; while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 6) d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10); return d; })();

  const preset = (d: string, minutes: number, label: string): void => {
    t.setUkTime(d, minutes);
    toast.push({ title: 'Mock UK time changed', body: label, tone: 'info' });
  };

  const download = (name: string, rows: ReturnType<typeof sampleMixed>): void => { void fileSaver.saveText(name, rowsToCsv(rows), 'text/csv'); };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Test mode"
        className="fixed bottom-32 right-3 z-30 inline-flex h-10 items-center gap-2 rounded-full border border-warning/50 bg-warning-bg px-3 text-sm font-semibold text-warning shadow-md hover:brightness-95 sm:px-4 lg:bottom-16 lg:left-4 lg:right-auto"
      >
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Test mode</span>
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="Test mode">
        <p className="mb-4 text-sm text-muted">The backend is mocked. Nothing here moves real money. These controls only exist in the test version.</p>

        <Section title="User role">
          <Segmented<Role>
            label="User role"
            value={s?.role ?? 'MAKER'}
            onChange={(role) => t.update({ role })}
            options={[{ value: 'MAKER', label: 'Maker' }, { value: 'APPROVER', label: 'Approver' }, { value: 'ADMIN', label: 'Admin' }]}
          />
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
            <li>Maker (Sam Carter): every payment goes to “Awaiting approval”. Limits £250,000 per payment, £1,000,000 a day.</li>
            <li>Approver (Priya Shah) and Admin (Alex Morgan): can approve or reject. Limit £5,000,000.</li>
            <li>Payments over £25,000 always need a second approver — someone other than the person who created them. Switch between Approver and Admin to do both sides.</li>
          </ul>
        </Section>

        <Section title="One-time code">
          <p className="text-sm text-ink">The code that always works is <span className="num rounded bg-subtle px-2 py-1 text-base font-semibold tracking-widest">{t.otp}</span></p>
          <p className="mt-2 text-xs text-muted">Any other code fails. “Cobanq mobile app” approval auto-approves after 4 seconds.</p>
        </Section>

        <Section title="Mock UK time">
          <p className="text-sm text-ink">
            Now: <span className="num font-semibold">{formatDate(ukNow.date)}, {hhmm}</span>{' '}
            {t.timeShifted ? <Badge tone="warning">Shifted</Badge> : <Badge tone="neutral">Real time</Badge>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => { t.useRealTime(); toast.push({ title: 'Using real time', tone: 'info' }); }}>Real time</Button>
            <Button size="sm" variant="secondary" onClick={() => preset(weekday, 10 * 60, `${formatDate(weekday)}, 10:00 — a working day, before cut-offs`)}>Working day 10:00</Button>
            <Button size="sm" variant="secondary" onClick={() => preset(weekday, 15 * 60 + 5, `${formatDate(weekday)}, 15:05 — 25 minutes before the CHAPS cut-off`)}>CHAPS cut-off close (15:05)</Button>
            <Button size="sm" variant="secondary" onClick={() => preset(weekday, 16 * 60, `${formatDate(weekday)}, 16:00 — after the ${formatHm('15:30')} CHAPS cut-off`)}>After cut-off (16:00)</Button>
            <Button size="sm" variant="secondary" onClick={() => preset(saturday, 11 * 60, `${formatDate(saturday)}, 11:00 — a Saturday`)}>Saturday 11:00</Button>
            <Button size="sm" variant="secondary" onClick={() => preset('2026-12-25', 11 * 60, 'Christmas Day 2026 — a bank holiday')}>Bank holiday</Button>
            <Button size="sm" variant="secondary" onClick={() => preset(nextWorkingDay(nextWorkingDay(nextWorkingDay(nextWorkingDay(nextWorkingDay(ukNow.date))))), 9 * 60, 'Five working days ahead — scheduled payments will run')}>+5 working days</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-muted">Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="num mt-1 block h-9 rounded-md border border-strong bg-surface px-2 text-sm text-ink" />
            </label>
            <label className="text-xs font-medium text-muted">Time (UK)
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="num mt-1 block h-9 rounded-md border border-strong bg-surface px-2 text-sm text-ink" />
            </label>
            <Button size="sm" disabled={!date || !time} onClick={() => { const [h, m] = time.split(':').map(Number) as [number, number]; preset(date, h * 60 + m, `${formatDate(date)}, ${time}`); }}>Set time</Button>
          </div>
          <p className="mt-2 text-xs text-muted">Time keeps running from the moment you set. Moving forward also runs any scheduled payments that fall due.</p>
        </Section>

        <Section title="Service toggles">
          <div className="space-y-4">
            <Switch label="SEPA Instant reachability" description="Off: no bank can receive SEPA Instant, so euro payments use SEPA Credit Transfer." checked={s?.sepaInstantReachable ?? true} onChange={(v) => t.update({ sepaInstantReachable: v })} />
            <Switch label="Confirmation of Payee service" description="Off: every name check comes back “unavailable”." checked={s?.copAvailable ?? true} onChange={(v) => t.update({ copAvailable: v })} />
            <Switch label="FX volatility" description="On: the rate moves a little on every new quote, so “Rate updated” shows." checked={s?.fxVolatility ?? true} onChange={(v) => t.update({ fxVolatility: v })} />
          </div>
        </Section>

        <Section title="Test funds and session">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => { t.addFunds({ amount: 500_000_000, currency: 'GBP' }); toast.push({ title: '£5,000,000 added to GBP', tone: 'success' }); }}>Add £5,000,000</Button>
            <Button size="sm" variant="secondary" onClick={() => { t.addFunds({ amount: 25_000_000, currency: 'EUR' }); toast.push({ title: '€250,000 added to EUR', tone: 'success' }); }}>Add €250,000</Button>
            <Button size="sm" variant="secondary" onClick={() => { t.addFunds({ amount: 25_000_000, currency: 'USD' }); toast.push({ title: '$250,000 added to USD', tone: 'success' }); }}>Add $250,000</Button>
            <Button size="sm" variant="secondary" onClick={() => { setOpen(false); session.simulateIdle(SESSION.warnAfterMs); }}>Show idle warning</Button>
            <Button size="sm" variant="secondary" onClick={() => { setOpen(false); session.simulateIdle(SESSION.logoutAfterMs - 5000); }}>Idle sign-out in 5 s</Button>
          </div>
          <p className="mt-2 text-xs text-muted">Add funds before testing a CHAPS payment over £1,000,000 (and switch to Approver — the Maker limit is £250,000).</p>
        </Section>

        <Section title="Sample bulk files">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => download('sample-1000-uk-payroll.csv', sampleUkPayroll())}>1,000 UK rows</Button>
            <Button size="sm" variant="secondary" onClick={() => download('sample-mixed-rails.csv', sampleMixed())}>Mixed rails (UK + SEPA + SWIFT)</Button>
            <Button size="sm" variant="secondary" onClick={() => download('sample-with-errors.csv', sampleWithErrors())}>File with errors</Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Download, then upload on{' '}
            <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => { setOpen(false); navigate('/payments/bulk'); }}>Bulk payments</button>. The bulk page can also load them in one click.
          </p>
        </Section>

        <Section title="Magic values">
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="bg-subtle text-muted">
                <tr><th scope="col" className="px-3 py-2 font-semibold">Input</th><th scope="col" className="px-3 py-2 font-semibold">Triggers</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {MAGIC.map(([input, result]) => (
                  <tr key={input}><td className="num px-3 py-2 font-medium text-ink">{input}</td><td className="px-3 py-2 text-muted">{result}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mb-2 mt-4 text-xs font-semibold text-ink">Valid test identifiers</p>
          <ul className="space-y-1 text-xs">
            {SAMPLE_IBANS.map(([label, value]) => (
              <li key={label} className="flex justify-between gap-3"><span className="text-muted">{label}</span><span className="num select-all font-medium text-ink">{value}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Every other payment goes Processing → Sent → Completed: about 5 s for Faster Payments, SEPA Instant and internal transfers, about 20 s for the rest.</p>
        </Section>

        <Section title="Reset">
          <Button variant="danger" size="sm" icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />} onClick={() => setConfirmReset(true)}>Reset all data</Button>
          <p className="mt-2 text-xs text-muted">Restores balances, beneficiaries and payment history, and puts the clock back to real time.</p>
        </Section>
      </Drawer>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset all test data?"
        description="Balances, beneficiaries, payments and batches go back to the starting data. This can’t be undone."
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button variant="danger" onClick={async () => {
            await t.reset();
            setConfirmReset(false);
            setOpen(false);
            toast.push({ title: 'Test data reset', tone: 'success' });
            navigate('/payments');
          }}>Reset</Button>
        </>}
      >
        <p className="text-sm text-muted">Your light/dark setting and any payment draft are kept.</p>
      </Modal>
    </>
  );
}
