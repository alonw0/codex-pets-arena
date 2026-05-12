# Codex Pet Arena

Realtime turn-based battles for hatched Codex pets. The app is built for Vercel with Next.js, TypeScript, Supabase Auth, Supabase Storage, Postgres, and Realtime.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set these values in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Confirm the `pet-assets` storage bucket exists.
4. Enable Realtime for `match_queue`, `lobbies`, `battles`, `battle_turns`, and `battle_events`.
5. In Vercel, add the same environment variables from `.env.example`.

## Uploading Pets

1. Create a pet with the `hatch-pet` skill.
2. Find the generated folder at `~/.codex/pets/<pet-id>/`.
3. Upload both `pet.json` and `spritesheet.webp` on `/upload`.

The validator expects the Codex pet atlas:

- `1536x1872`
- `8` columns x `9` rows
- `192x208` cells
- rows for `idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, and `review`

## Current Implementation

- Strong classic handheld battle UI with original visual design.
- Deterministic battle engine with HP, levels, affinity, accuracy, critical hits, stat stages, statuses, charges, focus, guard, and yield.
- Supabase-ready auth/upload/data model with server-side pet creation.
- Server-side pet creation uploads assets, creates the pet row, and generates two personalized fight moves from the pet name and description, using Gemini when configured and a deterministic fallback otherwise.
- Battle progression awards XP on wins, levels pets up at deterministic thresholds, and grows stats on level-up.
- Server API routes support random matchmaking, friend-code lobbies, battle loading, and server-authoritative turn submission.
- Dashboard loads profile, uploaded pets, generated moves, selected fighter, and active-battle reconnect state from Supabase.
- Random and friend-code matchmaking entry points.
- Demo battle at `/battle/demo` works without Supabase.

## Verification

```bash
npm run test
npm run build
```
