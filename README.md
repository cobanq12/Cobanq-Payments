# Cobanq — Payments (test build)

A fully working, clickable test version of the customer-side **Payments** area of the Cobanq business account: make a payment (UK and international), convert currency, beneficiaries and bulk payments.

The backend is mocked behind a typed API layer, so developers can swap in the real backend without touching UI components. Nothing here moves real money.

- **Stack:** React 18, TypeScript (strict), Vite, Tailwind CSS, react-router, react-hook-form + zod, @tanstack/react-query, lucide-react, jsPDF.
- **Built for reuse in the mobile app:** all logic lives in `src/core/` with no DOM, browser or Tailwind imports. The web app in `src/web/` only renders what the core hooks return.

## Run it

```bash
npm i && npm run dev
```

Open http://localhost:5173. You're signed in as the Maker. Use the **Test mode** button (bottom-left) to switch role, change the mock UK time, add test funds and see the magic values. The one-time code is **123456**.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint, including the `src/core` boundary rule |
| `npm run build` | Type-check and build for production |
| `VITE_EMBED=1 npm run build` | Build the hosted-preview copy (relative paths, in-memory routing) |

## What's built

| Area | Route | Notes |
| --- | --- | --- |
| Payments | `/payments` | Recent payments with search, filters and pagination; approvals tab; detail drawer; CHAPS cut-off banner; resume-draft card |
| Make a payment | `/payments/new` | 7-step wizard: beneficiary → bank details (+ Confirmation of Payee) → amount → how to send → review → approve → result |
| Convert | `/convert` | Linked amounts, 30-second locked quote, 30-day chart, rates for 60+ currencies, "pay from this balance" hand-off |
| Beneficiaries | `/beneficiaries` | Search, filters, add / edit / delete (edit of bank details and delete need a one-time code), history, Pay |
| Bulk payments | `/payments/bulk` | CSV template, upload up to 1,000 rows, per-cell validation with inline fixes, grouping by rail, Faster Payments vs Bacs, schedule, one approval, live batch status, results CSV |
| Dashboard, Accounts, Statements, Settings | — | Tidy placeholders with the shell intact |

## Test scenarios (magic values)

| Input | Triggers |
| --- | --- |
| Sort code `00-00-00` | Confirmation of Payee: **No match** |
| Sort code `11-11-11` | **Close match** (suggests "Acme Tradng Limited") |
| Sort code `22-22-22` | Confirmation of Payee **Unavailable** |
| Sort code `33-33-33` | Match, but the **account type differs** (business vs personal) |
| Sort code `40-00-00`, any account | Cobanq account → **Internal transfer** (instant, free) |
| Any other valid sort code | **Match** |
| Amount ending `.13` | Payment **Failed** (beneficiary bank rejected), refunded |
| Amount ending `.31` | **In review**, clears to Completed after 20 s |
| Amount ending `.77` | **Returned** after 15 s (account closed), refunded |
| Beneficiary name containing `TEST SANCTION` | In review, then **Rejected** with a generic message |
| IBAN starting `DE00` | Fails mod-97 (invalid IBAN) |
| IBAN from Germany / France / Netherlands | SEPA Instant reachable |
| IBAN from Portugal | SEPA Instant not reachable → SEPA Credit Transfer only |
| One-time code `000000` (or anything but `123456`) | SCA failure; three wrong codes lock approvals for 5 minutes |
| Amount over £1,000,000 to a UK account | Faster Payments disabled, CHAPS recommended |

Every other payment goes Processing → Sent → Completed: about 5 s for Faster Payments, SEPA Instant and internal transfers, about 20 s for the rest.

The magic amounts apply to **the figure you type**. An amount worked out by an FX quote never triggers a scenario by accident.

Valid identifiers for testing: `DE89 3704 0044 0532 0130 00`, `FR14 2004 1010 0505 0001 3M02 606`, `NL91 ABNA 0417 1643 00`, `PT50 0002 0123 1234 5678 9015 4`, US routing `021000021`.

### Roles and approvals

