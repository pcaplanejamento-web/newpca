import { parseNumberBR } from "./normalize.ts";
import {
  type Assinatura,
  coletarSecoes,
  type DfdItemParseado,
  type DfdParseado,
  ehRuido,
  extrairAssinaturas,
  extrairCabecalho,
  extrairRefsDfd,
  norm,
  TITULO_SECAO_ITENS,
} from "./parse-dfd-comum.ts";

/**
 * Núcleo PURO do parser de DFD a partir do PDF. Recebe os TRECHOS de texto com
 * posição (`{page,x,y,str}`) extraídos pelo pdf.js (ver `parse-dfd-pdf.ts`) e
 * reconstrói a estrutura. O cabeçalho e as seções reaproveitam `parse-dfd-comum`;
 * a TABELA é remontada por posição de coluna, tratando os defeitos do PDF:
 * - rótulo e valor em trechos separados → usa o texto da LINHA (trechos juntos);
 * - o número do item fica na linha do MEIO da célula → cada trecho é atribuído ao
 *   item de número mais próximo em `y` (corrige ordem do código e vazamento de descrição);
 * - código quebrado em 2 linhas (ex.: "524193726" + "3") → rejuntado por `y`.
 * Sem pdf.js/D1 aqui → testável no Node com trechos sintéticos.
 */

export type PdfItem = { page: number; x: number; y: number; str: string };
export type PdfLine = { page: number; y: number; items: PdfItem[] };

const HDR: Record<string, keyof ColMap> = {
  ITEM: "item",
  CODIGO: "codigo",
  DESCRICAO: "descricao",
  UNIDADE: "unidade",
  QUANTIDADE: "quantidade",
  QTD: "quantidade",
  "VALOR UNITARIO": "valorUnitario",
  UNITARIO: "valorUnitario",
  "VALOR TOTAL": "valorTotal",
};
type ColMap = Partial<Record<keyof DfdItemParseado, number>>;

/** Normaliza os trechos (colapsa espaços) e descarta os vazios. */
export function normalizar(bruto: PdfItem[]): PdfItem[] {
  return bruto
    .map((i) => ({ ...i, str: String(i.str ?? "").replace(/\s+/g, " ").trim() }))
    .filter((i) => i.str);
}

/** Agrupa os trechos em linhas (mesma página + `y` dentro de 2pt), topo→base. */
export function agruparLinhas(items: PdfItem[]): PdfLine[] {
  const ord = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const linhas: PdfLine[] = [];
  let cur: PdfLine | null = null;
  for (const it of ord) {
    if (cur && cur.page === it.page && Math.abs(cur.y - it.y) <= 2) cur.items.push(it);
    else {
      cur = { page: it.page, y: it.y, items: [it] };
      linhas.push(cur);
    }
  }
  return linhas;
}

/**
 * Texto por linha (normalizado + agrupado por `y`) — mesma reconstrução usada no
 * parser. Reaproveitado pelo parser de PROTOCOLO para detectar o "Número DFD" de
 * cada página e fatiar o bundle em DFDs.
 */
export function linhasDeTexto(bruto: PdfItem[]): string[] {
  return agruparLinhas(normalizar(bruto)).map((l) => l.items.map((i) => i.str).join(" "));
}

// URL de validação do Dropsigner (Lacuna Software) — contém o CÓDIGO do documento.
const RE_DROPSIGNER_URL = /https?:\/\/(?:www\.)?dropsigner\.com\/validate\/([A-Za-z0-9-]+)/gi;
// Bloco de assinatura Dropsigner no TEXTO RENDERIZADO, em QUALQUER idioma da aparência da anotação:
//  - PT: "Assinado digitalmente por: NOME  CPF: <mascarado>  Data: dd/mm/aaaa hh:mm:ss -03:00"
//  - EN: "Digitally signed by: NAME  CPF: <mascarado>  Date: M/D/AAAA h:mm:ss PM -03:00"
// O dois-pontos após "por"/"by" distingue do Formato B ("Assinado digitalmente por NOME, portador…").
// Grupos: 1 nome, 2 CPF, 3 data (crua — normalizada por `normalizarDataDropsigner`).
const RE_DROPSIGNER_BLOCO =
  /(?:Assinado\s+digitalmente\s+por|Digitally\s+signed\s+by)\s*:\s*(.+?)\s+CPF\s*:\s*([\d.*-]+)\s+(?:Data|Date)\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?(?:\s*[-+]\d{2}:\d{2})?)/gi;

