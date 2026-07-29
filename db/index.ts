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
// with the 48 unrelated tables in `public`. The Drizzle schema uses unqualified
// table names, so search_path must be set on every connection. It is sent as a
// startup parameter rather than a URL option because Hyperdrive does not
// guarantee passthrough of `?options=` from its origin connection string.
const DB_SCHEMA = process.env.POSTGRES_SCHEMA || "cms";

const client =
  globalThis.__pagesCmsPostgresClient
  ?? postgres(resolveConnectionString(), {
    // Keep conservative pool size in dev to avoid local connection spikes.
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || "5", 10),
    prepare: false, // Required: Hyperdrive pools connections, so no prepared statements.
    connection: { search_path: DB_SCHEMA },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__pagesCmsPostgresClient = client;
}

export const db = drizzle(client, { schema });
