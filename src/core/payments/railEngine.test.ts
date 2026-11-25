import { describe, expect, it } from 'vitest';
import type { RailInput } from '../api/types';
import { fromUkWallTime } from '../lib/dates';
import { corridorOf, selectRails } from './railEngine';

// Wed 25 Nov 2026 is a UK working day. 10:00 = 600 minutes.
const WED_10AM = fromUkWallTime('2026-11-25', 600);
const WED_4PM = fromUkWallTime('2026-11-25', 16 * 60);
const SAT_10AM = fromUkWallTime('2026-11-28', 600);

function input(overrides: Partial<RailInput> = {}): RailInput {
  return {
    destinationCountry: 'GB', receiveCurrency: 'GBP', payFromCurrency: 'GBP', amountGbp: 100_000, receiveAmount: 100_000,
    paymentDate: '2026-11-25', scheduled: false, beneficiaryType: 'BUSINESS', isBulk: false, now: WED_10AM, ...overrides,
  };
}

const rail = (sel: ReturnType<typeof selectRails>, id: string) => sel.options.find((o) => o.rail === id)!;

describe('corridorOf', () => {
  it('classifies corridors', () => {
    expect(corridorOf('GB', 'GBP')).toBe('UK_GBP');
    expect(corridorOf('DE', 'EUR')).toBe('SEPA_EUR');
    expect(corridorOf('GB', 'EUR')).toBe('SEPA_EUR');
    expect(corridorOf('CH', 'EUR')).toBe('SEPA_EUR');
    expect(corridorOf('FR', 'GBP')).toBe('INTL_GBP');
    expect(corridorOf('US', 'USD')).toBe('INTL');
    expect(corridorOf('US', 'EUR')).toBe('INTL');
  });
});

describe('selectRails — GBP to a UK account', () => {
  it('recommends Faster Payments and blocks Bacs for a payment today', () => {
    const sel = selectRails(input());
    expect(sel.recommended).toBe('FPS');
    expect(rail(sel, 'FPS').eligible).toBe(true);
    expect(rail(sel, 'FPS').arrivalText).toBe('Usually within minutes');
    expect(rail(sel, 'FPS').fee).toEqual({ amount: 50, currency: 'GBP' });
    expect(rail(sel, 'CHAPS').eligible).toBe(true);
    expect(rail(sel, 'CHAPS').fee.amount).toBe(1500);
    expect(rail(sel, 'BACS').eligible).toBe(false);
    expect(rail(sel, 'BACS').reason).toMatch(/scheduled and bulk/);
  });

  it('allows exactly £1,000,000 by Faster Payments', () => {
    const sel = selectRails(input({ amountGbp: 100_000_000, receiveAmount: 100_000_000 }));
    expect(sel.recommended).toBe('FPS');
  });

  it('disables Faster Payments above £1,000,000 and recommends CHAPS', () => {
    const sel = selectRails(input({ amountGbp: 100_000_001, receiveAmount: 100_000_001 }));
    expect(sel.recommended).toBe('CHAPS');
    expect(rail(sel, 'FPS').eligible).toBe(false);
    expect(rail(sel, 'FPS').reason).toBe('Faster Payments limit is £1,000,000 — use CHAPS');
    expect(rail(sel, 'CHAPS').recommended).toBe(true);
  });

  it('CHAPS is same-day before the 15:30 cut-off', () => {
    const chaps = rail(selectRails(input()), 'CHAPS');
    expect(chaps.arrivalDate).toBe('2026-11-25');
    expect(chaps.arrivalText).toBe('Today if sent before 3:30pm');
  });

  it('CHAPS rolls to the next working day after the cut-off', () => {
    const chaps = rail(selectRails(input({ now: WED_4PM })), 'CHAPS');
    expect(chaps.arrivalDate).toBe('2026-11-26');
    expect(chaps.arrivalText).toBe('Next working day — arrives Thu 26 Nov');
  });

  it('at weekends Faster Payments still runs and CHAPS rolls to Monday', () => {
    const sel = selectRails(input({ now: SAT_10AM, paymentDate: '2026-11-28' }));
    expect(rail(sel, 'FPS').arrivalDate).toBe('2026-11-28');
    expect(rail(sel, 'CHAPS').arrivalDate).toBe('2026-11-30');
  });

  it('offers Bacs for scheduled payments, arriving on the third working day', () => {
    const sel = selectRails(input({ scheduled: true, paymentDate: '2026-11-26' }));
    const bacs = rail(sel, 'BACS');
    expect(bacs.eligible).toBe(true);
    expect(bacs.fee.amount).toBe(25);
    // Thu 26 (day 1), Fri 27 (day 2), Mon 30 (day 3)
    expect(bacs.arrivalDate).toBe('2026-11-30');
    expect(bacs.arrivalText).toBe('In 3 working days — arrives Mon 30 Nov');
    expect(sel.recommended).toBe('FPS');
  });

  it('Bacs skips bank holidays', () => {
    // Thu 24 Dec 2026 → Fri 25 (holiday), Mon 28 (substitute holiday) → Tue 29, Wed 30
    const bacs = rail(selectRails(input({ scheduled: true, paymentDate: '2026-12-24' })), 'BACS');
    expect(bacs.arrivalDate).toBe('2026-12-30');
  });

  it('defaults bulk to Faster Payments with Bacs available', () => {
    const sel = selectRails(input({ isBulk: true }));
    expect(sel.recommended).toBe('FPS');
    expect(rail(sel, 'BACS').eligible).toBe(true);
  });

  it('uses an internal transfer for Cobanq-to-Cobanq', () => {
    const sel = selectRails(input({ internal: true, now: SAT_10AM, paymentDate: '2026-11-28' }));
    expect(sel.recommended).toBe('INTERNAL');
    expect(sel.options).toHaveLength(1);
    expect(sel.options[0]!.fee.amount).toBe(0);
    expect(sel.options[0]!.arrivalText).toBe('Instant');
  });
});

