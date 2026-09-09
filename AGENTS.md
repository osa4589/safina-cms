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
| Client repos | **`osa4589`** — the App is **private to osa4589** ("Only on this account"), so it cannot be installed on `safina-clients` at all; a 2026-09-06 attempt 404'd. Each new repo must be added to installation `149943888` (sudo/passkey-gated, 403 for OAuth tokens). Moving to `safina-clients` requires first making the App public. |

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
- `lib/brand.ts` — every client-visible product string. Nothing else may hard-code a
  product name; upstream's leaked into the sign-in page, tab title, OTP subject and the
  Terms/Privacy links (which pointed at a third party) before this existed.
- `lib/branch-scope.ts` — the collaborator branch boundary (see traps).
- `lib/actions.ts` `resolveAllowedActions` / `findDeclaredAction` — the actions endpoint
  only dispatches what `.pages.yml` declares for the requesting context; the request
  body may name an action, never choose the workflow file or ref.
- `test/*.test.ts` — this repo had **no test suite** before the fork.

Modified upstream files (keep these diffs minimal):

- `lib/mailer.ts` — registers the `brevo` provider.
- `lib/actions/collaborator.ts` — invite-URL helper extracted out.
- `db/index.ts` — Hyperdrive-aware connection.
- `middleware.ts` — renamed from `proxy.ts`; exempts `/api/provision`.
- `db/migrations/0000_*.sql`, `0003_*.sql` — schema rewrite (see traps).

## `POST /api/provision`

**`branch` is REQUIRED (since 2026-09-09)** — a branch name to confine the person to
(`"draft"`), or `null` to deliberately grant the whole repository *including the branch
behind their live site*. A body without it is a `400`. The column shipped in the schema
in July and nothing wrote it, so every client provisioned before this got full-repo
access; the confinement itself is enforced in `lib/token.ts` via `lib/branch-scope.ts`.
Re-provisioning an existing email **updates** the branch. **In this deployment that is
the only way to set or change one**: the invite dialog in the app also has a branch box,
but it is usable only by a signed-in account with a linked GitHub identity that can push
to the repo, and nobody here has one (the owner signs in by email).


```
Authorization: Bearer <PROVISION_SERVICE_TOKEN>
{ "repo": "safina-clients/<slug>", "email": "client@example.com", "name": "Client", "branch": "draft" }   // or "branch": null — deliberately the whole repo, live branch included
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
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"   # see below
export CLOUDFLARE_API_TOKEN=$(cat ~/SafinaStudio/.secrets/cloudflare-api-token)
export CLOUDFLARE_ACCOUNT_ID=f877a5957436eb2d2fea32f0f3d75562
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$(cat ~/SafinaStudio/.secrets/safina-cms-database-url)"
npm run deploy
node -v && npx wrangler deployments list --name safina-cms | head -3   # PROVE it landed
```

**Node 22+ is required.** This Mac's default `node` is v20.19.5 and wrangler refuses
to run below 22; `nvm` has v22.22.1, so put it on `PATH` as above. The build succeeds
either way — only the deploy step fails — so `.open-next/worker.js` gets rebuilt and
everything *looks* like it worked until you check what is actually live.

**All three env vars are required and each fails at a different stage**, so fixing one
just moves the error: no Hyperdrive string fails during the build, no
`CLOUDFLARE_API_TOKEN` fails at the deploy call. Export all three, every time.

`npm run deploy` **does** exit non-zero on failure — an earlier revision of this file
claimed otherwise, having misread a shell wrapper's exit code (the `$?` of a trailing
`grep`, not of npm). Still verify by artifact rather than status:
`npx wrangler deployments list --name safina-cms | head -3`.

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

**5. GitHub issues App private keys as PKCS#1; WebCrypto only accepts PKCS#8.**
`lib/token.ts` → `@octokit/app` → `universal-github-app-jwt` throws on
`-----BEGIN RSA PRIVATE KEY-----`. Only `lib/provision-installation.ts` converts it,
which is why provisioning returned 200 while every repo read 500'd for two months.
Store `GITHUB_APP_PRIVATE_KEY` as PKCS#8 (`openssl pkcs8 -topk8 -nocrypt`) and prove
it is the same key first: `openssl rsa -in <f> -pubout | openssl sha256` must match.

**6. `CRYPTO_KEY` must be `openssl rand -base64 32`.** `lib/crypto.ts` does
`atob(CRYPTO_KEY)`; anything that is not valid base64 throws `InvalidCharacterError`
at the moment a freshly minted installation token is encrypted for storage. Rotating
it destroys every row in `github_installation_token` and `account` — check they are
empty first.

**7. The database client must be per request.** On Workers a socket belongs to the
request that opened it. A module-scope `postgres()` client is bound to the first
request on each isolate and every later request on that isolate is refused before any
I/O (tail shows cancellation at 3-6 ms). `db/index.ts` now creates the client once per
request, keyed on the `ExecutionContext` in a WeakMap, behind a `Proxy` so `db` stays
one export. Measured 8/20 → 20/20. Do not "fix" this by memoising on `globalThis` —
that was measured as a no-op.

**8. `atomicVerifyOTP` (better-auth email-otp) deletes the stored code BEFORE
verifying it.** Any transient server error burns the user's one-time code, and
re-entering it presents as an endless redirect to sign-in. Upstream ordering bug; moot
while sign-in is healthy, but worth reporting.

**9. A GitHub token that can only READ the repo is no longer authority over it.**
`canAccessRepoWithToken` returns true only with `permissions.push` (2026-09-09). Before,
`repos.get` succeeding — which it does for ANY token on a public repo — made the user's own
token win in `getToken`, skipping collaborator and branch confinement. Consequence: a
GitHub-linked user with pull-only access and no collaborator row now gets "Access denied"
where upstream let them browse. Deliberate; add a collaborator row if they should edit.

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
npm run lint      # baseline: 0 errors, 14 pre-existing upstream warnings (this file said 15 until 2026-09-09; measured at 2ee1106 and after the hardening commits: 14, identical set)
npx tsc --noEmit
```

Do not "fix" the 14 warnings — they are upstream's and the baseline depends on
that count staying put. If a change of yours moves the number, MEASURE which site
(`eslint . -f json` before and after, diff the (file, rule, message) triples) and say so
here — an earlier note here guessed the cause and was wrong.
