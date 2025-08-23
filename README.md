# Biz Card (SPA + Supabase)

Single-page app that renders business cards from Supabase. Visit `/{handle}` to view a card whose `handle` matches the path segment (e.g. `/warren`).

## Quick start

1) Copy config and fill it
```bash
cp config.example.js config.js
# edit config.js → set supabaseUrl, supabaseAnonKey, defaultHandle
```

2) Serve locally (any static server)
```bash
npx serve -s .
# open http://localhost:3000/ (or port reported)
```

3) Deploy (GitHub Pages)
- Keep repository named `biz-card.github.io` (user/organization site) or any repo for project pages
- In GitHub → Settings → Pages: choose Source "Deploy from a branch" and root directory, or use Actions

## Supabase setup

### Create project
1. Go to `https://supabase.com` and create a project
2. Note your Project URL and `anon` public key (Project settings → API)

### Database schema
Run this SQL in Supabase SQL editor:

```sql
create table if not exists public.cards (
  handle text primary key,
  name text not null,
  title text,
  company_name text,
  department text,
  email text,
  phone_number text,
  company_address text,
  remarks text,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security
alter table public.cards enable row level security;

-- Public read (optional). Restrict as needed.
create policy "Public read cards" on public.cards
  for select
  using (true);

-- Optional: allow authenticated users to insert/update their own rows
-- Adjust to your auth model. For demo purposes only.
-- create policy "Authenticated upsert" on public.cards
--   for insert with check (auth.role() = 'authenticated')
--   to authenticated;
-- create policy "Authenticated update" on public.cards
--   for update using (auth.role() = 'authenticated')
--   to authenticated;
```

### Seed data
```sql
insert into public.cards (handle, name, title, company_name, department, email, phone_number, company_address)
values
  ('warren', 'Warren Wong', 'Regional Director, APAC', 'Dify', null, 'business@dify.ai', '+852 9876-5432', '440 N. Wolfe Road, Sunnyvale, CA 94085')
on conflict (handle) do update set
  name = excluded.name,
  title = excluded.title,
  company_name = excluded.company_name,
  department = excluded.department,
  email = excluded.email,
  phone_number = excluded.phone_number,
  company_address = excluded.company_address;
```

### Configure the app
- Open `config.js` and set:
  - `supabaseUrl`: your project URL (e.g. `https://abc123.supabase.co`)
  - `supabaseAnonKey`: the anon public key
  - `defaultHandle`: which handle to show at `/`

## Usage
- Visit `/` → redirects internally to `/{defaultHandle}` resolution
- Visit `/{handle}` to load that card from Supabase `cards` table
- Click "Add to contacts" to download a `.vcf` vCard file

## Enforce read-only from the web app
The SPA only reads data. Lock down writes at the database level so browser clients cannot insert/update/delete:

```sql
-- Ensure RLS is enabled (already done above)
alter table public.cards enable row level security;

-- Revoke all privileges, then grant only SELECT to web roles
revoke all on table public.cards from anon, authenticated;
grant select on table public.cards to anon, authenticated;

-- With RLS and no write policies, writes are denied for anon/authenticated
```

## Add or migrate the `remarks` column
This field is internal-only and not shown in the card view. To add it to an existing project:

```sql
alter table public.cards add column if not exists remarks text;
```

## Allow inserts from another app
Two safe approaches to create cards from a different app while keeping this SPA read-only:

### Option A — Server-to-server (recommended)
Use the Supabase Service Role key only on a secure backend. The service role bypasses RLS; your browser app remains read-only.

Example (server only):

```bash
curl -X POST 'https://<project>.supabase.co/rest/v1/cards' \
  -H 'apikey: <SERVICE_ROLE_KEY>' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{
    "handle": "alice",
    "name": "Alice Example",
    "title": "Engineer",
    "company_name": "Acme Inc",
    "department": "R&D",
    "email": "alice@example.com",
    "phone_number": "+1-555-555-5555",
    "company_address": "123 Main St, City",
    "remarks": "internal notes"
  }'
```

```js
// Node server example (server only – use SERVICE ROLE key)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

await supabase.from('cards').insert({
  handle: 'alice',
  name: 'Alice Example',
  title: 'Engineer',
  company_name: 'Acme Inc',
  department: 'R&D',
  email: 'alice@example.com',
  phone_number: '+1-555-555-5555',
  company_address: '123 Main St, City',
  remarks: 'internal notes'
});
```

No SQL changes are required for Option A beyond keeping the SPA read-only.

### Option B — Trusted client app (no server)
Keep the public SPA read-only. Allow only authenticated users to insert via RLS in a separate, trusted client (e.g., an internal tool). Do not expose credentials publicly.

SQL changes:

```sql
-- Keep anonymous users read-only
revoke all on table public.cards from anon, authenticated;
grant select on table public.cards to anon;

-- Allow signed-in clients to read and insert
grant select, insert on table public.cards to authenticated;

-- RLS policy: allow any authenticated user to insert
create policy if not exists "Authenticated insert cards" on public.cards
  for insert to authenticated
  with check (true);

-- Optional: restrict inserts to a specific user id
-- drop policy if exists "Authenticated insert cards" on public.cards;
-- create policy "Machine user insert" on public.cards
--   for insert to authenticated
--   with check (auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid);
```

Client flow (trusted client): sign in a machine user to get a JWT, then use supabase-js to call `insert`. Keep the GitHub Pages SPA on `anon` with read-only access.

## Service Role key (server-only)
Never expose the Service Role key in a browser or public repo. Use it only on trusted servers to perform privileged actions (e.g., inserts, updates, admin tasks).

How to get it:
- In Supabase Dashboard → Project Settings → API → copy the value under "Service Role".

How to store it (examples):
- Backend env var: set `SUPABASE_SERVICE_ROLE_KEY` on your server/container.
- GitHub Actions: Repo → Settings → Secrets and variables → Actions → New repository secret → name `SUPABASE_SERVICE_ROLE_KEY`.
- Vercel/Netlify/Render/Cloudflare: add as a project environment variable.

Use it in code (server only):
```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
```

Rotate if compromised:
- Supabase Dashboard → Project Settings → API → Regenerate keys. Then update all environments where it’s stored.

## Support
If you run into any problems, email: difybizcard@gmail.com
