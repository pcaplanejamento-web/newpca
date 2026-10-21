// Copia do pdf.js para /public/pdfjs (servidos pelo próprio site): as fontes padrão e os CMaps (sem eles, PDFs com fontes
// NÃO embutidas aparecem sem letras), os perfis de cor e SÓ os decodificadores .wasm (JBIG2, JPEG 2000, ICC — sem eles o
// SCAN em camadas sai quase em branco). Rode após atualizar o pdfjs-dist.
import { cpSync, rmSync } from "node:fs";
for (const d of ["standard_fonts", "cmaps", "iccs"]) {
  rmSync(`public/pdfjs/${d}`, { recursive: true, force: true });
  cpSync(`node_modules/pdfjs-dist/${d}`, `public/pdfjs/${d}`, { recursive: true });
}
rmSync("public/pdfjs/wasm", { recursive: true, force: true });
for (const f of ["jbig2.wasm", "openjpeg.wasm", "qcms_bg.wasm"]) cpSync(`node_modules/pdfjs-dist/wasm/${f}`, `public/pdfjs/wasm/${f}`);