/**
 * Normaliza a data CRUA do bloco Dropsigner para `DD/MM/AAAA HH:MM:SS [-03:00]`. O formato EN vem
 * em `M/D/AAAA` com `AM/PM` (locale do assinante) → converte para dd/mm/aaaa em 24h; o PT já vem
 * nesse formato (sem troca). Assim a exibição e o `dataAssinaturaISO` (conferência de temporário)
 * ficam consistentes entre idiomas.
 */
function normalizarDataDropsigner(data: string, ingles: boolean): string {
  const m = data.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?\s*([-+]\d{2}:\d{2})?/i,
  );
  if (!m) return data;
  let dia = Number(m[1]);
  let mes = Number(m[2]);
  if (ingles) [dia, mes] = [mes, dia]; // EN = M/D → troca para D/M
  const ano = m[3];
  let hora = m[4] != null ? Number(m[4]) : null;
  const min = m[5] ?? null;
  const seg = m[6] ?? "00";
  const ampm = (m[7] ?? "").toUpperCase();
  const tz = m[8] ?? "";
  if (hora != null && ampm) {
    if (ampm === "PM" && hora < 12) hora += 12;
    else if (ampm === "AM" && hora === 12) hora = 0;
  }
  let out = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
  if (hora != null && min != null) out += ` ${String(hora).padStart(2, "0")}:${min}:${seg}`;
  if (tz) out += ` ${tz}`;
  return out;
}

/**
 * Formato C — assinatura **Dropsigner** (Lacuna Software), a partir do TEXTO RENDERIZADO **por
 * página** (`getOperatorList`, ver `pageRenderText`). É preciso o texto RENDERIZADO — e não o
 * `getTextContent` — porque o bloco visível costuma ser a **aparência de uma ANOTAÇÃO de assinatura**
 * (widget `Sig`), que o `getTextContent` NÃO extrai. Cada página traz, na marca d'água, o CÓDIGO do
 * documento (`dropsigner.com/validate/<código>`); o bloco visível é pareado com o código DA PRÓPRIA
 * página.
 * **Ponto 2 — só a assinatura DIRETAMENTE no DFD:** mantém apenas o documento PRIMÁRIO (o 1º código,
 * que aparece já na 1ª página do DFD). Um ANEXO ao DFD (decreto etc.) é OUTRO documento Dropsigner,
 * com OUTRO código → suas assinaturas são DESCARTADAS. Recebe as páginas em ordem (`string[]`); um
 * único texto também é aceito (tratado como 1 página). Puro/testável.
 */
