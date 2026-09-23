import { type Assinatura, norm } from "./parse-dfd-comum.ts";
import { assinaturasAdobeDeTexto, assinaturasFoxitDeTexto } from "./parse-dfd-pdf-core.ts";

/**
 * Núcleo do OCR de assinaturas ACHATADAS (sem camada de texto e sem `/Sig`) — Dropsigner, Foxit/ICP-Brasil,
 * Adobe ou qualquer carimbo equivalente virado imagem/vetor. **Sem DOM e sem tesseract**: a rasterização e o
 * OCR entram por um `MotorOcr` INJETADO (navegador: pdf.js + tesseract.js em `ocr-assinatura.ts`; harness de
 * validação: pdf.js + canvas do Node) — a MESMA orquestração roda em produção e contra PDFs reais.
 *
 * Estratégia (validada no `pd101820` real — 13 DFDs com carimbo achatado):
 * 1. **Qualquer página** do DFD, em ordem de PRIORIDADE (`prioridadePaginasOcr`): imagem fora do cabeçalho
 *    (logo do Dropsigner, rubrica) → rótulo de assinatura na camada de texto → última → demais.
 * 2. **Atalho rápido**: as imagens apontam o carimbo → OCR só dessa REGIÃO; página inteira = fallback
 *    (carimbo puramente vetorial, ex.: Foxit).
 * 3. **Localiza** cada bloco pelas palavras-âncora (`localizarBlocosAssinatura`), recorta ampliado e
 *    **binarizado** (some a régua cinza da tabela e o nome grande claro sobreposto) e lê de 2 modos.
 * 4. **Parse por LINHAS** multi-formato (`assinaturasDeOcr`): Dropsigner, Foxit e Adobe, todas `ocr:true`;
 *    o nome é **corrigido pela camada de texto** (o signatário costuma estar impresso no próprio DFD) e o
 *    código Dropsigner vem da marca d'água vertical (aceito só no formato exato 4×5).
 */

export type Caixa = { x0: number; y0: number; x1: number; y1: number };
export type PalavraOcr = { text: string; bbox: Caixa };
export type LeituraOcr = { texto: string; palavras: PalavraOcr[] };
export type OpcoesRecorte = { girar?: boolean; binarizar?: number };

/** Motor injetado (rasteriza + recorta + OCR). `C` é o canvas da plataforma. */
export type MotorOcr<C> = {
  /** Rasteriza a página inteira na escala dada. */
  render(pagina: number, escala: number): Promise<C>;
  dims(c: C): { w: number; h: number };
  /** Recorta uma região (px) ampliando `up` vezes; `girar` = 90° horário; `binarizar` = limiar 0..255
   * (usar `binarizarRgba`). */
  recortar(c: C, caixa: Caixa, up: number, opts?: OpcoesRecorte): C;
  /** OCR: `pagina` = layout automático + palavras (bbox); `bloco` = bloco único; `esparso` = texto esparso. */
  ler(c: C, modo: "pagina" | "bloco" | "esparso"): Promise<LeituraOcr>;
  /** Caixas das IMAGENS da página, normalizadas 0..1 (origem no topo-esquerdo). */
  imagens(pagina: number): Promise<Caixa[]>;
  /** Texto da CAMADA de texto (rótulos de seção + nome impresso do signatário). */
  textoCamada(pagina: number): Promise<string>;
};

/** Binariza RGBA in-place: cinza < `limiar` → preto, senão branco. Remove réguas cinza-claro da tabela e
 * sobreposições claras (nome grande do Foxit), mantendo o texto preto do carimbo. Puro. */
export function binarizarRgba(d: Uint8ClampedArray, limiar: number): void {
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3 < limiar ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
}

// ------------------------------------------------------------------ parsers (texto do OCR → assinaturas)

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "van", "von"]);

/** Limpa o NOME lido por OCR: descarta lixo dos ícones/traços do carimbo ("fo", "wu", "&", "=", "2"…) —
 * mantém palavras com letras, apara nas pontas o que não é palavra de nome (Maiúscula), preservando as
 * partículas (de/da/dos…) só ENTRE nomes. Puro. */