| Role | Mock user | Limits | Behaviour |
| --- | --- | --- | --- |
| Maker | Sam Carter | £250,000 per payment, £1,000,000 a day | Every payment goes to **Awaiting approval** |
| Approver | Priya Shah | £5,000,000 | Can approve or reject from Payments → Approvals |
| Admin | Alex Morgan | £5,000,000 | Same as Approver |

Payments over £25,000 always need a second approver — someone other than the person who created them. To test both sides, create as Approver and approve as Admin (or the other way round).

**To test a CHAPS payment over £1,000,000:** Test mode → switch to Approver → "Add £5,000,000" → pay a UK beneficiary £1,200,000.

### Other test-panel controls

- **Mock UK time** with presets (working day, 25 minutes before the CHAPS cut-off, after cut-off, Saturday, bank holiday, +5 working days). Moving time forward runs scheduled payments that fall due.
- **Toggles:** SEPA Instant reachability, Confirmation of Payee availability, FX volatility.
- **Idle timeout:** show the 10-minute warning, or sign out in 5 seconds.
- **Sample bulk files:** 1,000 UK rows, mixed rails (UK + SEPA + SWIFT), a file with errors. The Bulk payments page can also load them in one click.
- **Reset all data.**

## Project structure

```
src/
  core/                 ← shared with the mobile app: no DOM, no Tailwind
    api/                client.ts (typed API), types.ts, errors.ts, http.ts (real backend), mock/
    payments/           railConfig.ts, railEngine.ts, beneficiarySchemas.ts, validators.ts, fees.ts,
                        rules.ts, schemas.ts (zod), statuses.ts, purposes.ts, confirmationDoc.ts
    fx/  bulk/          quotes and rates; CSV template, row validation, batch maths, samples
    hooks/              usePaymentWizard, useFxQuote, useBulkUpload, useBeneficiaries, useSca,
                        usePayments, useConvert, useSession, useNotifications, useTestSettings
    lib/                money (integer minor units), dates, cut-offs, UK bank holidays, formatters, CSV
    adapters/           storage, file picker, file saver, PDF, share — interfaces only
    theme/tokens.ts     colours, spacing, radius, type — read by Tailwind and by the mobile app
    config.ts           USE_MOCK, entity details, session and SCA settings
  web/                  ← web-only UI
    components/         Button, Input, Select, Card, Badge, Stepper, Modal, Drawer, Toast,
                        AmountInput, CurrencyFlag, Skeleton, DatePicker, CountryPicker, OtpInput …
    screens/            payments (wizard, drawer, approvals), convert, beneficiaries, bulk
    adapters/           localStorage, browser file input, jsPDF
    layout/  test-panel/
```

Rules that keep this honest:

- **Money is integer minor units + ISO 4217 code.** All arithmetic goes through `core/lib/money.ts` (BigInt). No floating point on amounts.
- **No business logic in components.** Screens call hooks; hooks call `api.*` and the pure functions in `core/`.
- **`src/core/` cannot import from `src/web/`, the DOM or Tailwind.** ESLint enforces it (`no-restricted-imports`, `no-restricted-globals` in `eslint.config.js`).
- **One place to tune operations:** every threshold, cut-off, fee, limit and corridor timing is in `src/core/payments/railConfig.ts`.
- **New corridors by config:** add fields in `src/core/payments/beneficiarySchemas.ts`; the form renders itself.

## Swapping the mock for the real backend

1. In `src/core/config.ts` set `USE_MOCK = false` and point `API_BASE_URL` at the service.
2. `src/core/api/http.ts` already implements every function in the contract as a REST call. Adjust the paths to match the live API.
3. Keep the error shape `{ code, message, field? }` (`ApiErrorShape` in `types.ts`). The UI maps `code` to friendly copy in `errors.ts`.
4. Replace polling (`POLL` in `core/hooks/queryKeys.ts`) with push or webhooks when available.

The UI only ever calls `src/core/api/client.ts`. The contract (`ApiClient`):

