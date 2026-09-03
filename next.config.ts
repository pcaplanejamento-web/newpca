import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // O type-check roda no dev (tsc). No build de produção não bloqueamos por
  // divergências de tipos de ambiente (globais do workerd vs DOM), que não
  // afetam o runtime.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;

// Disponibiliza os bindings da Cloudflare (D1 etc.) durante `next dev`.
// Só no dev: em build de produção os bindings são acessados em runtime pelo
// Worker, então não precisamos subir o Miniflare durante o `next build`.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
