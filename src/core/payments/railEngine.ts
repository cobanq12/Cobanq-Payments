/**
 * Rail selection engine. A pure function: given the payment facts and a config,
 * it returns every rail with eligibility, fee, arrival and the recommended choice.
 * The server runs the same code, so it stays the source of truth.
 */
import type { ChargeOption, Money, RailId, RailInput, RailOption, RailSelection } from '../api/types';
import { isSepaCountry } from '../lib/countries';
import {
  addWorkingDays, evaluateCutoff, formatDayShort, formatHm, onOrNextWorkingDay, toUkTime, type IsoDate,
} from '../lib/dates';
import { formatMoney } from '../lib/money';
import { RAIL_NAMES, railConfig as defaultConfig, type RailConfig } from './railConfig';

export type Corridor = 'UK_GBP' | 'SEPA_EUR' | 'INTL_GBP' | 'INTL';

export function corridorOf(country: string, currency: string): Corridor {
  const cc = country.toUpperCase();
  if (currency === 'GBP') return cc === 'GB' ? 'UK_GBP' : 'INTL_GBP';
  if (currency === 'EUR' && isSepaCountry(cc)) return 'SEPA_EUR';
  return 'INTL';
}

interface Timing {
  arrivalDate: IsoDate;
  arrivalText: string;
  note?: string;
}

/** The working day a cut-off rail will process on, and whether that is "today before cut-off". */
function processingDay(input: RailInput, cutoff: string): { date: IsoDate; sameDay: boolean; missedCutoff: boolean } {
  const nowUk = toUkTime(input.now);
  if (input.scheduled) return { date: onOrNextWorkingDay(input.paymentDate), sameDay: false, missedCutoff: false };
  const r = evaluateCutoff(nowUk, cutoff);
  return { date: r.processingDate, sameDay: r.sameDay, missedCutoff: !r.sameDay };
}

function instantTiming(input: RailInput, todayText: string): Timing {
  if (input.scheduled) return { arrivalDate: input.paymentDate, arrivalText: `Arrives ${formatDayShort(input.paymentDate)}` };
  return { arrivalDate: toUkTime(input.now).date, arrivalText: todayText };
}

function chapsTiming(input: RailInput, cfg: RailConfig): Timing {
  const p = processingDay(input, cfg.cutoffs.CHAPS);
  const cutoff = formatHm(cfg.cutoffs.CHAPS);
  if (p.sameDay) return { arrivalDate: p.date, arrivalText: `Today if sent before ${cutoff}`, note: `Cut-off ${cutoff} UK time on working days` };
  if (input.scheduled) return { arrivalDate: p.date, arrivalText: `Arrives ${formatDayShort(p.date)}`, note: 'Sent on the next working day if the date is a weekend or bank holiday' };
  return { arrivalDate: p.date, arrivalText: `Next working day — arrives ${formatDayShort(p.date)}`, note: `Today’s ${cutoff} cut-off has passed` };
}

function bacsTiming(input: RailInput, cfg: RailConfig): Timing {
  const p = processingDay(input, cfg.cutoffs.BACS);
  const arrival = addWorkingDays(p.date, cfg.bacsWorkingDaysAfterSubmission);
  return { arrivalDate: arrival, arrivalText: `In 3 working days — arrives ${formatDayShort(arrival)}`, note: 'Lowest cost. Good for payroll and supplier runs.' };
}

function sepaCtTiming(input: RailInput, cfg: RailConfig): Timing {
  const p = processingDay(input, cfg.cutoffs.SEPA_CT);
  const cutoff = formatHm(cfg.cutoffs.SEPA_CT);
  if (p.sameDay) return { arrivalDate: p.date, arrivalText: `Today if sent before ${cutoff}`, note: `After ${cutoff} UK time it arrives the next working day` };
  if (input.scheduled) return { arrivalDate: p.date, arrivalText: `Arrives ${formatDayShort(p.date)}` };
  return { arrivalDate: p.date, arrivalText: `Next working day — arrives ${formatDayShort(p.date)}` };
}

function swiftTiming(input: RailInput, cfg: RailConfig, range: [number, number]): Timing {
  const p = processingDay(input, cfg.cutoffs.SWIFT);
  const latest = addWorkingDays(p.date, range[1]);
  const span = range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
  return {
    arrivalDate: latest,
    arrivalText: `${span} working days — by ${formatDayShort(latest)}`,
    note: p.missedCutoff ? 'Sent on the next working day' : undefined,
  };
}

function fxLabel(input: RailInput, rail: RailId): string | undefined {
  if (input.payFromCurrency === input.receiveCurrency) return undefined;
  return `Convert ${input.payFromCurrency} → ${input.receiveCurrency}, then send by ${RAIL_NAMES[rail]}`;
}

interface Draft {
  rail: RailId;
  name?: string;
  description: string;
  eligible: boolean;
  reason?: string;
  fee: Money;
  timing: Timing;
  note?: string;
  chargeOptions?: ChargeOption[];
  chargeFees?: Partial<Record<ChargeOption, Money>>;
}

