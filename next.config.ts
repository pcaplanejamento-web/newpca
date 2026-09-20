import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // O type-check roda no dev (tsc). No build de produção não bloqueamos por
  // divergências de tipos de ambiente (globais do workerd vs DOM), que não
  // afetam o runtime.
  typescript: { ignoreBuildErrors: true },
  // pdf.js (`pdfjs-dist`) e o tesseract.js (OCR do carimbo Foxit — Formato E) são usados SÓ no cliente
  // (importação DINÂMICA em `parse-dfd-pdf.ts` / `ocr-assinatura.ts`) — ficam fora do bundle do Worker.
  // Transpila os pacotes e ignora a dependência OPCIONAL `canvas` (módulo nativo do Node): no navegador
  // rasterizamos num `<canvas>` do DOM, então o bundler não deve tentar resolvê-la. O tesseract.js carrega
  // worker/core/idioma dos assets self-hosted em `/public/tesseract` (não da CDN — ver docs/OCR-ASSINATURA.md).
  // Obs.: o build roda com **webpack** (`next build --webpack` no package.json),
  // pois o Turbopack (padrão no Next 16) rejeita um `webpack` config e não
  // aplicaria este alias.
  transpilePackages: ["pdfjs-dist", "tesseract.js"],
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
