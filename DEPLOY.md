# Deploying Codex Pet Arena

This guide covers the full production setup for Codex Pet Arena on Vercel with Supabase Auth, Postgres, Storage, and Realtime.

## 1. Prerequisites

- A GitHub repository containing this project.
- A Vercel account connected to that GitHub account.
- A Supabase account.
- Node.js 20+ locally.

Install and verify locally:

```bash
npm install
npm run test
npm run build
```

## 2. Create The Supabase Project

1. Go to [Supabase](https://supabase.com/).
2. Create a new project.
3. Choose an organization, project name, strong database password, and region close to your users.
4. Wait until the project finishes provisioning.

After the project is ready, open:

```text
Project Settings -> API
```

Copy these values:

```text
Project URL
anon public key
service_role key
```

The service role key is server-only. Never expose it in browser code.

## 2.1 Create A Gemini API Key

Pet creation can generate two personalized fight moves from each pet's name and description.

1. Open [Google AI Studio](https://aistudio.google.com/).
2. Create a Gemini API key.
3. Keep the key server-side only.

The app uses Gemini through the REST `generateContent` API with the `x-goog-api-key` header. If `GEMINI_API_KEY` is missing or Gemini fails, pet creation still works with deterministic fallback moves.

## 3. Create The Database Schema

1. In Supabase, open:

```text
SQL Editor -> New query
```

2. Paste the entire contents of:

```text
supabase/schema.sql
```

3. Run the query.

This creates:

- `profiles`
- an auth trigger that creates `profiles` rows for new users
- `pets`
- `moves`
- `match_queue`
- `lobbies`
- `battles`
- `battle_turns`
- `battle_events`
- `profile_badges`
- RLS policies
- `pet-assets` storage bucket
- storage upload/read policies

For an existing Supabase project that was created before the security hardening pass, also run:

```text
supabase/security-hardening.sql
```

That removes old browser-write policies from server-owned gameplay tables. Pet creation, move creation, matchmaking, lobby joins, battle turns, and battle results should go through the Next.js API routes, not direct browser writes.

For an existing project created before badges were added, also run:

```text
supabase/gamification.sql
```

That creates `profile_badges` and its read policy. New projects get this from `supabase/schema.sql`.

For an existing project created before arena counters were added, also run:

```text
supabase/arena-stats.sql
```

That adds `profiles.last_seen_at` and indexes used by the cached homepage/dashboard counters. New projects get this from `supabase/schema.sql`.

For an existing project created before NPC Masters mode was added, also run:

```text
supabase/npc-masters.sql
```

That allows `battles` rows to store PvE master challenges where the opponent is not a Supabase auth user. New projects get this from `supabase/schema.sql`.

The schema intentionally does not create Postgres extensions. Supabase projects normally provide `gen_random_uuid()` already. If your project does not recognize `gen_random_uuid()`, enable `pgcrypto` from the Supabase dashboard extension UI, then rerun the schema.

If the query fails on the storage policy section, confirm that Supabase Storage is enabled for the project, then run the failed storage statements again.

If you already created users before adding the profile trigger, backfill profiles once:

```sql
insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1), 'Trainer')
from auth.users
on conflict (id) do nothing;
```

## 4. Enable Supabase Realtime

Open:

```text
Database -> Publications -> supabase_realtime
```

Enable Postgres Changes / Realtime publication for these tables:

```text
match_queue
lobbies
battles
battle_turns
battle_events
```

SQL alternative:

```sql
alter publication supabase_realtime add table match_queue;
alter publication supabase_realtime add table lobbies;
alter publication supabase_realtime add table battles;
alter publication supabase_realtime add table battle_turns;
alter publication supabase_realtime add table battle_events;
```

The app uses these tables for queue updates, friend-code lobbies, battle state updates, and event playback. Battle rooms subscribe to `battles` and `battle_events` for live updates and also poll periodically as a fallback.

## 5. Configure Supabase Auth

Open:

```text
Authentication -> Providers
```

Enable Email auth.

For the simplest launch:

```text
Confirm email: off
```

For a more production-safe launch:

```text
Confirm email: on
```

If email confirmation is on, also configure:

```text
Authentication -> URL Configuration
```

Set:

```text
Site URL: https://your-vercel-domain.vercel.app
Redirect URLs:
https://your-vercel-domain.vercel.app/**
http://localhost:3000/**
```

After you attach a custom domain, add it too:

```text
https://your-domain.com/**
```

## 6. Configure Supabase Storage

Open:

```text
Storage
```

Confirm the bucket exists:

```text
pet-assets
```

The schema creates it as public because pet sprites need to render in battles. Uploads are still restricted by policy so users can only upload into their own folder:

```text
pet-assets/<user-id>/<pet-id>/pet.json
pet-assets/<user-id>/<pet-id>/spritesheet.webp
```

If you prefer private assets later, change the bucket to private and replace direct URLs with signed URLs.

## 7. Environment Variables

Create a local `.env.local`:

```bash
cp .env.example .env.local
```

Fill it with:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

Rules:

- `NEXT_PUBLIC_SUPABASE_URL` is safe for the browser.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe for the browser when RLS is enabled.
- `NEXT_PUBLIC_SITE_URL` is safe for the browser. Set it to your production Vercel URL in Vercel so social cards, invite links, and share buttons point at the live site.
- `SUPABASE_SERVICE_ROLE_KEY` must only be used server-side.
- `GEMINI_API_KEY` must only be used server-side.
- `GEMINI_MODEL` is optional. The default is `gemini-2.5-flash`.
- Never commit `.env.local`.

Run:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Check:

- `/auth` can sign up or log in.
- `/upload` shows that login is required before saving pets.
- `/battle/demo` loads the demo battle.

## 8. Deploy To Vercel

1. Push the repo to GitHub.
2. Open [Vercel](https://vercel.com/).
3. Click:

```text
Add New -> Project
```

4. Import the GitHub repository.
5. Use the default framework detection:

```text
Framework Preset: Next.js
Build Command: npm run build
Install Command: npm install
Output Directory: .next
```

6. Add Environment Variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
GEMINI_MODEL
```

7. Deploy.

After the first deployment, copy the production Vercel URL and return to Supabase Auth URL Configuration.

Set:

```text
Site URL: https://your-vercel-domain.vercel.app
Redirect URLs:
https://your-vercel-domain.vercel.app/**
```

Redeploy if you changed environment variables.

## 9. Production Verification

Open the Vercel URL and verify:

1. Home page loads with styling.
2. `/battle/demo` renders real Codex pets.
3. `/auth` creates a user.
4. `/upload` blocks saving while signed out.
5. After login, `/upload` allows validated pet upload.
6. Uploaded files appear in:

```text
Supabase -> Storage -> pet-assets
```

7. Pet rows appear in:

```text
Supabase -> Table Editor -> pets
```

8. Move rows appear in:

```text
Supabase -> Table Editor -> moves
```

Each uploaded pet should have two rows in slots `1` and `2`.

9. Realtime tables are visible and enabled under `Database -> Publications -> supabase_realtime`.

10. Authenticated server battle APIs respond:

```text
POST /api/pets/create
POST /api/matchmaking/random
POST /api/lobbies
POST /api/lobbies/join
GET /api/battles/active
GET /api/battles/:id
POST /api/battles/:id/turn
POST /api/battles/:id/leave
```

All require:

```text
Authorization: Bearer <supabase access token>
```

## 10. Uploading A Codex Pet

Users should create a pet with the `hatch-pet` skill.

The generated files are usually here:

```text
~/.codex/pets/<pet-id>/pet.json
~/.codex/pets/<pet-id>/spritesheet.webp
```

The app validates:

- `pet.json` exists.
- `spritesheet.webp` exists.
- spritesheet MIME type is WEBP.
- image dimensions are `1536x1872`.
- atlas shape is 8 columns x 9 rows.
- cell size is `192x208`.
- expected animations exist when listed in `pet.json`.

Accepted files are saved to:

```text
pet-assets/<user-id>/<pet-id>/pet.json
pet-assets/<user-id>/<pet-id>/spritesheet.webp
```

Pet metadata is saved to:

```text
public.pets
```

Two generated fight moves are saved to:

```text
public.moves
```

Move generation uses:

```text
Pet name + pet description -> Gemini/fallback -> 2 normalized fight moves
```

The saved move fields are:

```text
pet_id
slot
display_name
move_key
power
accuracy
category
affinity
max_charges
effect
```

## 10.1 Progression Rules

The battle engine awards XP when a pet wins by fainting the opponent.

Current formulas:

```text
XP gained = max(12, 24 + defeated_level * 8 + level_gap * 5)
level_gap = clamp(defeated_level - winner_level, -5, 8)
XP needed for next level = level * level * 12
```

On level-up:

```text
HP +5
Attack +2
Defense +2
Special +2
Speed +2
```

The `pets` table already stores:

```text
level
xp
stats
```

Server-side battle resolution persists the winner's updated `level`, `xp`, and `stats` to `public.pets` when the battle completes. It also increments profile `wins` and `losses`.

## 10.2 Battle Balance

New pets start at level 1 with roughly 42-50 HP. Basic attacks are tuned around 5-15 damage so a normal fight lands around 6-7 actions, depending on affinity, crits, misses, and guard.

If your Supabase project already has pets created before this balance pass, run this optional cleanup once:

```sql
update public.pets
set
  level = 1,
  xp = 0,
  stats = jsonb_build_object(
    'hp', 46,
    'attack', 18,
    'defense', 18,
    'special', 18,
    'speed', 16
  )
where level = 5
  and (stats ->> 'hp')::int > 70;

update public.moves
set power = greatest(18, least(34, round(power * 0.48)::int))
where power > 34;
```

## 11. Security Checklist

Before launch:

- Confirm RLS is enabled on all public tables.
- Confirm browser clients cannot insert or update `pets`, `moves`, `lobbies`, `battles`, `battle_turns`, or `battle_events` directly.
- Confirm browser clients cannot insert or update `profile_badges` directly.
- Confirm pet and move creation goes through `POST /api/pets/create` using a user bearer token.
- Confirm storage upload policy only allows user-owned folders.
- Confirm matchmaking and lobby routes verify that the selected pet belongs to the authenticated user.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is only set in Vercel environment variables and never exposed in client code.
- Confirm `GEMINI_API_KEY` is only set in Vercel environment variables and never exposed in client code.
- Confirm Supabase Auth redirect URLs only include trusted local and production URLs.
- Confirm `pet-assets` being public is acceptable for your product.

## 12. Useful Commands

Run locally:

```bash
npm run dev
```

Run tests:

```bash
npm run test
```

Build exactly like Vercel:

```bash
npm run build
```

Start a production build locally:

```bash
npm run build
npm run start
```

## 13. Common Issues

### Page Looks Unstyled In Local Dev

If you run `npm run build` while `npm run dev` is still running, Next can leave stale dev CSS references in `.next`.

Fix:

```bash
# stop the dev server
rm -rf .next
npm run dev
```

The app also includes `/arena.css` as a stable fallback stylesheet.

### Upload Button Is Disabled

This is expected when:

- Supabase env vars are missing.
- The user is signed out.
- The pet files have not passed validation.

### Supabase Upload Fails

Check:

- The `pet-assets` bucket exists.
- Storage policies from `supabase/schema.sql` were created.
- The user is logged in.
- The upload path starts with the logged-in user's UUID.
- A matching `profiles` row exists for the logged-in auth user. The schema trigger creates this for new users; use the backfill SQL in section 3 for existing users.

### Pet Uploads But Moves Do Not Save

Check:

- `SUPABASE_SERVICE_ROLE_KEY` is set for the Next.js API route.
- The uploaded pet row has `owner_id` matching the authenticated user.
- The move rows use the uploaded pet id.
- The browser network response from `/api/pets/create` includes two moves.

### Gemini Move Generation Does Not Work

Check:

- `GEMINI_API_KEY` is set in Vercel.
- `GEMINI_MODEL` is valid for your Gemini account.
- The Vercel function logs do not show Gemini API errors.

If Gemini is unavailable, the app still creates deterministic fallback moves.

### Auth Login Works Locally But Not On Vercel

Check Supabase:

```text
Authentication -> URL Configuration
```

Add:

```text
https://your-vercel-domain.vercel.app/**
https://your-custom-domain.com/**
```

### Realtime Does Not Update

Check:

- Realtime is enabled for the relevant tables under `Database -> Publications -> supabase_realtime`.
- RLS policies allow the current user to read the battle/lobby rows.
- Browser console has no Supabase connection errors.

## 14. Current Limitations

The app is wired for Supabase and includes the schema, upload flow, matchmaking APIs, dashboard roster loading, reconnect-to-active-battle flow, server-authoritative alternating turns, explicit fight leaving, stale active battle cleanup, Realtime battle updates, and polling fallback. `/battle/demo` remains a local demo.

Before a full public launch, complete:

- Rematch flow.
- Rating update transaction after match completion.
- Production auth polish.
- Mobile and visual QA pass.
- Deployment smoke test.
