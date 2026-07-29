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