export function limparNomeOcr(s: string): string {
  const toks = s
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""))
    .filter((t) => {
      const letras = (t.match(/\p{L}/gu) ?? []).length;
      return letras >= 2 && letras / t.length >= 0.8;
    });
  const ehNome = (t: string) => /^\p{Lu}/u.test(t);
  let i = 0;
  let j = toks.length;
  while (i < j && !ehNome(toks[i])) i++;
  while (j > i && !ehNome(toks[j - 1])) j--;
  const meio = colapsarRepeticao(toks.slice(i, j).filter((t) => ehNome(t) || PARTICULAS.has(t.toLowerCase())));
  return meio.length > 10 ? "" : meio.join(" ");
}

/** "EDILENE ALVES DA CRUZ EDILENE ALVES DA CRUZ" → "EDILENE ALVES DA CRUZ": a linha do OCR junta o nome
 * IMPRESSO no DFD (ao lado) com o do carimbo — a sequência repetida é o MESMO nome. Puro. */
function colapsarRepeticao(toks: string[]): string[] {
  const n = toks.length;
  if (n >= 4 && n % 2 === 0) {
    const a = toks.slice(0, n / 2);
    const b = toks.slice(n / 2);
    if (norm(a.join(" ")) === norm(b.join(" "))) return a;
  }
  return toks;
}

/** CPF lido por OCR (trecho "CPF: *** 413.331-**"): o Dropsigner mostra o CPF MASCARADO (6 dígitos do
 * meio); tolera "*" lido como "1" e espaços. 11 dígitos = CPF inteiro → mascara. Senão "" (não inventa). */
export function cpfDeOcr(s: string): string {
  const d = (s.split("-")[0] ?? "").replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length >= 6) {
    const m = d.slice(-6);
    return `***.${m.slice(0, 3)}.${m.slice(3)}-**`;
  }
  return "";
}

/** Código de validação do Dropsigner na marca d'água ("…dropsigner.com/validate/GHALU-7PJTU-4QBRB-RNSMN").
 * Só aceita o formato EXATO 4 grupos × 5 no ALFABETO do Dropsigner — sem os caracteres ambíguos `O`/`0`/
 * `I`/`1` (nenhum dos códigos reais observados os contém): um "O" lido por OCR é certamente um "Q"/"D" mal
 * lido → a leitura é descartada (nunca geramos link errado). Puro. */
export function codigoDropsignerDeOcr(texto: string): string | null {
  const re = /valida\w*\s*\/\s*((?:[A-HJ-NP-Z2-9]{5}\s*-\s*){3}[A-HJ-NP-Z2-9]{5})(?![A-Z0-9])/gi;
  const m = re.exec(texto);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : null;
}

