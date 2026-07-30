# Safina CMS — agent notes

Read this before touching anything in this repository.

## What this is

A fork of [Pages CMS](https://github.com/hunvreus/pagescms) (MIT, Copyright 2025
Ronan Berder) that Safina Studio self-hosts at **https://cms.safinastudio.com**
so clients can edit their own websites without a GitHub account.

The reason for forking: the hosted service exposes collaborator invitation only
as an internal server action. Self-hosting turns that into **our** API endpoint,
which is what makes client handover automatable end to end.

Upstream base commit is recorded in `UPSTREAM_BASE`.

- Design: `safinastudio/docs/superpowers/specs/2026-07-29-safina-cms-platform-design.md`
- Plan: `safinastudio/docs/superpowers/plans/2026-07-29-safina-cms-platform.md`

## Architecture

| Piece | Where |
|---|---|
| Runtime | Cloudflare Worker `safina-cms` via `@opennextjs/cloudflare`, account `f877a5957436eb2d2fea32f0f3d75562` |
| Database | Supabase project `cieepqhhjibduwesqgme`, **`cms` schema**, reached through Hyperdrive `dfa795cdbe7b4f41a645c7b492525b3d` |
| Mail | Brevo HTTP API (`lib/mailer-brevo.ts`), sender `hello@safinastudio.com` |
| GitHub App | **Safina Studio CMS**, App ID `4429376`, owned by `osa4589` |
| Client repos | the **`safina-clients`** org (deliberately NOT `osa4589` — see below) |

Cloudflare Workers Paid ($5/mo, flat, account-level) is **required**: the bundle
is ~6.9 MB against a 3 MB free-tier limit, and the free tier's 10 ms CPU budget
cannot run Next.js SSR plus RSA signing plus a database round trip.

## Safina additions to upstream

New files (safe on rebase):

- `lib/mailer-brevo.ts` — HTTP mail provider. Workers cannot open TCP sockets,
  so `nodemailer` SMTP is unusable there.
- `lib/provision-auth.ts` — constant-time bearer verification. Hashes both sides
  with SHA-256 before comparing so neither the token nor its length leaks. Fails
  closed when `PROVISION_SERVICE_TOKEN` is unset.
- `lib/provision-installation.ts` — resolves a repo's App installation, and
  converts GitHub's **PKCS#1** private keys to PKCS#8 (`crypto.subtle.importKey`
  rejects PKCS#1 outright).
- `lib/provision-request.ts`, `lib/collaborator-invite.ts`
- `app/api/provision/route.ts` — the provisioning endpoint.
- `test/*.test.ts` — this repo had **no test suite** before the fork.

Modified upstream files (keep these diffs minimal):

- `lib/mailer.ts` — registers the `brevo` provider.
- `lib/actions/collaborator.ts` — invite-URL helper extracted out.
- `db/index.ts` — Hyperdrive-aware connection.
- `middleware.ts` — renamed from `proxy.ts`; exempts `/api/provision`.
- `db/migrations/0000_*.sql`, `0003_*.sql` — schema rewrite (see traps).

## `POST /api/provision`

```
Authorization: Bearer <PROVISION_SERVICE_TOKEN>
{ "repo": "safina-clients/<slug>", "email": "client@example.com", "name": "Client" }
```

Returns `{ status: "created" | "existing", inviteUrl }`. **Idempotent** — backed
by the unique index `uq_collaborator_owner_repo_email_ci`, which matters because
payment webhooks retry.

- `401` — missing or wrong token. Never touches the database.
- `409` — the App is not installed on that repo. The message names the remedy.
- `502` — invite created but mail failed; **`inviteUrl` is still returned** so
  access is never lost to a bounced email.

## Deploying

```bash
export CLOUDFLARE_API_TOKEN=$(cat ~/SafinaStudio/.secrets/cloudflare-api-token)
export CLOUDFLARE_ACCOUNT_ID=f877a5957436eb2d2fea32f0f3d75562
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$(cat ~/SafinaStudio/.secrets/safina-cms-database-url)"
npm run deploy
```

The third variable is **not optional** — OpenNext runs a local Hyperdrive
emulation check at build time and fails without it. It is deliberately not
committed: **this repository is public.**

Secrets live in `~/SafinaStudio/.secrets/` and as Worker secrets. Never commit
them, never echo them. `account_id` is deliberately absent from `wrangler.jsonc`
for the same reason.

## Traps

**1. `search_path` cannot be set per connection.** CMS tables live in the `cms`
schema and Drizzle emits unqualified names, so `cms` must be on the path — but
every pooler mishandles it. Supavisor transaction mode (6543) fails the
connection with `unsupported startup parameter in options: search_path`;
Supavisor session mode silently ignores it; and sending it as a startup
parameter through Hyperdrive **breaks the connection entirely**. It is therefore
a Postgres **role default**, applied at connect time where no pooler can strip
it:

```sql
ALTER ROLE postgres IN DATABASE postgres
  SET search_path TO "$user", public, extensions, cms;
```

`cms` is appended **last**, so resolution order for the unrelated apps sharing
this database is unchanged. Do not reintroduce a per-connection `search_path`.

**2. Rebasing will reintroduce `proxy.ts`.** `next build` **hard errors** if
`middleware.ts` and `proxy.ts` both exist. Delete `proxy.ts` after every rebase.

**3. Rebasing will reintroduce `"public"."user"` in migrations.** Upstream
migrations hardcode the `public` schema in foreign keys. Any new upstream
migration needs `"public".` rewritten to `"cms".` or its FKs will point outside
the schema the tables actually live in.

**4. Worker secrets do not propagate instantly.** After `wrangler secret put`,
some isolates serve the old value briefly. A single failed probe right after a
secret change is expected — re-run before debugging.

## Known gaps

- **Pre-existing upstream security hole:** `middleware.ts` returns early for any
  path matching `/\.[^/]+$/` *before* the `/api/` origin check, so e.g.
  `POST /api/{owner}/{repo}/{branch}/entries/content%2Fpost.md` bypasses CSRF
  origin validation. Byte-identical to upstream. Worth reporting upstream.
- Inherited dependency vulnerabilities from upstream (Dependabot reports ~63).
- The App lacks `pull_requests` permission — fine for direct-commit editing.
- `angelsmiles-dental` is deliberately **not** on this platform; it stays on
  `osa458` with the hosted CMS by owner decision.

## Testing

```bash
npm test          # node:test via tsx
npm run lint      # baseline: 0 errors, 15 pre-existing upstream warnings
npx tsc --noEmit
```

Do not "fix" the 15 warnings — they are upstream's and the baseline depends on
that count staying put.
