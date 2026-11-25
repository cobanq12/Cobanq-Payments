/** ISO 4217 currency metadata. Amounts are always integer minor units + a currency code. */
export type CurrencyCode = string;

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  /** Number of minor-unit decimal places (2 for GBP, 0 for JPY). */
  decimals: number;
  /** ISO country code used to draw a flag ("EU" for the euro). */
  flag: string;
}

const C = (code: string, name: string, flag: string, decimals = 2): CurrencyInfo => ({ code, name, decimals, flag });

/** The 12 balances a Cobanq account carries: GBP + 11 currencies. */
export const ACCOUNT_CURRENCIES: CurrencyCode[] = [
  'GBP', 'EUR', 'USD', 'AED', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'JPY', 'PLN', 'SGD',
];

/** 60+ payout currencies. Those outside ACCOUNT_CURRENCIES are converted at the point of payout. */
export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = Object.fromEntries(
  [
    C('GBP', 'British pound', 'GB'), C('EUR', 'Euro', 'EU'), C('USD', 'US dollar', 'US'),
    C('AED', 'UAE dirham', 'AE'), C('AUD', 'Australian dollar', 'AU'), C('CAD', 'Canadian dollar', 'CA'),
    C('CHF', 'Swiss franc', 'CH'), C('CNY', 'Chinese yuan', 'CN'), C('HKD', 'Hong Kong dollar', 'HK'),
    C('JPY', 'Japanese yen', 'JP', 0), C('PLN', 'Polish złoty', 'PL'), C('SGD', 'Singapore dollar', 'SG'),
    C('BDT', 'Bangladeshi taka', 'BD'), C('BGN', 'Bulgarian lev', 'BG'), C('BHD', 'Bahraini dinar', 'BH', 3),
    C('BRL', 'Brazilian real', 'BR'), C('BWP', 'Botswana pula', 'BW'), C('CLP', 'Chilean peso', 'CL', 0),
    C('COP', 'Colombian peso', 'CO'), C('CZK', 'Czech koruna', 'CZ'), C('DKK', 'Danish krone', 'DK'),
    C('EGP', 'Egyptian pound', 'EG'), C('FJD', 'Fijian dollar', 'FJ'), C('GHS', 'Ghanaian cedi', 'GH'),
    C('HUF', 'Hungarian forint', 'HU'), C('IDR', 'Indonesian rupiah', 'ID'), C('ILS', 'Israeli shekel', 'IL'),
    C('INR', 'Indian rupee', 'IN'), C('ISK', 'Icelandic króna', 'IS', 0), C('JOD', 'Jordanian dinar', 'JO', 3),
    C('KES', 'Kenyan shilling', 'KE'), C('KRW', 'South Korean won', 'KR', 0), C('KWD', 'Kuwaiti dinar', 'KW', 3),
    C('LKR', 'Sri Lankan rupee', 'LK'), C('MAD', 'Moroccan dirham', 'MA'), C('MUR', 'Mauritian rupee', 'MU'),
    C('MXN', 'Mexican peso', 'MX'), C('MYR', 'Malaysian ringgit', 'MY'), C('NGN', 'Nigerian naira', 'NG'),
    C('NOK', 'Norwegian krone', 'NO'), C('NPR', 'Nepalese rupee', 'NP'), C('NZD', 'New Zealand dollar', 'NZ'),
    C('OMR', 'Omani rial', 'OM', 3), C('PEN', 'Peruvian sol', 'PE'), C('PHP', 'Philippine peso', 'PH'),
    C('PKR', 'Pakistani rupee', 'PK'), C('QAR', 'Qatari riyal', 'QA'), C('RON', 'Romanian leu', 'RO'),
    C('RSD', 'Serbian dinar', 'RS'), C('SAR', 'Saudi riyal', 'SA'), C('SEK', 'Swedish krona', 'SE'),
    C('THB', 'Thai baht', 'TH'), C('TND', 'Tunisian dinar', 'TN', 3), C('TRY', 'Turkish lira', 'TR'),
    C('TWD', 'New Taiwan dollar', 'TW'), C('TZS', 'Tanzanian shilling', 'TZ'), C('UGX', 'Ugandan shilling', 'UG', 0),
    C('UYU', 'Uruguayan peso', 'UY'), C('VND', 'Vietnamese dong', 'VN', 0), C('XAF', 'Central African CFA franc', 'CM', 0),
    C('XOF', 'West African CFA franc', 'SN', 0), C('ZAR', 'South African rand', 'ZA'), C('ZMW', 'Zambian kwacha', 'ZM'),
  ].map((c) => [c.code, c]),
);

export const ALL_CURRENCY_CODES: CurrencyCode[] = Object.keys(CURRENCIES);

export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  return CURRENCIES[code] ?? { code, name: code, decimals: 2, flag: 'UN' };
}

export function isAccountCurrency(code: CurrencyCode): boolean {
  return ACCOUNT_CURRENCIES.includes(code);
}
