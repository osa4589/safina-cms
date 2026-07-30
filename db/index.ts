import "./envConfig";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pagesCmsPostgresClient: ReturnType<typeof postgres> | undefined;
}

const resolveConnectionString = (): string => {
  try {
    const hyperdrive = (getCloudflareContext().env as { HYPERDRIVE?: { connectionString: string } })
      .HYPERDRIVE;
    if (hyperdrive?.connectionString) return hyperdrive.connectionString;
  } catch {
    // Not running on Workers (local dev, tests, migrations) — fall through.
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Neither HYPERDRIVE nor DATABASE_URL is available.");
  return url;
};

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
const client =
  globalThis.__pagesCmsPostgresClient
  ?? postgres(resolveConnectionString(), {
    // Keep conservative pool size in dev to avoid local connection spikes.
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || "5", 10),
    prepare: false, // Required: Hyperdrive pools connections, so no prepared statements.
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__pagesCmsPostgresClient = client;
}

export const db = drizzle(client, { schema });
