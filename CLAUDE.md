# CLAUDE.md — Hindsight Trading Platform

## What This App Is
AI-powered paper trading simulator that graduates to real
trading. An AI agent autonomously researches stocks, generates
trade theses, places paper trades, tracks performance, and
learns what works. Built for one user now, marketed later.

## Stack — DO NOT DEVIATE
- Next.js App Router, TypeScript
- ShadCN + Tailwind CSS only for UI
- Supabase (Postgres + Auth + Realtime)
- Prisma ORM
- Inngest for background jobs and crons
- Vercel (Next.js) + Railway (Python/FinRobot)
- TradingView Lightweight Charts for price charts
- Recharts for performance/analytics charts

## Architecture
- Next.js frontend calls Python FastAPI microservice
- FastAPI wraps FinRobot agents (Data-CoT, Concept-CoT, Thesis-CoT)
- FinRobot returns trade thesis JSON
- Stored in Supabase Postgres via Prisma
- Supabase Realtime pushes live price updates to UI
- Inngest crons trigger research runs and trade evaluations

## Design Rules — READ BEFORE ANY UI WORK
- ONLY use ShadCN components from /components/ui
- NEVER create a new component if an existing one can be extended
- ALL cards: use Card from shadcn, padding p-6, same border everywhere
- ALL numbers: use tabular-nums class always
- Positive P&L: text-emerald-500 ONLY
- Negative P&L: text-red-500 ONLY
- Never hardcode hex colors, use CSS variables only
- Page titles: text-2xl font-semibold
- Section headers: text-lg font-medium
- Body text: text-sm text-muted-foreground
- Labels: text-xs font-medium uppercase tracking-wide
- Empty states: every page needs one
- Loading states: every data fetch needs one
- Error states: every API call needs one

## Before ANY UI ticket
- Check /components/ui before building anything new
- If you've written same JSX pattern twice, extract a component
- Every screen should look identical in spacing to adjacent screens
- Same border radius, same shadow, same padding everywhere

## API Keys Available (in .env.local)
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- DATABASE_URL + DIRECT_URL
- ALPACA_API_KEY + ALPACA_API_SECRET
- ALPACA_BASE_URL=https://paper-api.alpaca.markets
- FINNHUB_API_KEY
- FMP_API_KEY
- OPENAI_API_KEY
- INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY
- PYTHON_SERVICE_URL (Railway URL — set after Railway deploy)
- PYTHON_SERVICE_SECRET (shared secret for X-Service-Secret header)

## Repo
https://github.com/dave-sucks/hindsight

## Current Status
Milestones 1–3 complete. FinRobot FastAPI microservice built and
ready for Railway deploy. Research pipeline (Data-CoT → Concept-CoT
→ Thesis-CoT), SSE streaming chat, and Research Feed/Detail pages live.
MongoDB and Better Auth fully removed.

## Prisma Notes (v7)
- Prisma 7 uses prisma.config.ts (not schema.prisma) for DB connection URLs
- Client uses @prisma/adapter-pg — see lib/prisma.ts
- Migration adapter configured in prisma.config.ts
- Run `npx prisma generate` after schema changes
- Run `npx prisma migrate dev` to apply migrations

## Milestones
1. ✅ Foundation — Supabase, Prisma, Auth, Vercel deploy
2. ⬜ UI Shell — strip Signalist, rebuild pages for trading app
3. ✅ FinRobot microservice on Railway, FastAPI wrapper
4. ⬜ Paper trading lifecycle — create, track, evaluate trades
5. ⬜ Live data — Supabase Realtime, Inngest crons, Alpaca
6. ⬜ Polish — performance dashboard, graduation logic
