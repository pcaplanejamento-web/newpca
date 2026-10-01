// Gera src/lib/extensao-centi-arquivos.ts com os arquivos da extensao-centi/ (o zip é montado em runtime pela rota
// /api/automacao/extensao, com a logo do sistema). Rode após mudar a extensão: node scripts/gerar-extensao.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const pasta = new URL("../extensao-centi/", import.meta.url);
const arquivos = Object.fromEntries(
  readdirSync(pasta)
    .filter((n) => /\.(js|json)$/.test(n))
    .sort()
    .map((n) => [n, readFileSync(new URL(n, pasta), "utf8")]),
);
writeFileSync(
  new URL("../src/lib/extensao-centi-arquivos.ts", import.meta.url),
  `// GERADO por scripts/gerar-extensao.mjs a partir de extensao-centi/ — não edite à mão (o teste confere).\n// biome-ignore-all lint/suspicious/noTemplateCurlyInString: é o código-fonte da extensão, em texto.\nexport const ARQUIVOS_EXTENSAO: Record<string, string> = ${JSON.stringify(arquivos, null, 2)};\n`,
);