export function assinaturasDropsignerDeTexto(textos: string | string[]): Assinatura[] {
  const paginas = Array.isArray(textos) ? textos : [textos];
  const codigoUrl = new Map<string, string>(); // código → url, na ORDEM de aparição (1º = primário)
  const blocos: { nome: string; eCpf: string; data: string; codigo: string }[] = [];
  for (const texto of paginas) {
    // Código(s) da marca d'água DESTA página (o documento primário repete o mesmo em toda página).
    RE_DROPSIGNER_URL.lastIndex = 0;
    let codPagina: string | null = null;
    let u: RegExpExecArray | null = RE_DROPSIGNER_URL.exec(texto);
    while (u !== null) {
      if (!codigoUrl.has(u[1])) codigoUrl.set(u[1], u[0]);
      if (codPagina == null) codPagina = u[1];
      u = RE_DROPSIGNER_URL.exec(texto);
    }
    if (codPagina == null) continue; // página sem marca d'água → sem Dropsigner
    // Blocos VISÍVEIS desta página → atribuídos ao código DESTA página (nunca ao de outra).
    RE_DROPSIGNER_BLOCO.lastIndex = 0;
    let m: RegExpExecArray | null = RE_DROPSIGNER_BLOCO.exec(texto);
    while (m !== null) {
      const ingles = /Digitally\s+signed\s+by/i.test(m[0]) || /\b[AP]M\b/i.test(m[3]);
      blocos.push({ nome: m[1].trim(), eCpf: m[2].trim(), data: normalizarDataDropsigner(m[3].trim(), ingles), codigo: codPagina });
      m = RE_DROPSIGNER_BLOCO.exec(texto);
    }
  }
  if (codigoUrl.size === 0) return [];
  // Documento PRIMÁRIO = o 1º código (1ª página do DFD). Anexos (outros códigos) são descartados.
  const primario = [...codigoUrl.keys()][0];
  const url = codigoUrl.get(primario) as string;

  const out: Assinatura[] = [];
  const vistos = new Set<string>();
  for (const b of blocos) {
    if (b.codigo !== primario) continue; // bloco de anexo → não é assinatura do DFD
    const chave = `${norm(b.nome)}|${b.data}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ nome: b.nome, eCpf: b.eCpf, usuario: "", local: "", data: b.data, ip: "", codigo: primario, url, fonte: "dropsigner" });
  }
  // Sem bloco visível no documento primário → carimbo (reconhecido pela marca d'água do próprio DFD).
  if (out.length === 0) out.push({ nome: "", eCpf: "", usuario: "", local: "", data: "", ip: "", codigo: primario, url, fonte: "dropsigner" });
  return out;
}

/**
 * Índice do valor mais próximo de `target` num array **ordenado por `y` DESC**
 * (`ys`), via busca binária — O(log n). Empate = menor índice (maior `y`), igual
 * à varredura linear original. Destrava DFDs com milhares de itens (antes O(n²)).
 */
export function nearestByY(ys: number[], target: number): number {
  let lo = 0;
  let hi = ys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ys[mid] <= target) hi = mid;
    else lo = mid + 1;
  }
  // O mais próximo num array monotônico é um dos vizinhos do ponto de inserção.
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (const i of [lo - 1, lo]) {
    if (i < 0 || i >= ys.length) continue;
    const d = Math.abs(ys[i] - target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Item de um `y` dadas as FRONTEIRAS (`cuts`) de célula de uma página, em ordem `y`
 * DESC — devolve quantas fronteiras estão ACIMA de `y` (estritamente). Complementa
 * `nearestByY`: o número/código/valores ficam na âncora (1 faixa) e `nearestByY` os
 * casa certo, mas a DESCRIÇÃO ocupa VÁRIAS linhas e, com a âncora no MEIO da célula,
 * as últimas linhas de um item ficavam mais perto da âncora do PRÓXIMO e vazavam para
 * ele (descrição truncada). A descrição é casada pela BORDA real da célula. O(log n).
 */
export function itemPorCuts(cuts: number[], y: number): number {
  let lo = 0;
  let hi = cuts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cuts[mid] > y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function parseDfdFromPdfItems(
  bruto: PdfItem[],
  nomeArquivo: string,
  // Texto RENDERIZADO POR PÁGINA (Dropsigner) — `string[]` (uma entrada por página, na ordem)
  // permite parear o bloco ao código da própria página e descartar anexos; um único texto
  // também é aceito (1 página). Vazio ⇒ sem Dropsigner.
  textosRender: string | string[] = [],
): DfdParseado {
  const items = normalizar(bruto);
  const linhas = agruparLinhas(items);
  const lineTexts = linhas.map((l) => l.items.map((i) => i.str).join(" "));

  const cab = extrairCabecalho(lineTexts);

  // ---- Tabela (Seção 4) por posição de coluna ----
  const hi = linhas.findIndex(
    (l) =>
      l.items.some((i) => norm(i.str) === "ITEM") &&
      l.items.some((i) => /QUANTIDADE/.test(norm(i.str))),
  );

  const itens: DfdItemParseado[] = [];
  let valorTotalGrand: number | null = null;
  let apoioSecao4 = ""; // texto de apoio abaixo da tabela (Seção 4)
  // Índice da linha onde a tabela ENCERRA (na próxima seção "5 - …" à margem
  // esquerda) — usado para dar ao `coletarSecoes` só as linhas FORA da tabela.
  let tableEndIdx = linhas.length;

  if (hi >= 0) {
    // Âncoras (x) de cada coluna — "VALOR UNITÁRIO" pode vir só como "UNITÁRIO"
    // numa 2ª linha do cabeçalho.
    const anchors: ColMap = {};
    for (const off of [0, 1, -1]) {
      const l = linhas[hi + off];
      if (!l) continue;
      for (const it of l.items) {
        const k = HDR[norm(it.str)];
        if (k && anchors[k] == null) anchors[k] = it.x;
      }
    }
    // Colunas presentes com sua âncora `x` (na ordem esperada).
    const cols = (
      ["item", "codigo", "descricao", "unidade", "quantidade", "valorUnitario", "valorTotal"] as const
    )
      .map((key) => ({ key, x: anchors[key] }))
      .filter((c): c is { key: keyof DfdItemParseado; x: number } => c.x != null);
    const [c0, c1] = cols;
    const itemBound = c0 && c1 ? (c0.x + c1.x) / 2 : 70;
    // INÍCIO REAL do texto da descrição: o conteúdo é alinhado à esquerda, bem à
    // esquerda do cabeçalho "DESCRIÇÃO" — então usamos o menor `x` de um fragmento
    // de TEXTO (com letra) na zona código→unidade. Um dígito à DIREITA disso é
    // conteúdo da descrição (ex.: nº de modelo "40300050630"), NÃO código.
    const codAnchor = anchors.codigo ?? 0;
    const uniAnchor = anchors.unidade ?? Number.POSITIVE_INFINITY;
    let descStartX = anchors.descricao ?? Number.POSITIVE_INFINITY;
    let minTexto = Number.POSITIVE_INFINITY;
    for (let k = hi + 1; k < linhas.length; k++) {
      for (const it of linhas[k].items) {
        if (it.x > codAnchor + 5 && it.x < uniAnchor && /[A-Za-zÀ-ÿ]/.test(it.str) && it.x < minTexto) {
          minTexto = it.x;
        }
      }
    }
    if (minTexto < Number.POSITIVE_INFINITY) descStartX = Math.min(descStartX, minTexto);

    const colOf = (x: number, str: string): keyof DfdItemParseado => {
      let idx = 0;
      for (let i = 0; i < cols.length - 1; i++) {
        const a = cols[i];
        const b = cols[i + 1];
        if (a && b && x >= (a.x + b.x) / 2) idx = i + 1;
      }
      let c: keyof DfdItemParseado = cols[idx]?.key ?? "descricao";
      // No vão código×descrição, dígitos puros = código; texto = descrição. Mas um
      // dígito na área da descrição (x ≥ início do texto) fica descrição — senão um
      // número no meio do texto vira "código" e o polui.
      if (c === "codigo" || c === "descricao") {
        c = /^\d+$/.test(str.trim()) && x < descStartX ? "codigo" : "descricao";
      }
      return c;
    };

    const ehNumItem = (it: PdfItem) => it.x < itemBound && /^\d+$/.test(it.str);
    // Cabeçalho de coluna repetido a cada página (não encerra a tabela).
    const ehCabecalhoColuna = (j: string) =>
      (/\bITEM\b/.test(j) && /QUANTIDADE/.test(j)) ||
      j === "VALOR" ||
      j === "UNITARIO" ||
      j === "VALOR UNITARIO" ||
      j === "VALOR TOTAL";
    // Próxima seção numerada ("5 - ...") encerra a Seção 4.
    const ehSecaoHeading = (j: string) => /^\d{1,2}\s*[-–—]\s/.test(j);

    const bodyFrags: PdfItem[] = [];
    const itemNums: { page: number; y: number; n: number }[] = [];
    const apoioLinhas: string[] = [];
    let fimTabela = false; // após a última linha de item vem o texto de apoio
    // Páginas cujo CABEÇALHO DE COLUNA já apareceu — acima dele (por página) fica o
    // CABEÇALHO DO DOCUMENTO repetido (ESTADO DE GOIÁS / <órgão> / DOCUMENTO… / Número
    // DFD / Tipo DFD), que deve ser pulado para não grudar na descrição de um item.
    const viuColuna = new Set<number>([linhas[hi].page]);

    // Varre TODAS as páginas do DFD (a tabela pode ocupar dezenas de páginas). O
    // cabeçalho do documento/coluna e o rodapé se REPETEM por página e são pulados
    // (nunca encerram a tabela); `y` reinicia por página → tudo é casado por página.
    for (let k = hi + 1; k < linhas.length; k++) {
      const l = linhas[k];
      const joined = norm(l.items.map((i) => i.str).join(" "));
      const minx = Math.min(...l.items.map((i) => i.x));
      const temNum = l.items.some(ehNumItem);

      // Só uma seção "N - …" À MARGEM ESQUERDA encerra a tabela; um "2-52" no MEIO de
      // uma descrição (indentado) NÃO é seção.
      if (minx < itemBound && ehSecaoHeading(joined)) {
        tableEndIdx = k;
        break;
      }
      if (ehCabecalhoColuna(joined)) {
        viuColuna.add(l.page);
        continue; // cabeçalho de coluna repetido por página
      }
      // Antes do cabeçalho de coluna DESTA página = cabeçalho do documento repetido → pula.
      if (!viuColuna.has(l.page)) continue;
      if (ehRuido(joined)) continue; // rodapé (Centi/Emitido/Página) e afins
      // Linha do TOTAL GERAL ("VALOR TOTAL" + número) — captura, mas NÃO encerra.
      if (/VALOR TOTAL/.test(joined) && !temNum) {
        const v = l.items.find((i) => colOf(i.x, i.str) === "valorTotal" && /\d/.test(i.str));
        if (v) valorTotalGrand = parseNumberBR(v.str);
        continue;
      }
      // Texto de apoio: prosa à margem esquerda (sem número de item) DEPOIS da tabela.
      if (fimTabela || (minx < itemBound && !temNum)) {
        fimTabela = true;
        apoioLinhas.push(l.items.map((i) => i.str).join(" "));
        continue;
      }
      // Linha de item.
      for (const it of l.items) {
        if (ehNumItem(it)) itemNums.push({ page: it.page, y: it.y, n: Number(it.str) });
        else bodyFrags.push(it);
      }
    }
    // Ordena por (página, y desc) — preserva a ordem real dos itens entre páginas.
    itemNums.sort((a, b) => a.page - b.page || b.y - a.y);
    apoioSecao4 = apoioLinhas.join(" ").replace(/\s+/g, " ").trim();

    type Bucket = { page: number; item: number; y: number; codigo: PdfItem[]; descricao: PdfItem[] } & {
      unidade: string | null;
      quantidade: number | null;
      valorUnitario: number | null;
      valorTotal: number | null;
    };
    const buckets: Bucket[] = itemNums.map((n) => ({
      page: n.page,
      item: n.n,
      y: n.y,
      codigo: [],
      descricao: [],
      unidade: null,
      quantidade: null,
      valorUnitario: null,
      valorTotal: null,
    }));

    // Índice de buckets POR PÁGINA (ys já em DESC dentro da página) → casa cada
    // fragmento ao item da MESMA página (o `y` reinicia entre páginas). Também guarda
    // o topo (maior `y` = 1º item) e o 1º índice de cada página para tratar
    // DESCRIÇÕES QUE ATRAVESSAM a página (continuam no topo da página seguinte).
    const idxPorPagina = new Map<number, { ys: number[]; bi: number[]; topo: number; first: number }>();
    buckets.forEach((b, i) => {
      const g = idxPorPagina.get(b.page);
      if (!g) idxPorPagina.set(b.page, { ys: [b.y], bi: [i], topo: b.y, first: i });
      else {
        g.ys.push(b.y);
        g.bi.push(i);
        if (b.y > g.topo) g.topo = b.y;
      }
    });
    // ── Espaçamento típico (entrelinha) e limiar de BORDA de célula, por DFD ──
    // A âncora (nº/código/valores) fica no MEIO da célula → a descrição tem linhas ACIMA e
    // ABAIXO do número. A borda REAL entre um item e o seguinte é um "respiro" (padding da
    // célula) MAIOR que a entrelinha. Nos PDFs reais a entrelinha é ~8–9 e as bordas ~11+
    // (separação limpa, nunca ocorre vão 10). Calibramos um limiar ADAPTATIVO pela MEDIANA
    // dos vãos de descrição (dominada pela entrelinha) para funcionar em qualquer fonte.
    const descYsPorPagina = new Map<number, number[]>();
    for (const f of bodyFrags) {
      if (colOf(f.x, f.str) !== "descricao") continue;
      const arr = descYsPorPagina.get(f.page);
      if (arr) arr.push(f.y);
      else descYsPorPagina.set(f.page, [f.y]);
    }
    const vaosTodos: number[] = [];
    for (const ys of descYsPorPagina.values()) {
      const s = [...ys].sort((x, y) => y - x); // DESC
      for (let i = 0; i < s.length - 1; i++) {
        const vao = s[i] - s[i + 1];
        if (vao > 0 && vao <= 40) vaosTodos.push(vao); // ignora saltos de seção/página
      }
    }
    const mediana = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const s = [...arr].sort((x, y) => x - y);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const espacoTipico = mediana(vaosTodos);
    // Vão > LIM ⇒ BORDA de célula; ≤ LIM ⇒ entrelinha (mesma descrição).
    const LIM = espacoTipico > 0 ? Math.max(espacoTipico * 1.3, espacoTipico + 2) : 12;

    // ── Fronteiras (cuts) entre itens da MESMA página: no MAIOR vão que excede LIM na faixa
    // entre as âncoras; sem vão-borda, ponto médio das âncoras (fallback = nearestByY). ──
    const cutsPorPagina = new Map<number, number[]>();
    for (const [page, g] of idxPorPagina) {
      const a = g.ys; // âncoras em `y` DESC
      const cuts: number[] = [];
      const dys = (descYsPorPagina.get(page) ?? []).slice().sort((x, y) => y - x); // DESC
      let p = 0;
      for (let j = 0; j < a.length - 1; j++) {
        const hiA = a[j];
        const loA = a[j + 1];
        while (p < dys.length && dys[p] >= hiA) p++;
        const band: number[] = [];
        while (p < dys.length && dys[p] > loA) band.push(dys[p++]);
        let cut = (hiA + loA) / 2; // ponto médio (= nearestByY)
        let maxVao = -1;
        let idxMax = -1;
        for (let i = 0; i < band.length - 1; i++) {
          const vao = band[i] - band[i + 1];
          if (vao > maxVao) {
            maxVao = vao;
            idxMax = i;
          }
        }
        if (idxMax >= 0 && maxVao > LIM) cut = (band[idxMax] + band[idxMax + 1]) / 2;
        cuts.push(cut);
      }
      cutsPorPagina.set(page, cuts);
    }

    // ── Fronteira do TOPO de cada página de continuação (`g.first>0`): separa a CAUDA do
    // último item da página anterior (continuação, em cima) da CABEÇA do 1º item desta
    // página (número no meio → cabeça ACIMA dele). Andando do 1º número para cima, a cabeça
    // é contígua (vão ≤ LIM); o 1º vão > LIM é a borda (`topCut`). Sem borda ⇒ o item
    // anterior TERMINOU na página anterior → nada sobe (tudo é cabeça do 1º item). Conserta
    // o roubo da cabeça do 1º item de toda página de continuação (bug cross-page). ──
    const topCutPorPagina = new Map<number, number>();
    for (const [page, g] of idxPorPagina) {
      if (g.first === 0) continue;
      const acima = (descYsPorPagina.get(page) ?? []).filter((y) => y > g.topo).sort((x, y) => x - y); // ASC
      let prev = g.topo;
      let topCut = Number.POSITIVE_INFINITY;
      for (const y of acima) {
        if (y - prev <= LIM) prev = y;
        else {
          topCut = y;
          break;
        }
      }
      topCutPorPagina.set(page, topCut);
    }

    // Último item (bucket) de cada página COM itens → alvo p/ uma página SÓ de continuação
    // (descrição que ocupa a página inteira, sem número): continua o último item anterior.
    const ultimoBucketDaPagina = new Map<number, number>();
    buckets.forEach((b, i) => {
      ultimoBucketDaPagina.set(b.page, i); // ordem (page, y desc) ⇒ fica o último
    });
    const paginasComItem = [...ultimoBucketDaPagina.keys()].sort((x, y) => x - y);
    const itemAntesDaPagina = (page: number): number | undefined => {
      let alvo: number | undefined;
      for (const pg of paginasComItem) {
        if (pg < page) alvo = ultimoBucketDaPagina.get(pg);
        else break;
      }
      return alvo;
    };

    for (const f of bodyFrags) {
      const g = idxPorPagina.get(f.page);
      const c = colOf(f.x, f.str);
      let b: Bucket | undefined;
      if (c === "descricao" && !g) {
        // Página SEM número de item = continuação integral do último item anterior
        // (descrição que ocupa a página inteira).
        const prev = itemAntesDaPagina(f.page);
        if (prev != null) b = buckets[prev];
      } else if (c === "descricao" && g && f.y > g.topo && g.first > 0) {
        // ACIMA do 1º número da página: a CAUDA do item anterior (y ≥ topCut) OU a CABEÇA
        // do 1º item desta página (número no meio) — separadas pela borda de célula.
        const tc = topCutPorPagina.get(f.page) ?? Number.POSITIVE_INFINITY;
        b = f.y >= tc ? buckets[g.first - 1] : buckets[g.first];
      } else if (c === "descricao" && g && g.bi.length > 0) {
        // Descrição → pela BORDA da célula (não pela âncora do meio): não trunca
        // descrições altas nem vaza para o próximo item.
        b = buckets[g.bi[itemPorCuts(cutsPorPagina.get(f.page) ?? [], f.y)]];
      } else if (g && g.ys.length > 0) {
        // Número/código/unidade/valores ficam na âncora → o mais próximo em `y`.
        b = buckets[g.bi[nearestByY(g.ys, f.y)]];
      }
      if (!b) continue;
      if (c === "codigo") b.codigo.push(f);
      else if (c === "descricao") b.descricao.push(f);
      else if (c === "unidade") {
        if (b.unidade == null) b.unidade = f.str;
      } else if (c === "quantidade" || c === "valorUnitario" || c === "valorTotal") {
        if (b[c] == null) b[c] = parseNumberBR(f.str);
      }
    }

    const porPos = (a: PdfItem, b: PdfItem) => a.page - b.page || b.y - a.y || a.x - b.x;
    for (const b of buckets) {
      itens.push({
        item: b.item,
        codigo: b.codigo.sort(porPos).map((f) => f.str).join("") || null,
        descricao:
          b.descricao
            .sort(porPos)
            .map((f) => f.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim() || null,
        unidade: b.unidade,
        quantidade: b.quantidade,
        valorUnitario: b.valorUnitario,
        valorTotal: b.valorTotal,
      });
    }
  }

  const somaItens = itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
  const valorTotal = valorTotalGrand ?? (somaItens > 0 ? Math.round(somaItens * 100) / 100 : null);

  if (!cab.numero) {
    throw new Error(
      'Não encontrei o "Número DFD" no PDF. Confira se é um DFD emitido (PDF com texto).',
    );
  }
  if (itens.length === 0) {
    throw new Error(
      "Não encontrei itens na Seção 4 do PDF (ITEM / CÓDIGO / DESCRIÇÃO / UNIDADE / QUANTIDADE).",
    );
  }
  // Seções: coleta APENAS as linhas FORA da tabela de itens ([hi, tableEndIdx)) —
  // senão o texto de um item (ex.: "…IEC 60601-2-52, SISTEMA DE GESTÃO…") viraria uma
  // "seção 2 - 52…". As seções 1/2/3 ficam antes do cabeçalho da tabela; 5/6/7/8/9
  // depois do fim da tabela. O apoio da Seção 4 (abaixo da tabela) é acrescentado.
  const linhasFora = hi >= 0 ? [...lineTexts.slice(0, hi), ...lineTexts.slice(tableEndIdx)] : lineTexts;
  const secoes = coletarSecoes(linhasFora);
  if (apoioSecao4) secoes.push({ numero: 4, titulo: TITULO_SECAO_ITENS, texto: apoioSecao4 });
  secoes.sort((a, b) => a.numero - b.numero);

  return {
    ...cab,
    ...extrairRefsDfd(secoes, cab.objeto),
    numero: cab.numero,
    valorTotal,
    nomeArquivo,
    secoes,
    itens,
    // Formatos A/B (páginas de assinatura, texto normal) + Formato C Dropsigner (do texto
    // RENDERIZADO por página, que inclui a aparência das anotações — vazio ⇒ sem Dropsigner).
    assinaturas: [...extrairAssinaturas(lineTexts), ...assinaturasDropsignerDeTexto(textosRender)],
  };
}
