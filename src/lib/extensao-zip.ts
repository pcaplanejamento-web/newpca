// O .zip da extensão da Automação (núcleo PURO, testado): os arquivos de extensao-centi/ + a LOGO do sistema (o favicon
// da Identidade, PNG) como ícone da extensão — montado na hora pela rota, sempre na versão publicada.
import { ZipArmazenar } from "./zip-armazenar.ts";

/** O PNG de um data-URL (o favicon da Identidade); outro formato = sem ícone (o Chrome só aceita PNG no manifesto). */
export function pngDoDataUrl(url: string | null | undefined): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec((url ?? "").trim());
  if (!m) return null;
  try {
    const b = Uint8Array.from(atob(m[1].replace(/\s/g, "")), (c) => c.charCodeAt(0));
    return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? b : null;
  } catch {
    return null;
  }
}

export function zipDaExtensao(arquivos: Record<string, string>, icone: Uint8Array | null, agora = new Date()): Uint8Array[] {
  const z = new ZipArmazenar(agora);
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  for (const [nome, texto] of Object.entries(arquivos)) {
    let conteudo = texto;
    if (nome === "manifest.json" && icone) {
      const m = JSON.parse(texto) as Record<string, unknown>;
      const icones = { 16: "icone.png", 32: "icone.png", 48: "icone.png", 128: "icone.png" };
      m.icons = icones;
      // O popup (andamento + Interromper) do manifesto fica; só o ícone entra.
      const acao = m.action && typeof m.action === "object" ? (m.action as Record<string, unknown>) : {};
      m.action = { ...acao, default_icon: icones, default_title: String(acao.default_title ?? m.name ?? "") };
      conteudo = `${JSON.stringify(m, null, 2)}\n`;
    }
    // O ATUALIZADOR (atualizador/): no Windows, CRLF (o cmd lê o .bat assim) e o .ps1 com BOM (o PowerShell 5.1 lê UTF-8
    // só com ele); no Mac, o instalador e o host executáveis.
    if (/\.(bat|ps1)$/.test(nome)) conteudo = conteudo.replace(/\r?\n/g, "\r\n");
    const bytes = enc.encode(conteudo);
    const comBom = nome.endsWith(".ps1") ? new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]) : bytes;
    partes.push(...z.adicionar(nome, comBom, { executavel: /\.(command|jxa)$/.test(nome) }));
  }
  if (icone) partes.push(...z.adicionar("icone.png", icone));
  partes.push(...z.fechar());
  return partes;
}
