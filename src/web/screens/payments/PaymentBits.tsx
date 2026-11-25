import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { BankDetails, CopCheck, FeeLine } from '@core/api/types';
import { formatDate, isoToUkDate } from '@core/lib/dates';
import { formatMoney } from '@core/lib/money';
import { accountRows } from '@core/payments/confirmationDoc';
import { COP_META } from '@core/payments/statuses';
import { Badge, Row } from '../../components/Primitives';

/** Bank identifiers for a beneficiary, formatted for display. */
export function AccountRows({ details }: { details: BankDetails }) {
  return <>{accountRows(details).map((r) => <Row key={r.label} label={r.label}><span className="num">{r.value}</span></Row>)}</>;
}

export function FeeRows({ fees }: { fees: FeeLine[] }) {
  return <>{fees.map((f) => <Row key={f.label} label={f.label}><span className="num">{formatMoney(f.amount)}</span></Row>)}</>;
}

/** Confirmation of Payee result as a badge with icon, colour and text. */
export function CopBadge({ cop, withDate }: { cop?: CopCheck; withDate?: boolean }) {
  if (!cop) return null;
  const meta = COP_META[cop.result];
  const Icon = cop.result === 'MATCH' ? ShieldCheck : cop.result === 'UNAVAILABLE' ? ShieldQuestion : ShieldAlert;
  return (
    <Badge tone={meta.tone} icon={<Icon className="h-3 w-3" aria-hidden="true" />}>
      {meta.label}{cop.acknowledged ? ' — continued anyway' : ''}{withDate ? ` · ${formatDate(isoToUkDate(cop.checkedAt))}` : ''}
    </Badge>
  );
}
