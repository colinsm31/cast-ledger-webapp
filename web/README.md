# CastLedger — Web

React + TypeScript + Vite + Tailwind web client for CastLedger. Talks to the same
Supabase backend as the iOS app (same tables, RLS, and RPCs — no backend changes).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev                  # http://localhost:5173
```

`.env.local` is gitignored. Values come from the Supabase dashboard
(Project Settings → API): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
(the anon / publishable key — RLS enforces access).

## Scripts

- `npm run dev` — dev server with hot reload
- `npm run build` — typecheck (`tsc -b`) + production build to `dist/`
- `npm run preview` — serve the production build locally
- `npm run lint` — lint

## Structure

```
src/
  lib/         supabase client, error helper
  types/       domain types mirroring the Postgres schema + RPC params
  auth/        AuthContext, sign-in page
  app/         AppShell (nav + layout)
  components/  Spinner, EmptyState
  features/
    lookups/   useLookups hook + PickOrAdd (add-if-missing) control
    templates/ family list + spec-template definer
    pieces/    family picker, piece editor, list, detail, status badge
```

## Parity with iOS

This client reaches feature parity with the iOS app's current state: auth,
spec-template definer (with pick-or-add lookups), template-driven piece editor,
and pieces list + detail. New features are added to both clients together.

## Sign in

Users are provisioned in Supabase (Authentication → Users), not self-registered.
Create a user there (with email auto-confirmed) and sign in with those credentials.