const RE_POR = /Assinad[oa]\s+(?:\S+\s+){0,2}?por\b\s*[:;.,]?/i;
const RE_CPF = /C\s*P\s*[FE]\s*[:;.,]/i; // "CPE:" = leitura comum de "CPF:"
const RE_DATA_BR =
  /Data\s*[:;.,]?[\s\-_]*(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})(?:[\s\-_]+(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?)?(?:[\s\-_]*([-+])\s*(\d{2})\s*:?\s*(\d{2}))?/i;
const RE_NAO_NOME = /C\s*P\s*[FE]\s*[:;.,]|Data\s*[:;.,]|drop\s*si|lacuna|powered|signed|assinad|eletr[oô]nicamente|digitalmente|documento|validar/i;

function dataDe(m: RegExpMatchArray): string {
  let s = `${m[1]}/${m[2]}/${m[3]}`;
  if (m[4] && m[5]) s += ` ${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`;
  if (m[7] && m[8] && m[9]) s += ` ${m[7]}${m[8]}:${m[9]}`;
  return s;
}

const nomeDaLinha = (l: string) => (RE_NAO_NOME.test(l) ? "" : limparNomeOcr(l));
const duasPalavras = (n: string) => n.split(" ").length >= 2;

/**
 * Bloco **Dropsigner** lido por OCR, **por LINHAS** (o OCR separa as colunas em linhas; colapsar tudo faria o
 * nome engolir a coluna vizinha): "Assinado eletronicamente|digitalmente por:" ⏎ NOME ⏎ [CPF: …] ⏎ Data:
 * dd/mm/aaaa hh:mm:ss -03:00 (as linhas podem vir fora de ordem na leitura esparsa). Sem a linha "Assinado…"
 * (coberta pela rubrica), ancora no "CPF:" — o nome é a linha logo acima. Tolerante a ruído ("CPE:", "-" no
 * lugar de espaço, lixo de ícones). NÃO casa o Formato B (sem "Data:"), o Foxit (data ISO) nem o Adobe
 * ("Assinado de forma digital por": 3 palavras antes de "por"). Puro.
 */
export function dropsignerDeOcr(texto: string): { nome: string; eCpf: string; data: string }[] {
  const linhas = String(texto ?? "")
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out: { nome: string; eCpf: string; data: string }[] = [];
  const add = (nome: string, eCpf: string, data: string) => {
    if (!duasPalavras(nome) || (!data && !eCpf)) return;
    if (out.some((o) => (data && o.data === data) || norm(o.nome) === norm(nome))) return;
    out.push({ nome, eCpf, data });
  };
  const achar = (ls: string[]) => {
    let eCpf = "";
    let data = "";
    for (const l of ls) {
      const c = l.match(RE_CPF);
      if (!eCpf && c && c.index != null) eCpf = cpfDeOcr(l.slice(c.index));
      const d = l.match(RE_DATA_BR);
      if (!data && d) data = dataDe(d);
    }
    return { eCpf, data };
  };
  let temAncora = false;
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(RE_POR);
    if (!m || m.index == null) continue;
    temAncora = true;
    const resto = linhas[i].slice(m.index + m[0].length);
    const janela = [resto, ...linhas.slice(i + 1, i + 7)].filter((l) => !RE_POR.test(l) || l === resto);
    // nome: na própria linha (texto colapsado) ou na 1ª linha "de nome" da janela
    let nome = limparNomeOcr(resto.split(RE_CPF)[0].split(/Data\s*[:;.,]/i)[0]);
    if (!duasPalavras(nome)) nome = janela.slice(1).map(nomeDaLinha).find(duasPalavras) ?? "";
    const { eCpf, data } = achar(janela);
    add(nome, eCpf, data);
  }
  // Sem a linha "Assinado… por" (rubrica por cima): ancora no CPF — só num bloco com cara de Dropsigner.
  if (!temAncora && /drop\s*si|lacuna|eletr[oô]nicamente|Data\s*[:;.,]\s*\d{2}\//i.test(texto)) {
    for (let i = 0; i < linhas.length; i++) {
      if (!RE_CPF.test(linhas[i])) continue;
      const nome = [linhas[i - 1], linhas[i - 2]].map((l) => (l ? nomeDaLinha(l) : "")).find(duasPalavras) ?? "";
      const { eCpf, data } = achar(linhas.slice(i, i + 4));
      add(nome, eCpf, data);
    }
  }
  return out;
}

/** Distância de edição (Levenshtein). Puro. */
function distancia(a: string, b: string): number {
  const v = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let ant = v[0];
    v[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = v[j];
      v[j] = Math.min(v[j] + 1, v[j - 1] + 1, ant + (a[i - 1] === b[j - 1] ? 0 : 1));
      ant = tmp;
    }
  }
  return v[b.length];
}

/**
 * Corrige um NOME lido por OCR pelo texto da CAMADA de texto do DFD (o signatário quase sempre está impresso
 * na seção 9/10 ou em "Responsável pela Demanda"): procura a sequência de palavras da camada mais parecida
 * (±1 palavra) e, se a distância de edição for pequena (≤ 12%, mín. 1), devolve a grafia da camada — exata.
 * Igual (após `norm`) ou sem candidato próximo → mantém o OCR. Puro.
 */
