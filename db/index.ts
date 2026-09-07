import "./envConfig";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const POOL = {
  // Keep conservative pool size in dev to avoid local connection spikes.
  max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || "5", 10),
  prepare: false, // Required: Hyperdrive pools connections, so no prepared statements.
};

const makeDb = (connectionString: string): Db =>
  drizzle(postgres(connectionString, POOL), { schema });

// Safina CMS tables live in a dedicated `cms` schema so they cannot collide
// with the unrelated tables in `public`, and the Drizzle models emit
// UNQUALIFIED table names — so `cms` has to be on the search path.
//
// It is deliberately NOT set here. Every connection pooler rejects or drops a
// per-connection search_path: Supavisor transaction mode fails the connection
// outright ("unsupported startup parameter in options: search_path"), Supavisor
// session mode silently ignores it, and sending it as a startup parameter
// through Hyperdrive breaks the connection too. Instead it is a ROLE default
// applied by Postgres at connect time, which no pooler can strip:
//   ALTER ROLE postgres IN DATABASE postgres
//     SET search_path TO "$user", public, extensions, cms;
// (migration: append_cms_to_role_search_path_for_safina_cms)

// ---------------------------------------------------------------------------
// WHY THE CLIENT IS PER-REQUEST
//
// On Cloudflare Workers a socket belongs to the request context that opened
// it and cannot be used by another request. This module used to build ONE
// `postgres()` client at module scope, so its connection was bound to whichever
// request first evaluated the module on an isolate: the first request on a
// fresh isolate worked, and every later request on that isolate was refused
// instantly — the runtime reported "hung and would never generate a response"
// after 3-6 ms, i.e. before any I/O. Roughly half of all content reads failed,
// tracking how often a warm isolate was reused. (2026-09-07)
//
// So the client is now created lazily, once per request, keyed on the request's
// ExecutionContext. That key is safe under concurrency because OpenNext serves
// `getCloudflareContext()` from an AsyncLocalStorage store
// (@opennextjs/cloudflare/dist/cli/templates/init.js).
//
// Sockets are intentionally NOT closed here: `end()` from inside this module
// would race the request's own queries. Hyperdrive owns the server-side pool;
// the client socket is released with the request.
// ---------------------------------------------------------------------------

const perRequest = new WeakMap<object, Db>();

// Outside a Workers request (local dev, tests, migrations) keep one
// process-wide client, exactly as before.
let processDb: Db | undefined;

type CfContext = {
  env?: { HYPERDRIVE?: { connectionString: string } };
  ctx?: object;
};

const currentDb = (): Db => {
  let cf: CfContext | undefined;
  try {
    cf = getCloudflareContext() as CfContext;
  } catch {
    // Not running on Workers — fall through to the process-wide client.
  }

  const ctx = cf?.ctx;
  if (!ctx) {
    if (!processDb) {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("Neither HYPERDRIVE nor DATABASE_URL is available.");
      processDb = makeDb(url);
    }
    return processDb;
  }

  let instance = perRequest.get(ctx);
  if (!instance) {
    const url = cf?.env?.HYPERDRIVE?.connectionString ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Neither HYPERDRIVE nor DATABASE_URL is available.");
    instance = makeDb(url);
    perRequest.set(ctx, instance);
  }
  return instance;
};

// `db` keeps the same import for every consumer; each property access resolves
// against the CURRENT request's client. Methods are bound so `this` is right
// for drizzle internals (e.g. `db.transaction`).
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = currentDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});
