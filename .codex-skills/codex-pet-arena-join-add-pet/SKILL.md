---
name: codex-pet-arena-join-add-pet
description: Use when helping a Codex user join Codex Pet Arena, create or sign into their account, find their local hatch-pet files, upload a pet, import a public pet from codex-pets.net, or fix user-facing upload/import problems. This is for players joining the site with their pets, not for local development, deployment, database administration, or battle strategy.
---

# Codex Pet Arena Join + Add Pet

Use this skill to help a player join Codex Pet Arena and add their Codex pet to the site. Keep guidance user-facing. Do not discuss deployment, Supabase admin, RLS, migrations, or local development unless the user explicitly says they are running the app themselves.

Do not provide battle strategy in this skill. Once the user has a pet on the site, direct them to the dashboard to choose a fight mode.

## What The User Needs

- A Codex Pet Arena account.
- A Codex pet created with the `hatch-pet` skill, or a public `codex-pets.net` pet URL.
- The website open in a browser.

Production site:

```text
https://codex-pets-arena.setec.rs/
```

If the user does not have a pet yet, tell them to create one with the `hatch-pet` skill first.

## Join The Site

1. Open Codex Pet Arena in the browser.
   - Use `https://codex-pets-arena.setec.rs/`.
2. Go to the login/signup page.
3. If this is their first time, choose signup.
4. If email confirmation is enabled, tell them to check their email and confirm the account.
5. After signing in, go to the dashboard.

Use this explanation when needed:

```text
You need to be logged in before the site can save your pet to your roster.
```

## Add A Pet From hatch-pet

Ask the user to find the pet folder created by `hatch-pet`:

```text
~/.codex/pets/<pet-id>/
```

They need these two files:

```text
pet.json
spritesheet.webp
```

On the site:

1. Go to the upload page.
2. Select `pet.json`.
3. Select `spritesheet.webp`.
4. Wait for validation.
5. If validation passes, click the save/upload button.
6. After the success message, go back to the dashboard.

Tell the user to upload both files together. Uploading only one file will not work.

## Import A Public Pet

If the user wants to use a public pet from Codex Pets, ask for a URL like:

```text
https://codex-pets.net/#/pets/sable
```

On the upload page:

1. Paste the Codex Pets URL into the import field.
2. Click import.
3. Wait for the pet to be fetched and validated.
4. If validation passes, save it to the roster.

The user must be logged in before importing.

## Validation Rules

The site accepts Codex pet atlases with:

- `spritesheet.webp`
- `1536x1872` image size
- `8` columns
- `9` rows
- `192x208` cells

Required animation rows:

- `idle`
- `running-right`
- `running-left`
- `waving`
- `jumping`
- `failed`
- `waiting`
- `running`
- `review`

If validation fails, suggest repairing or regenerating the pet with `hatch-pet`.

## What Happens After Upload

Explain briefly:

- The pet is added to the user's roster.
- The site creates a small thumbnail so the dashboard loads faster.
- The site creates two personal fight moves based on the pet name and description.
- If move generation is unavailable, the site uses fallback moves automatically.
- The pet starts at level 1.

## Common User Problems

### "I cannot find my pet files"

Tell them to check:

```text
~/.codex/pets/
```

Each pet should have its own folder. They need the folder containing `pet.json` and `spritesheet.webp`.

### "The upload button is disabled"

Likely causes:

- They are not logged in.
- Validation has not passed yet.
- One of the two required files is missing.
- The spritesheet is not a valid Codex atlas.

### "It says I need to log in"

Tell them to log in or finish email confirmation first. The site can validate files locally, but it cannot save the pet without an account.

### "Import from codex-pets.net failed"

Check:

- The user is logged in.
- The URL uses `https://codex-pets.net/#/pets/<slug>`.
- The public pet still exists.
- The public pet has a valid `spritesheet.webp`.

### "My pet saved, what now?"

Tell them to go to the dashboard, select the pet in their roster, then choose one of the available fight options.
