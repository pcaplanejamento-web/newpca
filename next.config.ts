import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // O type-check roda no dev (tsc). No build de produção não bloqueamos por
  // divergências de tipos de ambiente (globais do workerd vs DOM), que não
  // afetam o runtime.
  typescript: { ignoreBuildErrors: true },
  // pdf.js (`pdfjs-dist`) é usado SÓ no cliente (importação dinâmica em
  // `parse-dfd-pdf.ts`) para ler o DFD em PDF. Transpila o pacote e ignora a
  // dependência OPCIONAL `canvas` (módulo nativo do Node, só p/ rasterizar) —
  // aqui só extraímos TEXTO, então o bundler não deve tentar resolvê-la.
  transpilePackages: ["pdfjs-dist"],
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = { ...(config.resolve.alias as object), canvas: false };
    return config;
  },
};

export default nextConfig;

// Disponibiliza os bindings da Cloudflare (D1 etc.) durante `next dev`.
// Só no dev: em build de produção os bindings são acessados em runtime pelo
// Worker, então não precisamos subir o Miniflare durante o `next build`.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
