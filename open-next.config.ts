import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// App dinâmico (lê o D1 a cada request), sem cache incremental em R2.
export default defineCloudflareConfig({});
