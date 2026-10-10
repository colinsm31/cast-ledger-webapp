# AceStock — Web

React + TypeScript + Vite + Tailwind web client for AceStock: the register, products
and inventory, customers and stringing, gift cards, refunds, reports and admin
settings. It talks directly to the Supabase backend (tables, row-level security and
server functions) defined in the `cast-ledger` repository under `supabase/`.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev                  # http://localhost:5173
```

`.env.local` is gitignored. Values come from the Supabase dashboard
(Project Settings → API): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
(the anon / publishable key — RLS enforces access). Set `VITE_APP_ENV=test` on the
test build to get the striped "TEST" header.

To run against a local Supabase stack instead (see `ENVIRONMENTS.md` in the backend
repo), put the local URL and anon key in `.env.localdb.local` and run
`npm run dev -- --mode localdb`. Your normal `.env.local` is left alone.

## Scripts

- `npm run dev`: dev server with hot reload
- `npm run build`: typecheck (`tsc -b`) + production build to `dist/`
- `npm run preview`: serve the production build locally
- `npm run lint`: lint (oxlint)
- `npm test`: unit tests (Vitest), e.g. register money math and barcode handling

CI (`.github/workflows/ci.yml`) runs lint, build and tests on every push and pull
request.

## Structure

```
src/
  app/         AppShell (nav + layout), back-button context
  auth/        AuthContext (session + role), sign-in page
  components/  Spinner, EmptyState, Dialog
  lib/         supabase client, errors, settings, held sale, register money math
               (saleMath), customer search, barcode/phone helpers, staff labels
  types/       domain types mirroring the Postgres schema + RPC params
  features/
    home/        scan-or-search home screen
    sales/       register, payment, sales list/report, sale detail, refunds, gift cards
    products/    product list/detail/form, stock actions, serialized units
    categories/  categories + attribute definitions (admin)
    customers/   customer list/detail/create, racquets, new string job
    stringjobs/  open/completed queues, job detail, string setup form
    scan/        barcode resolution, scanner capture, scan-flow routing
    lookups/     pick-or-add lookup values (brands, stringers, …)
    admin/       settings and users (admin)
```

Unit tests sit next to the code they test (`*.test.ts`).

## Sign in

Users are provisioned in Supabase (Authentication → Users), not self-registered.
Create a user there (with email auto-confirmed) and sign in with those credentials.
New users are `staff`; promote the first admin as described in `ENVIRONMENTS.md`.