export function corrigirNomePelaCamada(nome: string, camada: string): { nome: string; confirmado: boolean } {
  const alvo = norm(nome);
  if (!alvo || !camada) return { nome, confirmado: false };
  const palavras = camada.match(/[\p{L}]+(?:['’-][\p{L}]+)*/gu) ?? [];
  const n = alvo.split(" ").length;
  let melhor: { txt: string; d: number } | null = null;
  for (const k of [n, n - 1, n + 1]) {
    if (k < 2) continue;
    for (let i = 0; i + k <= palavras.length; i++) {
      const cand = palavras.slice(i, i + k).join(" ");
      const d = distancia(alvo, norm(cand));
      if (!melhor || d < melhor.d) melhor = { txt: cand, d };
      if (d === 0) break;
    }
  }
  if (!melhor) return { nome, confirmado: false };
  if (melhor.d === 0) return { nome, confirmado: true };
  return melhor.d <= Math.max(1, Math.floor(alvo.length * 0.12)) ? { nome: melhor.txt, confirmado: true } : { nome, confirmado: false };
}

/**
 * Código Dropsigner por **CONSENSO** entre várias leituras independentes (marca d'água em escalas/limiares
 * diferentes + texto da página): vota posição a posição e só aceita se CADA posição tiver ≥2 votos e maioria
 * estrita — o OCR confunde 5/S, Q/O…; sem consenso → `null` (sem link, nunca um link errado). Puro.
 */
export function votarCodigoDropsigner(textos: string[]): string | null {
  const cands = textos.map(codigoDropsignerDeOcr).filter((c): c is string => !!c);
  if (cands.length < 2) return null;
  let out = "";
  for (let i = 0; i < cands[0].length; i++) {
    const cont = new Map<string, number>();
    for (const c of cands) cont.set(c[i], (cont.get(c[i]) ?? 0) + 1);
    const [a, b] = [...cont.entries()].sort((x, y) => y[1] - x[1]);
    if (a[1] < 2 || (b && b[1] === a[1])) return null;
    out += a[0];
  }
  return out;
}

/** Nome mais frequente; empate → o mais curto. */
function modaCurta(vs: string[]): string {
  const cont = new Map<string, number>();
  for (const v of vs) if (v) cont.set(v, (cont.get(v) ?? 0) + 1);
  return [...cont.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? "";
}

/** Valor mais frequente (não vazio); empate → o 1º visto. */
function moda(vs: string[]): string {
  const cont = new Map<string, number>();
  for (const v of vs) if (v) cont.set(v, (cont.get(v) ?? 0) + 1);
  let melhor = "";
  let n = 0;
  for (const [v, c] of cont) if (c > n) [melhor, n] = [v, c];
  return melhor;
}

/**
 * Junta os textos lidos por OCR numa lista de `Assinatura` (todas `ocr:true`): Dropsigner, Foxit e Adobe.
 * Cada nome é corrigido pela `camada` de texto. As várias leituras da MESMA assinatura (mesma fonte e nome
 * igual/muito parecido) são AGRUPADAS: vence o nome confirmado pela camada (senão o mais frequente) e data/CPF
 * saem por MAIORIA — uma leitura ruim não duplica nem corrompe. O código Dropsigner sai por consenso
 * (`votarCodigoDropsigner`). Sem nome algum mas com código → "carimbo" Dropsigner (verificável pela URL),
 * como no fluxo de texto. Puro.
 */
export function assinaturasDeOcr(e: { blocos: string[]; pagina: string; marcaDagua?: string[]; camada?: string }): Assinatura[] {
  const codigo = votarCodigoDropsigner([e.pagina, ...(e.marcaDagua ?? []), ...e.blocos]);
  const url = codigo ? `https://www.dropsigner.com/validate/${codigo}` : "";
  type Leitura = { a: Assinatura; ok: boolean };
  const grupos: Leitura[][] = [];
  const perto = (x: string, y: string) => distancia(norm(x), norm(y)) <= Math.max(1, Math.floor(norm(x).length * 0.25));
  const add = (a: Assinatura) => {
    if (!a.nome.trim()) return;
    const c = corrigirNomePelaCamada(a.nome, e.camada ?? "");
    const l = { a: { ...a, nome: c.nome }, ok: c.confirmado };
    // MESMA assinatura = mesma fonte e nome parecido OU mesma data/hora (ao segundo) com CPF compatível —
    // duas assinaturas distintas no MESMO segundo não existem; evita duplicar por uma leitura ruim do nome.
    const mesmaData = (o: Assinatura) =>
      !!o.data && o.data.slice(0, 19) === l.a.data.slice(0, 19) && (!o.eCpf || !l.a.eCpf || o.eCpf === l.a.eCpf);
    const g = grupos.find((gr) => gr[0].a.fonte === a.fonte && gr.some((o) => perto(o.a.nome, l.a.nome) || mesmaData(o.a)));
    if (g) g.push(l);
    else grupos.push([l]);
  };
  for (const txt of [...e.blocos, e.pagina]) {
    for (const d of dropsignerDeOcr(txt))
      add({ nome: d.nome, eCpf: d.eCpf, usuario: "", local: "", data: d.data, ip: "", codigo: "", url: "", fonte: "dropsigner", ocr: true });
    for (const a of assinaturasFoxitDeTexto(txt)) add({ ...a, ocr: true });
    for (const a of assinaturasAdobeDeTexto(txt)) add({ ...a, ocr: true });
  }
  const out = grupos.map((g) => {
    const conf = g.filter((l) => l.ok);
    // Confirmado pela camada de texto vence; senão o MAIS FREQUENTE (empate → o mais curto: o lixo de OCR
    // acrescenta palavras, não tira).
    const nome = conf.length ? conf[0].a.nome : modaCurta(g.map((l) => l.a.nome));
    const a = { ...g[0].a, nome, data: moda(g.map((l) => l.a.data)), eCpf: moda(g.map((l) => l.a.eCpf)) };
    return a.fonte === "dropsigner" ? { ...a, codigo: codigo ?? "", url } : a;
  });
  if (out.length === 0 && codigo)
    return [{ nome: "", eCpf: "", usuario: "", local: "", data: "", ip: "", codigo, url, fonte: "dropsigner", ocr: true }];
  return out;
}

/** O DFD precisa de OCR quando não há NENHUMA assinatura NOMEADA vinda do texto (vazio ou só o "carimbo"
 * Dropsigner — marca d'água em texto com o bloco do signatário achatado). Puro. */
export function precisaOcr(assinaturas: Assinatura[]): boolean {
  return !assinaturas.some((a) => a.nome.trim());
}

/**
 * Mescla o resultado do OCR nas assinaturas de texto: as nomeadas do OCR SUBSTITUEM o "carimbo" Dropsigner
 * de texto e herdam o CÓDIGO dele (o da camada de texto é exato — melhor que o votado por OCR). Sem nenhuma
 * nomeada no OCR, mantém o que veio do texto (ou o carimbo do OCR, se o texto não tinha nada). Puro.
 */
export function mesclarAssinaturasOcr(texto: Assinatura[], ocr: Assinatura[]): Assinatura[] {
  const nomeadas = ocr.filter((a) => a.nome.trim());
  if (nomeadas.length === 0) return texto.length ? texto : ocr;
  const carimbo = texto.find((a) => a.fonte === "dropsigner" && !a.nome.trim() && a.codigo);
  const herdadas = nomeadas.map((a) => (a.fonte === "dropsigner" && carimbo ? { ...a, codigo: carimbo.codigo, url: carimbo.url } : a));
  return [...texto.filter((a) => a.nome.trim()), ...herdadas];
}

// ------------------------------------------------------------------ localização (geometria, puro)

// Âncoras = palavras típicas de um carimbo de assinatura. PRECISAS: "eletronicamente" inteiro (não pega
// "ELETRÔNICA" de descrição de item); sem "autor" (pegaria "AUTORIZAÇÃO"/"Autorizo" do rótulo da seção).
const RE_ANCORA = /^(assinad[oa]|digitalmente|eletr[oô]nicamente|signed|foxit|icp-?brasil|cpf|data:|dados:|date:|reader|cn=|nd:)/i;
const RE_FORTE = /^(assinad[oa]|digitalmente|eletr[oô]nicamente|signed|foxit|icp-?brasil|cn=)/i;

/** Palavra do texto CORRIDO de um carimbo: horizontal (não a marca d'água vertical) e pequena (não o nome
 * grande sobreposto). Limiar proporcional à escala do render. */
function horizontalPequena(p: PalavraOcr, escala: number): boolean {
  const w = p.bbox.x1 - p.bbox.x0;
  const h = p.bbox.y1 - p.bbox.y0;
  return w >= h * 0.8 && h < escala * 11;
}

/**
 * Localiza os BLOCOS de assinatura numa página a partir das palavras do OCR (qualquer posição, qualquer
 * página): agrupa as âncoras por proximidade (ligação simples) e, para cada grupo que é de fato um carimbo
 * (tem âncora "forte" OU o par CPF + Data), devolve a caixa do bloco — estendida p/ CIMA e p/ BAIXO (o nome
 * fica entre as âncoras; no Foxit a 1ª linha some sob o nome grande) e p/ a DIREITA até o fim das linhas;
 * quase nada p/ a esquerda (lá fica a coluna vizinha / o nome grande). Puro.
 */
export function localizarBlocosAssinatura(palavras: PalavraOcr[], dims: { w: number; h: number }, escala: number): Caixa[] {
  const pequenas = palavras.filter((p) => horizontalPequena(p, escala));
  const ancoras = pequenas.filter((p) => RE_ANCORA.test(p.text.trim())).sort((a, b) => a.bbox.y0 - b.bbox.y0);
  if (ancoras.length === 0) return [];
  const alturas = ancoras.map((a) => a.bbox.y1 - a.bbox.y0).sort((a, b) => a - b);
  const lh = Math.max(alturas[Math.floor(alturas.length / 2)] || escala * 4, escala * 3);
  const grupos: PalavraOcr[][] = [];
  for (const a of ancoras) {
    const g = grupos.find((gr) => gr.some((b) => Math.abs(b.bbox.y0 - a.bbox.y0) < lh * 7 && Math.abs(b.bbox.x0 - a.bbox.x0) < lh * 25));
    if (g) g.push(a);
    else grupos.push([a]);
  }
  const caixas: Caixa[] = [];
  for (const g of grupos) {
    const forte = g.some((a) => RE_FORTE.test(a.text.trim()));
    const cpfData = g.some((a) => /^cpf/i.test(a.text)) && g.some((a) => /^(data|dados|date)/i.test(a.text));
    if (!forte && !cpfData) continue;
    const minX = Math.min(...g.map((a) => a.bbox.x0));
    const y0 = Math.max(0, Math.min(...g.map((a) => a.bbox.y0)) - lh * 4);
    const y1 = Math.min(dims.h, Math.max(...g.map((a) => a.bbox.y1)) + lh * 4.5);
    let maxX = Math.max(...g.map((a) => a.bbox.x1));
    for (const p of pequenas) if (p.bbox.y0 >= y0 && p.bbox.y1 <= y1 && p.bbox.x0 >= minX - lh) maxX = Math.max(maxX, p.bbox.x1);
    caixas.push({ x0: Math.max(0, minX - lh), y0, x1: Math.min(dims.w, maxX + lh), y1 });
  }
  return caixas;
}

/** Regiões de interesse a partir das IMAGENS da página (normalizadas 0..1): logo do Dropsigner, rubrica —
 * o texto do carimbo fica à ESQUERDA/ACIMA delas. Ignora o CABEÇALHO (brasão/logo do órgão no topo) e junta
 * regiões sobrepostas. Puro. */
export function regioesDeImagens(imagens: Caixa[]): Caixa[] {
  const regs = imagens
    .filter((i) => i.y1 > 0.18 && i.x1 - i.x0 < 0.6) // fora do cabeçalho; não é imagem de página inteira
    .map((i) => ({ x0: Math.max(0, i.x0 - 0.34), y0: Math.max(0, i.y0 - 0.07), x1: Math.min(1, i.x1 + 0.02), y1: Math.min(1, i.y1 + 0.04) }));
  const out: Caixa[] = [];
  for (const r of regs.sort((a, b) => a.y0 - b.y0)) {
    const o = out.find((q) => r.x0 < q.x1 && q.x0 < r.x1 && r.y0 < q.y1 && q.y0 < r.y1);
    if (o) Object.assign(o, { x0: Math.min(o.x0, r.x0), y0: Math.min(o.y0, r.y0), x1: Math.max(o.x1, r.x1), y1: Math.max(o.y1, r.y1) });
    else out.push({ ...r });
  }
  return out;
}

const RE_ROTULO_ASSINATURA = /SECRET[ÁA]RI[OA]\s+DEMANDANTE|AUTORIZA[ÇC][ÃA]O|ORDENADOR|ASSINATURA/i;

/** Ordem de varredura das páginas: imagem fora do cabeçalho (+2), rótulo de assinatura na camada de texto
 * (+1), última página (+0,5); empate → da última p/ a primeira. Puro. */
export function prioridadePaginasOcr(infos: { pagina: number; imagens: number; texto: string }[]): { pagina: number; score: number }[] {
  const ultima = Math.max(...infos.map((i) => i.pagina));
  return infos
    .map((i) => ({
      pagina: i.pagina,
      score: (i.imagens > 0 ? 2 : 0) + (RE_ROTULO_ASSINATURA.test(i.texto) ? 1 : 0) + (i.pagina === ultima ? 0.5 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.pagina - a.pagina);
}

// ------------------------------------------------------------------ orquestração (motor injetado)

const ESCALA = 3; // render do passe 1 (legível p/ o texto pequeno do carimbo)
const LIMIAR = 120; // binarização dos recortes (texto preto × réguas/sobreposições claras)
const MAX_PAGINAS = 12; // teto de páginas lidas por DFD (custo)

function paraPx(c: Caixa, d: { w: number; h: number }): Caixa {
  return { x0: c.x0 * d.w, y0: c.y0 * d.h, x1: c.x1 * d.w, y1: c.y1 * d.h };
}

async function lerRegiao<C>(motor: MotorOcr<C>, canvas: C, reg: Caixa, d: { w: number; h: number }) {
  const leitura = await motor.ler(motor.recortar(canvas, reg, 1), "pagina");
  // palavras do recorte → coordenadas da página
  const palavras = leitura.palavras.map((p) => ({
    text: p.text,
    bbox: { x0: p.bbox.x0 + reg.x0, y0: p.bbox.y0 + reg.y0, x1: p.bbox.x1 + reg.x0, y1: p.bbox.y1 + reg.y0 },
  }));
  const blocos: string[] = [];
  for (const cx of localizarBlocosAssinatura(palavras, d, ESCALA)) {
    const recorte = motor.recortar(canvas, cx, 2, { binarizar: LIMIAR });
    blocos.push((await motor.ler(recorte, "bloco")).texto, (await motor.ler(recorte, "esparso")).texto);
  }
  return { texto: leitura.texto, blocos };
}

/** Lê as assinaturas achatadas de UMA página (atalho pelas imagens → página inteira como fallback). */
export async function lerAssinaturasDaPagina<C>(motor: MotorOcr<C>, pagina: number, imagens: Caixa[], camada = ""): Promise<Assinatura[]> {
  const canvas = await motor.render(pagina, ESCALA);
  const d = motor.dims(canvas);
  let texto = "";
  let blocos: string[] = [];
  for (const r of regioesDeImagens(imagens)) {
    const l = await lerRegiao(motor, canvas, paraPx(r, d), d);
    texto += `\n${l.texto}`;
    blocos.push(...l.blocos);
  }
  let res = assinaturasDeOcr({ blocos, pagina: texto, camada });
  if (!res.some((a) => a.nome.trim())) {
    const l = await lerRegiao(motor, canvas, { x0: 0, y0: 0, x1: d.w, y1: d.h }, d);
    texto = l.texto;
    blocos = l.blocos;
    res = assinaturasDeOcr({ blocos, pagina: texto, camada });
  }
  // Dropsigner → lê a faixa da marca d'água (margem direita, vertical, girada) em 4 variantes independentes
  // (1×/2×, com/sem binarização) p/ o CÓDIGO sair por CONSENSO (`votarCodigoDropsigner`).
  if (res.some((a) => a.fonte === "dropsigner")) {
    const faixa = { x0: d.w * 0.95, y0: 0, x1: d.w, y1: d.h };
    const marcas: string[] = [];
    for (const [up, bin] of [
      [1, 0],
      [1, LIMIAR],
      [2, 0],
      [2, LIMIAR],
    ])
      marcas.push((await motor.ler(motor.recortar(canvas, faixa, up, { girar: true, binarizar: bin || undefined }), "bloco")).texto);
    res = assinaturasDeOcr({ blocos, pagina: texto, marcaDagua: marcas, camada });
  }
  return res;
}

/**
 * Lê as assinaturas achatadas de um DFD varrendo **qualquer página** em ordem de prioridade. Lê TODAS as
 * páginas prováveis (score ≥ 1 — pode haver mais de um signatário) e só segue para as improváveis enquanto
 * nada foi achado; teto de `MAX_PAGINAS`. Erros por página são engolidos (best-effort).
 */
export async function lerAssinaturasPorOcr<C>(motor: MotorOcr<C>, paginas: number[]): Promise<Assinatura[]> {
  const infos: { pagina: number; imagens: number; texto: string; caixas: Caixa[] }[] = [];
  for (const p of paginas) {
    let caixas: Caixa[] = [];
    let texto = "";
    try {
      caixas = await motor.imagens(p);
      texto = await motor.textoCamada(p);
    } catch {
      /* segue sem as dicas */
    }
    infos.push({ pagina: p, imagens: regioesDeImagens(caixas).length, texto, caixas });
  }
  // Nomes impressos no DFD inteiro (o signatário pode estar impresso noutra página que não a do carimbo).
  const camada = infos.map((i) => i.texto).join("\n");
  const achadas: Assinatura[] = [];
  const vistos = new Set<string>();
  let lidas = 0;
  for (const { pagina, score } of prioridadePaginasOcr(infos)) {
    if (lidas >= MAX_PAGINAS) break;
    if (achadas.some((a) => a.nome.trim()) && score < 1) break;
    lidas++;
    try {
      const caixas = infos.find((i) => i.pagina === pagina)?.caixas ?? [];
      for (const a of await lerAssinaturasDaPagina(motor, pagina, caixas, camada)) {
        // Mesma assinatura lida em páginas/leituras diferentes: a data/hora (ao segundo) identifica.
        const chave = a.data ? `${a.fonte}|${a.data.slice(0, 19)}` : `${a.fonte}|${norm(a.nome)}`;
        if (!vistos.has(chave)) {
          vistos.add(chave);
          achadas.push(a);
        }
      }
    } catch {
      /* best-effort — uma página ruim não impede as demais */
    }
  }
  // Um "carimbo" (sem nome) só faz sentido se nenhuma assinatura NOMEADA foi lida.
  return achadas.some((a) => a.nome.trim()) ? achadas.filter((a) => a.nome.trim()) : achadas.slice(0, 1);
}

// ------------------------------------------------------------------ geometria das imagens (op list → caixas)

type OpsImagem = {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintImageXObjectRepeat: number;
};

/** Caixas (normalizadas 0..1, origem topo-esquerdo) das imagens desenhadas numa página, rastreando a CTM do
 * operator list do pdf.js (save/restore/transform + a matriz dos Form XObjects — a aparência de uma assinatura
 * costuma ser um Form). A imagem ocupa o quadrado unitário sob a CTM. Puro. */
export function caixasImagensDaOpList(fnArray: number[], argsArray: unknown[], ops: OpsImagem, pagina: { largura: number; altura: number }): Caixa[] {
  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha: number[][] = [];
  const out: Caixa[] = [];
  const mul = (a: number[], b: number[]) => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  for (let i = 0; i < fnArray.length; i++) {
    const f = fnArray[i];
    if (f === ops.save) pilha.push(ctm.slice());
    else if (f === ops.restore) ctm = pilha.pop() ?? ctm;
    else if (f === ops.transform) ctm = mul(ctm, argsArray[i] as number[]);
    else if (f === ops.paintFormXObjectBegin) {
      pilha.push(ctm.slice());
      const m = (argsArray[i] as unknown[] | undefined)?.[0];
      if (Array.isArray(m) && m.length === 6) ctm = mul(ctm, m as number[]);
    } else if (f === ops.paintFormXObjectEnd) ctm = pilha.pop() ?? ctm;
    else if (f === ops.paintImageXObject || f === ops.paintInlineImageXObject || f === ops.paintImageXObjectRepeat) {
      const pts = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([u, v]) => [ctm[0] * u + ctm[2] * v + ctm[4], ctm[1] * u + ctm[3] * v + ctm[5]]);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      out.push({
        x0: Math.min(...xs) / pagina.largura,
        x1: Math.max(...xs) / pagina.largura,
        y0: 1 - Math.max(...ys) / pagina.altura,
        y1: 1 - Math.min(...ys) / pagina.altura,
      });
    }
  }
  return out;
}