`getAccount` · `getBalances` · `getLimits` · `listBeneficiaries` · `createBeneficiary` · `updateBeneficiary` · `deleteBeneficiary` · `lookupBank` · `checkPayee` · `getRails` · `getFxQuote` · `convert` · `getRateHistory` · `getIndicativeRates` · `createPayment` · `listPayments` · `getPayment` · `approvePayment` · `rejectPayment` · `cancelPayment` · `listApprovals` · `uploadDocument` · `reportProblem` · `getScaChallenge` · `resendScaCode` · `verifySca` · `validateBulkFile` · `submitBulk` · `listBatches` · `getBatch` · `listNotifications` · `markNotificationsRead`

The server should run the same rail engine (`selectRails`) so it stays the source of truth; the mock already does.

## Reusing `src/core/` in the mobile app (React Native / Expo)

1. Import `src/core/` unchanged (a workspace package or a path alias).
2. Provide native adapters to `AdaptersProvider`: `storage` (AsyncStorage / SecureStore), `filePicker` (document picker), `fileSaver` and `share` (share sheet), `pdf` (native print or a PDF library — `buildConfirmationDoc()` gives a platform-neutral document).
3. Call `configureApi({ storage })` once at start-up.
4. Build one native screen per wizard step, driven by the same hooks (`usePaymentWizard`, `useSca`, `useFxQuote`, `useBulkUpload`, …).
5. Read colours, spacing and type from `core/theme/tokens.ts`. Status icons are abstract names in `core/payments/statuses.ts`; map them to your icon set.
6. Wire `useSession().touch()` to app activity for the idle timeout.

## Brand

- **Logo:** `public/logo.png`, drawn only by `src/web/components/Logo.tsx` (shell, sign-in, approval dialog), embedded in the PDF confirmation, and used for the favicon. It is always shown at its own aspect ratio and colours.
- **Colours:** primary is the logo's navy `#000031`; accent is teal `#1FB6A6`. Change both in `src/core/theme/tokens.ts`.
- **Font:** Inter (bundled with `@fontsource/inter`), tabular numerals on amounts, rates and account numbers. The PDF embeds Inter from `public/fonts/` (generated by `node scripts/woff-to-ttf.mjs`).
- **Copy rules:** UK spelling, sentence case, and never the word "hold" in customer-facing text. Rails are named by scheme only; no banking partner or infrastructure provider is named anywhere in the UI.

## Before go-live — things to fill in or decide

- **FRN:** set `ENTITY.frn` in `src/core/config.ts` (currently `TBC`). It appears in the footer, sign-in page and PDF.
- **Purpose codes** for CN, AE, IN and PK in `core/payments/purposes.ts` are sample lists. Replace them with the live lists.
- **UK bank holidays** in `core/lib/dates.ts` run to the end of 2028 (England and Wales). Extend yearly.
- **Fees, limits and cut-offs** in `railConfig.ts` are the defaults from the brief. Confirm with operations.
- **Reference rates** in `core/fx/rates.ts` are static and indicative, for the mock and for GBP-equivalent limit checks. Live quotes must come from the API.

## How the mock behaves (worth knowing when testing)

- State is kept in `localStorage` and survives refresh. "Reset all data" restores the seed.
- Approving or rejecting does not ask for a one-time code. Creating payments, batches and conversions, editing bank details and deleting beneficiaries do.
- A scheduled payment that needs a conversion keeps the rate locked when it was confirmed. Decide the real rule (re-quote on the day, or forward contract) with the backend team.
- Recurring payments create the next scheduled payment each time one is sent.
- Bulk rows are tracked on the batch page, not as individual rows in the Payments list. Euro rows in a bulk file go by SEPA Credit Transfer. The mock keeps the six most recent batches.
- Where a currency balance can't cover its bulk rows, the batch converts from GBP at the indicative rate plus the 0.5% fee.
- Seeded payments made "today" count towards the Maker's daily limit, so the remaining limit starts a little under £1,000,000.
- Status updates arrive by polling every 2–3 seconds.

## Tests

`npm test` runs 79 unit tests covering: rail selection engine, IBAN mod-97, UK sort code and account formats, BIC format, ABA checksum, fee calculator, cut-off and working-day logic, FX quote expiry, money maths, and the mock backend scenarios (every magic value, limits, duplicates, dual approval, conversion, a 1,000-row bulk run).
