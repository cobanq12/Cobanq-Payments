import type { CurrencyCode } from './currencies';

export interface CountryInfo {
  code: string;
  name: string;
  currency: CurrencyCode;
  /** Reachable by SEPA for EUR payments. */
  sepa: boolean;
  /** IBAN length when the country uses IBANs. */
  ibanLength?: number;
}

const c = (code: string, name: string, currency: string, sepa = false, ibanLength?: number): CountryInfo => ({
  code, name, currency, sepa, ibanLength,
});

export const COUNTRIES: CountryInfo[] = [
  c('GB', 'United Kingdom', 'GBP', true, 22),
  c('AD', 'Andorra', 'EUR', true, 24), c('AE', 'United Arab Emirates', 'AED', false, 23),
  c('AT', 'Austria', 'EUR', true, 20), c('AU', 'Australia', 'AUD'),
  c('BD', 'Bangladesh', 'BDT'), c('BE', 'Belgium', 'EUR', true, 16),
  c('BG', 'Bulgaria', 'EUR', true, 22), c('BH', 'Bahrain', 'BHD', false, 22),
  c('BR', 'Brazil', 'BRL', false, 29), c('CA', 'Canada', 'CAD'),
  c('CH', 'Switzerland', 'CHF', true, 21), c('CL', 'Chile', 'CLP'),
  c('CN', 'China', 'CNY'), c('CO', 'Colombia', 'COP'),
  c('CY', 'Cyprus', 'EUR', true, 28), c('CZ', 'Czechia', 'CZK', true, 24),
  c('DE', 'Germany', 'EUR', true, 22), c('DK', 'Denmark', 'DKK', true, 18),
  c('EE', 'Estonia', 'EUR', true, 20), c('EG', 'Egypt', 'EGP', false, 29),
  c('ES', 'Spain', 'EUR', true, 24), c('FI', 'Finland', 'EUR', true, 18),
  c('FR', 'France', 'EUR', true, 27), c('GH', 'Ghana', 'GHS'),
  c('GR', 'Greece', 'EUR', true, 27), c('HK', 'Hong Kong', 'HKD'),
  c('HR', 'Croatia', 'EUR', true, 21), c('HU', 'Hungary', 'HUF', true, 28),
  c('ID', 'Indonesia', 'IDR'), c('IE', 'Ireland', 'EUR', true, 22),
  c('IL', 'Israel', 'ILS', false, 23), c('IN', 'India', 'INR'),
  c('IS', 'Iceland', 'ISK', true, 26), c('IT', 'Italy', 'EUR', true, 27),
  c('JO', 'Jordan', 'JOD', false, 30), c('JP', 'Japan', 'JPY'),
  c('KE', 'Kenya', 'KES'), c('KR', 'South Korea', 'KRW'),
  c('KW', 'Kuwait', 'KWD', false, 30), c('LI', 'Liechtenstein', 'CHF', true, 21),
  c('LK', 'Sri Lanka', 'LKR'), c('LT', 'Lithuania', 'EUR', true, 20),
  c('LU', 'Luxembourg', 'EUR', true, 20), c('LV', 'Latvia', 'EUR', true, 21),
  c('MA', 'Morocco', 'MAD'), c('MC', 'Monaco', 'EUR', true, 27),
  c('MT', 'Malta', 'EUR', true, 31), c('MU', 'Mauritius', 'MUR', false, 30),
  c('MX', 'Mexico', 'MXN'), c('MY', 'Malaysia', 'MYR'),
  c('NG', 'Nigeria', 'NGN'), c('NL', 'Netherlands', 'EUR', true, 18),
  c('NO', 'Norway', 'NOK', true, 15), c('NP', 'Nepal', 'NPR'),
  c('NZ', 'New Zealand', 'NZD'), c('OM', 'Oman', 'OMR'),
  c('PE', 'Peru', 'PEN'), c('PH', 'Philippines', 'PHP'),
  c('PK', 'Pakistan', 'PKR', false, 24), c('PL', 'Poland', 'PLN', true, 28),
  c('PT', 'Portugal', 'EUR', true, 25), c('QA', 'Qatar', 'QAR', false, 29),
  c('RO', 'Romania', 'RON', true, 24), c('RS', 'Serbia', 'RSD', false, 22),
  c('SA', 'Saudi Arabia', 'SAR', false, 24), c('SE', 'Sweden', 'SEK', true, 24),
  c('SG', 'Singapore', 'SGD'), c('SI', 'Slovenia', 'EUR', true, 19),
  c('SK', 'Slovakia', 'EUR', true, 24), c('SM', 'San Marino', 'EUR', true, 27),
  c('TH', 'Thailand', 'THB'), c('TN', 'Tunisia', 'TND', false, 24),
  c('TR', 'Türkiye', 'TRY', false, 26), c('TW', 'Taiwan', 'TWD'),
  c('TZ', 'Tanzania', 'TZS'), c('UG', 'Uganda', 'UGX'),
  c('US', 'United States', 'USD'), c('UY', 'Uruguay', 'UYU'),
  c('VA', 'Vatican City', 'EUR', true, 22), c('VN', 'Vietnam', 'VND'),
  c('ZA', 'South Africa', 'ZAR'), c('ZM', 'Zambia', 'ZMW'),
];

const byCode = new Map(COUNTRIES.map((x) => [x.code, x]));

export function countryInfo(code: string): CountryInfo | undefined {
  return byCode.get(code.toUpperCase());
}

export function countryName(code: string): string {
  return countryInfo(code)?.name ?? code;
}

export function isSepaCountry(code: string): boolean {
  return countryInfo(code)?.sepa ?? false;
}

export function usesIban(code: string): boolean {
  return countryInfo(code)?.ibanLength !== undefined;
}

/** ISO country code → flag emoji ("EU" gives the EU flag). */
export function flagEmoji(code: string): string {
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
