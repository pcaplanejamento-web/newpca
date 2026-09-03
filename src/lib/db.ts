import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

/**
 * Handle do Drizzle sobre o D1. Use SEMPRE dentro de escopo de request
 * (Server Components `force-dynamic`, Route Handlers, Server Actions).
 */
export function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}

export type DB = ReturnType<typeof getDb>;
