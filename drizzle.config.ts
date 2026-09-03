import { defineConfig } from "drizzle-kit";

// `out` == `migrations_dir` do wrangler.jsonc, para que drizzle-kit gere e o
// wrangler aplique as mesmas migrations.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
