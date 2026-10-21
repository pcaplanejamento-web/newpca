// Copia as fontes padrão e os CMaps do pdf.js para /public/pdfjs (servidos pelo próprio site —
// sem eles, PDFs com fontes NÃO embutidas aparecem sem letras). Rode após atualizar o pdfjs-dist.
import { cpSync, rmSync } from "node:fs";
for (const d of ["standard_fonts", "cmaps"]) {
  rmSync(`public/pdfjs/${d}`, { recursive: true, force: true });
  cpSync(`node_modules/pdfjs-dist/${d}`, `public/pdfjs/${d}`, { recursive: true });
}