describe('selectRails — EUR within SEPA', () => {
  const eur = (o: Partial<RailInput> = {}): RailInput => input({ destinationCountry: 'DE', receiveCurrency: 'EUR', payFromCurrency: 'EUR', ...o });

  it('recommends SEPA Instant when reachable and within €100,000', () => {
    const sel = selectRails(eur({ sepaInstantReachable: true }));
    expect(sel.recommended).toBe('SEPA_INSTANT');
    expect(rail(sel, 'SEPA_INSTANT').fee).toEqual({ amount: 100, currency: 'EUR' });
    expect(rail(sel, 'SEPA_CT').chargeOptions).toBeUndefined();
  });

  it('falls back to SEPA Credit Transfer when the bank is not reachable', () => {
    const sel = selectRails(eur({ destinationCountry: 'PT', sepaInstantReachable: false }));
    expect(sel.recommended).toBe('SEPA_CT');
    expect(rail(sel, 'SEPA_INSTANT').eligible).toBe(false);
    expect(rail(sel, 'SEPA_INSTANT').reason).toMatch(/can’t receive SEPA Instant/);
  });

  it('falls back to SEPA Credit Transfer above €100,000', () => {
    const sel = selectRails(eur({ receiveAmount: 10_000_001, amountGbp: 8_600_000 }));
    expect(sel.recommended).toBe('SEPA_CT');
    expect(rail(sel, 'SEPA_INSTANT').reason).toMatch(/€100,000/);
  });

  it('SEPA CT is same-day before 14:00 and next working day after', () => {
    expect(rail(selectRails(eur()), 'SEPA_CT').arrivalDate).toBe('2026-11-25');
    expect(rail(selectRails(eur({ now: WED_4PM })), 'SEPA_CT').arrivalDate).toBe('2026-11-26');
  });

  it('labels the conversion when paying from another balance', () => {
    const sel = selectRails(eur({ payFromCurrency: 'GBP', sepaInstantReachable: true }));
    expect(rail(sel, 'SEPA_INSTANT').requiresFx).toBe(true);
    expect(rail(sel, 'SEPA_INSTANT').fxLabel).toBe('Convert GBP → EUR, then send by SEPA Instant');
  });
});

describe('selectRails — SWIFT', () => {
  it('sends USD to the US by SWIFT with all charge options', () => {
    const sel = selectRails(input({ destinationCountry: 'US', receiveCurrency: 'USD', payFromCurrency: 'USD' }));
    expect(sel.recommended).toBe('SWIFT');
    const swift = rail(sel, 'SWIFT');
    expect(swift.chargeOptions).toEqual(['SHA', 'OUR', 'BEN']);
    expect(swift.chargeFees?.OUR?.amount).toBe(2500);
    expect(swift.arrivalText).toBe('1–2 working days — by Fri 27 Nov');
  });

  it('sends GBP to a non-UK bank by SWIFT (GBP cross-border)', () => {
    const sel = selectRails(input({ destinationCountry: 'FR' }));
    expect(sel.recommended).toBe('SWIFT');
    expect(sel.options[0]!.name).toBe('SWIFT (GBP cross-border)');
  });

  it('sends EUR outside SEPA by SWIFT', () => {
    const sel = selectRails(input({ destinationCountry: 'US', receiveCurrency: 'EUR', payFromCurrency: 'EUR' }));
    expect(sel.recommended).toBe('SWIFT');
  });

  it('rolls SWIFT over the weekend', () => {
    const swift = rail(selectRails(input({ destinationCountry: 'US', receiveCurrency: 'USD', payFromCurrency: 'USD', now: SAT_10AM, paymentDate: '2026-11-28' })), 'SWIFT');
    // Processed Mon 30 Nov, up to 2 working days → Wed 2 Dec
    expect(swift.arrivalDate).toBe('2026-12-02');
  });
});
