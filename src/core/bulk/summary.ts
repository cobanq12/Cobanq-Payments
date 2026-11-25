/**
 * Batch maths: group rows by rail, total per currency, work out fees, the FX
 * needed per currency and whether the balances cover it.
 */
import type {
  Balance, BatchCurrencyTotal, BatchRailGroup, BatchSummary, BulkRowResult, BulkUkRail, Money, RailId,
} from '../api/types';
import { addWorkingDays, evaluateCutoff, onOrNextWorkingDay, toUkTime, type IsoDate } from '../lib/dates';
import { convertMinorInverse, sumMinor } from '../lib/money';
import { midRate, roundRate, toGbp } from '../fx/rates';
import { fxFee, railFee } from '../payments/fees';
import { railConfig as defaultConfig, type RailConfig } from '../payments/railConfig';

/** The rail a row will use, after the batch-level UK choice and any per-row override. */
export function effectiveRail(result: BulkRowResult, ukRail: BulkUkRail, override?: RailId): RailId | undefined {
  if (!result.rail) return undefined;
  if (result.rail === 'FPS') return override ?? ukRail;
  return result.rail;
}

export interface SummaryRow {
  currency: string;
  amount: number;
  rail: RailId;
}

export function summariseBatch(rows: SummaryRow[], balances: Balance[], cfg: RailConfig = defaultConfig): BatchSummary {
  const available = new Map(balances.map((b) => [b.currency, b.available]));
  const railMap = new Map<RailId, BatchRailGroup>();
  const ccyMap = new Map<string, { count: number; total: number }>();

  for (const r of rows) {
    const g = railMap.get(r.rail) ?? { rail: r.rail, count: 0, feeGbp: 0 };
    const fee = railFee(r.rail, 'SHA', cfg);
    g.count += 1;
    g.feeGbp += toGbp(fee.amount, fee.currency);
    railMap.set(r.rail, g);
    const c = ccyMap.get(r.currency) ?? { count: 0, total: 0 };
    c.count += 1;
    c.total += r.amount;
    ccyMap.set(r.currency, c);
  }

  const railGroups = [...railMap.values()];
  const totalFeesGbp = sumMinor(railGroups.map((g) => g.feeGbp));
  const debitMap = new Map<string, number>();
  const addDebit = (ccy: string, amount: number): void => { debitMap.set(ccy, (debitMap.get(ccy) ?? 0) + amount); };
  addDebit('GBP', totalFeesGbp);

  const currencyTotals: BatchCurrencyTotal[] = [];
  let totalGbp = 0;
  for (const [currency, { count, total }] of ccyMap) {
    totalGbp += toGbp(total, currency);
    // Pay from the same-currency balance when it covers the total; otherwise convert from GBP.
    if (currency === 'GBP' || (available.get(currency) ?? 0) >= total) {
      addDebit(currency, total);
      currencyTotals.push({ currency, count, total, fundedFrom: currency, debit: total });
    } else {
      const rate = roundRate(midRate('GBP', currency));
      const sell = convertMinorInverse(total, 'GBP', currency, rate);
      const fee = fxFee(sell, cfg);
      addDebit('GBP', sell + fee);
      currencyTotals.push({ currency, count, total, fundedFrom: 'GBP', debit: sell + fee, fxRate: rate, fxFee: fee });
    }
  }

  const debits: Money[] = [...debitMap.entries()].filter(([, amount]) => amount > 0).map(([currency, amount]) => ({ currency, amount }));
  const shortfalls: Money[] = debits
    .filter((d) => (available.get(d.currency) ?? 0) < d.amount)
    .map((d) => ({ currency: d.currency, amount: d.amount - (available.get(d.currency) ?? 0) }));

  return { rowCount: rows.length, railGroups, currencyTotals, totalFeesGbp, debits, totalGbp, shortfalls };
}

/** Fee totals for the two UK bulk options, so the UI can show the difference. */
export function ukRailComparison(ukRowCount: number, cfg: RailConfig = defaultConfig): { fps: number; bacs: number; saving: number } {
  const fps = ukRowCount * cfg.fees.FPS.amount;
  const bacs = ukRowCount * cfg.fees.BACS.amount;
  return { fps, bacs, saving: fps - bacs };
}

/** Bacs arrival date for a batch sent now or on a scheduled date. */
export function bacsArrivalDate(now: Date, scheduledDate?: IsoDate, cfg: RailConfig = defaultConfig): IsoDate {
  const start = scheduledDate ? onOrNextWorkingDay(scheduledDate) : evaluateCutoff(toUkTime(now), cfg.cutoffs.BACS).processingDate;
  return addWorkingDays(start, cfg.bacsWorkingDaysAfterSubmission);
}