function finish(input: RailInput, drafts: Draft[], recommended: RailId | null): RailSelection {
  const options: RailOption[] = drafts.map((d) => ({
    rail: d.rail,
    name: d.name ?? RAIL_NAMES[d.rail],
    description: d.description,
    eligible: d.eligible,
    reason: d.reason,
    recommended: d.eligible && d.rail === recommended,
    fee: d.fee,
    arrivalText: d.timing.arrivalText,
    arrivalDate: d.timing.arrivalDate,
    note: d.note ?? d.timing.note,
    chargeOptions: d.chargeOptions,
    chargeFees: d.chargeFees,
    requiresFx: input.payFromCurrency !== input.receiveCurrency,
    fxLabel: fxLabel(input, d.rail),
  }));
  const rec = options.find((o) => o.recommended)?.rail ?? options.find((o) => o.eligible)?.rail ?? null;
  return { recommended: rec, options: options.map((o) => ({ ...o, recommended: o.rail === rec && o.eligible })) };
}

export function selectRails(input: RailInput, cfg: RailConfig = defaultConfig): RailSelection {
  const corridor = corridorOf(input.destinationCountry, input.receiveCurrency);

  // Cobanq-to-Cobanq: instant, free, any currency, any time.
  if (input.internal) {
    return finish(input, [{
      rail: 'INTERNAL',
      description: 'Between Cobanq accounts. Instant and free, any day, any time.',
      eligible: true,
      fee: cfg.fees.INTERNAL,
      timing: instantTiming(input, 'Instant'),
    }], 'INTERNAL');
  }

  if (corridor === 'UK_GBP') {
    const overFps = input.amountGbp > cfg.fpsMaxGbp;
    const bacsAllowed = input.scheduled || input.isBulk;
    const drafts: Draft[] = [
      {
        rail: 'FPS',
        description: input.isBulk
          ? 'Each recipient is paid individually, within minutes. Runs every day, all day.'
          : 'The standard way to pay a UK account. Runs every day, all day.',
        eligible: !overFps,
        reason: overFps ? `Faster Payments limit is ${formatMoney({ amount: cfg.fpsMaxGbp, currency: 'GBP' }).replace('.00', '')} — use CHAPS` : undefined,
        fee: cfg.fees.FPS,
        timing: instantTiming(input, 'Usually within minutes'),
        note: `Up to ${formatMoney({ amount: cfg.fpsMaxGbp, currency: 'GBP' }).replace('.00', '')} per payment`,
      },
      {
        rail: 'CHAPS',
        description: 'Same-day, high-value payments with no upper limit. Good for property and large supplier payments.',
        eligible: true,
        fee: cfg.fees.CHAPS,
        timing: chapsTiming(input, cfg),
      },
      {
        rail: 'BACS',
        description: 'Low-cost payment that takes three working days.',
        eligible: bacsAllowed,
        reason: bacsAllowed ? undefined : 'Bacs takes 3 working days. It’s available for scheduled and bulk payments.',
        fee: cfg.fees.BACS,
        timing: bacsTiming(input, cfg),
      },
    ];
    return finish(input, drafts, overFps ? 'CHAPS' : 'FPS');
  }

  if (corridor === 'SEPA_EUR') {
    const overInstant = input.receiveAmount > cfg.sepaInstantMaxEur;
    const reachable = input.sepaInstantReachable !== false;
    const instantOk = !overInstant && reachable;
    const drafts: Draft[] = [
      {
        rail: 'SEPA_INSTANT',
        description: 'Euro payment that arrives within seconds. Runs every day, all day.',
        eligible: instantOk,
        reason: !reachable
          ? 'The beneficiary’s bank can’t receive SEPA Instant — use SEPA Credit Transfer'
          : overInstant
            ? `SEPA Instant limit is ${formatMoney({ amount: cfg.sepaInstantMaxEur, currency: 'EUR' }).replace('.00', '')} — use SEPA Credit Transfer`
            : undefined,
        fee: cfg.fees.SEPA_INSTANT,
        timing: instantTiming(input, 'Within seconds'),
        note: `Up to ${formatMoney({ amount: cfg.sepaInstantMaxEur, currency: 'EUR' }).replace('.00', '')} per payment`,
      },
      {
        rail: 'SEPA_CT',
        description: 'Standard euro payment with no upper limit. Charges are always shared.',
        eligible: true,
        fee: cfg.fees.SEPA_CT,
        timing: sepaCtTiming(input, cfg),
      },
    ];
    return finish(input, drafts, instantOk ? 'SEPA_INSTANT' : 'SEPA_CT');
  }

  // GBP to a non-UK bank, EUR outside SEPA, and every other currency go by SWIFT.
  const gbpCrossBorder = corridor === 'INTL_GBP';
  const range = gbpCrossBorder
    ? cfg.swiftDays.gbpCrossBorder
    : cfg.swiftDays.byCountry[input.destinationCountry.toUpperCase()] ?? cfg.swiftDays.default;
  return finish(input, [{
    rail: 'SWIFT',
    name: gbpCrossBorder ? 'SWIFT (GBP cross-border)' : 'SWIFT',
    description: gbpCrossBorder
      ? 'Pounds sent to a bank outside the UK through the international network.'
      : 'International payment through the SWIFT network.',
    eligible: true,
    fee: cfg.fees.SWIFT.SHA,
    timing: swiftTiming(input, cfg, range),
    chargeOptions: ['SHA', 'OUR', 'BEN'],
    chargeFees: cfg.fees.SWIFT,
  }], 'SWIFT');
}

/** Rails that only move on UK working days (their dates roll over weekends and bank holidays). */
export function isWorkingDayRail(rail: RailId): boolean {
  return rail === 'CHAPS' || rail === 'BACS' || rail === 'SEPA_CT' || rail === 'SWIFT';
}

/** Rails that use UK reference rules (18 characters). */
export function isUkRail(rail: RailId): boolean {
  return rail === 'FPS' || rail === 'BACS' || rail === 'CHAPS';
}
