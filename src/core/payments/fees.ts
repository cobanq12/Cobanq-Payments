/**
 * Fee calculator. Turns a rail choice and an optional FX fee into the lines
 * shown to the customer, the total debit and the amount received.
 */
import type { ChargeOption, FeeLine, Money, RailId } from '../api/types';
import type { CurrencyCode } from '../lib/currencies';
import { bps, convertMinor, sumMinor } from '../lib/money';
import { midRate } from '../fx/rates';
import { RAIL_NAMES, railConfig as defaultConfig, type RailConfig } from './railConfig';

export function railFee(rail: RailId, chargeOption: ChargeOption | undefined, cfg: RailConfig = defaultConfig): Money {
  if (rail === 'SWIFT') return cfg.fees.SWIFT[chargeOption ?? 'SHA'];
  return cfg.fees[rail];
}

/** Cobanq conversion fee: a margin on the mid rate, charged on the sell amount as its own line. */
export function fxFee(sellAmountMinor: number, cfg: RailConfig = defaultConfig): number {
  return bps(sellAmountMinor, cfg.fxMarginBps);
}

export type RateFn = (from: CurrencyCode, to: CurrencyCode) => number;

export interface BreakdownInput {
  payFromCurrency: CurrencyCode;
  receiveCurrency: CurrencyCode;
  /** Principal in the pay-from currency. */
  sendAmount: number;
  /** Amount the beneficiary is due before any BEN deduction. */
  receiveAmount: number;
  rail: RailId;
  chargeOption?: ChargeOption;
  /** FX fee in the pay-from currency, when a conversion is attached. */
  fxFeeAmount?: number;
}

export interface Breakdown {
  lines: FeeLine[];
  totalFees: Money;
  totalDebit: Money;
  /** What the beneficiary receives after any BEN deduction. */
  receives: Money;
  /** Charges taken from the amount received (BEN only). */
  deducted?: Money;
}

export function computeBreakdown(input: BreakdownInput, cfg: RailConfig = defaultConfig, rate: RateFn = midRate): Breakdown {
  const lines: FeeLine[] = [];
  const toPayFrom = (m: Money): number =>
    m.currency === input.payFromCurrency ? m.amount : convertMinor(m.amount, m.currency, input.payFromCurrency, rate(m.currency, input.payFromCurrency));

  if (input.fxFeeAmount && input.fxFeeAmount > 0) {
    lines.push({
      kind: 'FX',
      label: `Conversion fee (${(cfg.fxMarginBps / 100).toFixed(2).replace(/0$/, '')}%)`,
      amount: { amount: input.fxFeeAmount, currency: input.payFromCurrency },
    });
  }

  const native = railFee(input.rail, input.chargeOption, cfg);
  const label = input.rail === 'SWIFT' && input.chargeOption === 'OUR'
    ? 'SWIFT fee (you pay all charges)'
    : `${RAIL_NAMES[input.rail]} fee`;
  lines.push({ kind: input.chargeOption === 'OUR' ? 'CHARGES' : 'RAIL', label, amount: { amount: toPayFrom(native), currency: input.payFromCurrency } });

  let receives = input.receiveAmount;
  let deducted: Money | undefined;
  if (input.rail === 'SWIFT' && input.chargeOption === 'BEN') {
    const d = cfg.benDeduction;
    const inReceive = d.currency === input.receiveCurrency ? d.amount : convertMinor(d.amount, d.currency, input.receiveCurrency, rate(d.currency, input.receiveCurrency));
    const applied = Math.min(inReceive, receives);
    receives -= applied;
    deducted = { amount: applied, currency: input.receiveCurrency };
  }

  const totalFees = sumMinor(lines.map((l) => l.amount.amount));
  return {
    lines,
    totalFees: { amount: totalFees, currency: input.payFromCurrency },
    totalDebit: { amount: input.sendAmount + totalFees, currency: input.payFromCurrency },
    receives: { amount: receives, currency: input.receiveCurrency },
    deducted,
  };
}
