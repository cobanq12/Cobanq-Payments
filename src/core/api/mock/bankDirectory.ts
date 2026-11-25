/** Mock bank directory used by lookupBank(). */
import type { BankLookupRequest, BankLookupResult } from '../types';
import { countryName } from '../../lib/countries';
import { formatSortCode, stripSpaces } from '../../lib/format';
import { INTERNAL_SORT_CODE } from '../../bulk/validate';
import { isValidAba, isValidBic, isValidIban, isValidSortCode } from '../../payments/validators';

const UK_BY_PREFIX: Record<string, string> = {
  '04': 'Monzo Bank Ltd — London',
  '08': 'The Co-operative Bank plc — Manchester',
  '09': 'Santander UK plc — Bootle',
  '11': 'Halifax (Bank of Scotland plc) — Leeds',
  '20': 'Barclays Bank UK PLC — London',
  '30': 'Lloyds Bank plc — London',
  '60': 'National Westminster Bank plc — London',
  '83': 'The Royal Bank of Scotland plc — Edinburgh',
};

const UK_MAGIC: Record<string, string> = {
  '000000': 'Test Bank — name will not match',
  '111111': 'Test Bank — close match',
  '222222': 'Test Bank — check unavailable',
  '333333': 'Test Bank — account type differs',
};

const IBAN_BANKS: Record<string, { bank: string; bic?: string }> = {
  DE: { bank: 'Commerzbank AG — Köln', bic: 'COBADEFFXXX' },
  FR: { bank: 'La Banque Postale — Paris', bic: 'PSSTFRPPXXX' },
  NL: { bank: 'ABN AMRO Bank N.V. — Amsterdam', bic: 'ABNANL2AXXX' },
  ES: { bank: 'Banco Santander S.A. — Madrid', bic: 'BSCHESMMXXX' },
  IT: { bank: 'Intesa Sanpaolo S.p.A. — Milano', bic: 'BCITITMMXXX' },
  IE: { bank: 'Allied Irish Banks plc — Dublin', bic: 'AIBKIE2DXXX' },
  BE: { bank: 'KBC Bank NV — Brussels', bic: 'KREDBEBBXXX' },
  PT: { bank: 'Caixa Geral de Depósitos — Lisboa', bic: 'CGDIPTPLXXX' },
  AT: { bank: 'Erste Group Bank AG — Wien', bic: 'GIBAATWWXXX' },
  PL: { bank: 'PKO Bank Polski — Warszawa', bic: 'BPKOPLPWXXX' },
  CH: { bank: 'UBS Switzerland AG — Zürich', bic: 'UBSWCHZH80A' },
  LU: { bank: 'Banque et Caisse d’Épargne de l’État — Luxembourg', bic: 'BCEELULLXXX' },
  AE: { bank: 'Emirates NBD Bank PJSC — Dubai', bic: 'EBILAEADXXX' },
  PK: { bank: 'Standard Chartered Bank (Pakistan) Ltd — Karachi', bic: 'SCBLPKKXXXX' },
  SA: { bank: 'Al Rajhi Bank — Riyadh', bic: 'RJHISARIXXX' },
  TR: { bank: 'Türkiye İş Bankası — İstanbul', bic: 'ISBKTRISXXX' },
};

/** SEPA countries whose banks are not reachable by SEPA Instant in the mock. */
export const SEPA_INSTANT_UNREACHABLE = new Set(['PT', 'MT', 'CY']);

const BIC_BANKS: Record<string, string> = {
  CHASUS33: 'JPMorgan Chase Bank N.A. — New York',
  BOFAUS3N: 'Bank of America N.A. — New York',
  HSBCHKHH: 'HSBC — Hong Kong',
  BKCHCNBJ: 'Bank of China — Beijing',
  ICBKCNBJ: 'Industrial and Commercial Bank of China — Beijing',
  DBSSSGSG: 'DBS Bank Ltd — Singapore',
  ANZBAU3M: 'ANZ Banking Group — Melbourne',
  ROYCCAT2: 'Royal Bank of Canada — Toronto',
  HDFCINBB: 'HDFC Bank Ltd — Mumbai',
  BARCGB22: 'Barclays Bank UK PLC — London',
};

const ABA_BANKS: Record<string, string> = {
  '021000021': 'JPMorgan Chase Bank N.A. — New York',
  '026009593': 'Bank of America N.A. — New York',
  '121000248': 'Wells Fargo Bank N.A. — San Francisco',
};

export function lookupUkSortCode(sortCodeRaw: string): BankLookupResult | null {
  const sc = stripSpaces(sortCodeRaw);
  if (!isValidSortCode(sc)) return null;
  if (sc === INTERNAL_SORT_CODE) return { bankName: 'Cobanq', branch: 'Cobanq account', internal: true };
  const magic = UK_MAGIC[sc];
  if (magic) return { bankName: magic };
  const hit = UK_BY_PREFIX[sc.slice(0, 2)];
  if (hit) {
    const [bankName, branch] = hit.split(' — ');
    return { bankName: bankName!, branch };
  }
  return { bankName: `UK bank (sort code ${formatSortCode(sc)})` };
}

export function mockLookupBank(req: BankLookupRequest, sepaInstantEnabled: boolean): BankLookupResult | null {
  if (req.sortCode) return lookupUkSortCode(req.sortCode);

  if (req.iban) {
    const iban = stripSpaces(req.iban).toUpperCase();
    if (!isValidIban(iban)) return null;
    const cc = iban.slice(0, 2);
    if (cc === 'GB') {
      if (iban.slice(4, 8) === 'CBNQ') return { bankName: 'Cobanq', branch: 'Cobanq account', bic: 'CBNQGB2LXXX', internal: true, sepaInstantReachable: true };
      const uk = lookupUkSortCode(iban.slice(8, 14));
      return uk ? { ...uk, bic: `${iban.slice(4, 8)}GB2LXXX`, sepaInstantReachable: sepaInstantEnabled } : null;
    }
    const known = IBAN_BANKS[cc];
    const reachable = sepaInstantEnabled && !SEPA_INSTANT_UNREACHABLE.has(cc);
    if (known) {
      const [bankName, branch] = known.bank.split(' — ');
      return { bankName: bankName!, branch, bic: known.bic, sepaInstantReachable: reachable };
    }
    return { bankName: `Bank in ${countryName(cc)}`, sepaInstantReachable: reachable };
  }

  if (req.bic) {
    const bic = stripSpaces(req.bic).toUpperCase();
    if (!isValidBic(bic)) return null;
    const named = BIC_BANKS[bic.slice(0, 8)];
    if (named) {
      const [bankName, branch] = named.split(' — ');
      return { bankName: bankName!, branch, bic };
    }
    const fromIbanTable = Object.values(IBAN_BANKS).find((b) => b.bic?.slice(0, 8) === bic.slice(0, 8));
    if (fromIbanTable) {
      const [bankName, branch] = fromIbanTable.bank.split(' — ');
      return { bankName: bankName!, branch, bic };
    }
    return { bankName: `Bank in ${countryName(bic.slice(4, 6))}`, bic };
  }

  if (req.routingCode) {
    const aba = stripSpaces(req.routingCode);
    if (!isValidAba(aba)) return null;
    const named = ABA_BANKS[aba];
    if (named) {
      const [bankName, branch] = named.split(' — ');
      return { bankName: bankName!, branch };
    }
    return { bankName: 'US bank' };
  }

  return null;
}
