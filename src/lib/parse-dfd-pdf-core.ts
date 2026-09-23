import { colunaDe, type Grade, linhaDe, montarGrade, type PdfTraco } from "./grade-pdf.ts";
import { limparTexto } from "./normalize.ts";
import {
  type Assinatura,
  codigoDoItem,
  coletarSecoes,
  type DfdItemParseado,
  type DfdParseado,
  ehRuido,
  extrairAssinaturas,
  extrairCabecalho,
  extrairRefsDfd,
  limparDescricaoItem,
  norm,
  numeroDfd,
  TITULO_SECAO_ITENS,
  tituloSecaoPadrao,
} from "./parse-dfd-comum.ts";

/**
 * Núcleo PURO do parser de DFD a partir do PDF. Recebe os TRECHOS de texto com
 * posição (`{page,x,y,str}`) extraídos pelo pdf.js (ver `parse-dfd-pdf.ts`) e
 * reconstrói a estrutura. O cabeçalho e as seções reaproveitam `parse-dfd-comum`;
 * a TABELA é remontada por posição de coluna, tratando os defeitos do PDF:
 * - rótulo e valor em trechos separados → usa o texto da LINHA (trechos juntos);
 * - com a GRADE desenhada (bordas das células, `grade-pdf.ts`) cada trecho cai na célula exata;
 *   sem ela, o número do item fica na linha do MEIO da célula e a descrição é casada pela borda
 *   (vão maior que a entrelinha);
 * - código quebrado em 2 linhas (ex.: "524193726" + "3") → rejuntado na ordem de leitura, só dígitos.
 * Sem pdf.js/D1 aqui → testável no Node com trechos sintéticos.
 */
export type { PdfTraco } from "./grade-pdf.ts";

/** Trecho de texto posicionado. Opcionais (vindos do pdf.js, ausentes nos fixtures antigos): `rot` = texto
 * NÃO horizontal (marca d'água vertical); `w` = largura; `h` = altura da fonte (pt). */
export type PdfItem = { page: number; x: number; y: number; str: string; rot?: boolean; w?: number; h?: number };
export type PdfLine = { page: number; y: number; items: PdfItem[] };

const HDR: Record<string, keyof ColMap> = {
  ITEM: "item",
  CODIGO: "codigo",
  "COD.": "codigo",
  DESCRICAO: "descricao",
  UNIDADE: "unidade",
  "UNID.": "unidade",
  QUANTIDADE: "quantidade",
  QTD: "quantidade",
  "QTD.": "quantidade",
  QTDE: "quantidade",
  "VALOR UNITARIO": "valorUnitario",
  UNITARIO: "valorUnitario",
  "VALOR TOTAL": "valorTotal",
};
/** Coluna da tabela de itens (os campos do item — sem a marca de origem da sobrescrita, que é só da tela). */
type ColunaItem = Exclude<keyof DfdItemParseado, "ref">;
type ColMap = Partial<Record<ColunaItem, number>>;

/** Normaliza os trechos — texto limpo (`limparTexto`: tabs/NBSP/quebras viram um espaço; caracteres invisíveis,
 * de controle e o U+FFFD somem; o marcador em fonte de símbolo vira "•") — e descarta os vazios. */
export function normalizar(bruto: PdfItem[]): PdfItem[] {
  return bruto.map((i) => ({ ...i, str: limparTexto(i.str) })).filter((i) => i.str);
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
// Bloco de assinatura Dropsigner no TEXTO RENDERIZADO, em QUALQUER idioma/variante da aparência:
//  - PT: "Assinado digitalmente|eletronicamente por: NOME [CPF: <mascarado>] Data: dd/mm/aaaa hh:mm:ss -03:00"
//  - EN: "Digitally signed by: NAME [CPF: <mascarado>] Date: M/D/AAAA h:mm:ss PM -03:00"
// **"digitalmente" E "eletronicamente"** ocorrem no Dropsigner (varia por documento). O **CPF é
// OPCIONAL** — alguns blocos trazem só NOME + Data (ex.: "Ricardo Rocha Batista Data: …"). O
// dois-pontos após "por"/"by" distingue do Formato B ("Assinado digitalmente por NOME, portador…",
// SEM dois-pontos). Grupos: 1 nome, 2 CPF (pode faltar → `undefined`), 3 data (crua — normalizada
// por `normalizarDataDropsigner`).
const RE_DROPSIGNER_BLOCO =
  /(?:Assinado\s+(?:digital|eletronica)mente\s+por|Digitally\s+signed\s+by)\s*:\s*(.+?)(?:\s+CPF\s*:\s*([\d.*-]+))?\s+(?:Data|Date)\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?(?:\s*[-+]\d{2}:\d{2})?)/gi;

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
 * página** (`getOperatorList`, ver `pageRender`). É preciso o texto RENDERIZADO — e não o
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
      // CPF é OPCIONAL no bloco (grupo 2 pode vir `undefined`, ex.: "NOME Data: …").
      blocos.push({ nome: m[1].trim(), eCpf: (m[2] ?? "").trim(), data: normalizarDataDropsigner(m[3].trim(), ingles), codigo: codPagina });
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

// Bloco de assinatura ADOBE / ICP-Brasil (PAdES) no TEXTO RENDERIZADO: "Assinado de forma digital
// por NOME:CPF  Dados: AAAA.MM.DD HH:MM:SS -03'00'". NÃO tem marca d'água/URL nem código público — a
// prova é o certificado ICP-Brasil embutido (validação oficial no ITI).
// **IDENTIFICAÇÃO CIRÚRGICA (dois selos ao mesmo tempo, para casar SÓ o carimbo Adobe e nunca prosa):**
//  1) o marcador EXCLUSIVO "Assinado de forma digital por" (o Dropsigner usa "digitalmente por:"; os
//     formatos A/B usam "Assinatura digital - Nome:"/"portador do CPF:"), e
//  2) a data no formato ISO do Adobe **AAAA.MM.DD** logo após `Dados:`/`Data:` (o Dropsigner/A/B usam
//     `dd/mm/aaaa`) — nenhum texto de seção casa os dois juntos.
// O nome é limitado a 160 chars (evita casar até um `Dados:` distante). Grupos: 1 nome (CPF colado no
// CN), 2 data crua (AAAA.MM.DD [hh:mm:ss] [-03'00']).
const RE_ADOBE_BLOCO =
  /Assinado\s+de\s+forma\s+digital\s+por\s+(.{1,160}?)\s+(?:Dados|Data):\s*(\d{4}\.\d{2}\.\d{2}(?:\s+\d{2}:\d{2}:\d{2})?(?:\s*[-+]\d{2}'\d{2}')?)/gi;

/** Normaliza a data Adobe "AAAA.MM.DD HH:MM:SS -03'00'" → "DD/MM/AAAA HH:MM:SS -03:00" (consistente
 * com os demais formatos e com `dataAssinaturaISO`). */
function normalizarDataAdobe(data: string): string {
  const m = data.match(/^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}:\d{2}:\d{2}))?\s*(?:([-+]\d{2})'(\d{2})')?/);
  if (!m) return data;
  let out = `${m[3]}/${m[2]}/${m[1]}`;
  if (m[4]) out += ` ${m[4]}`;
  if (m[5] && m[6]) out += ` ${m[5]}:${m[6]}`;
  return out;
}

/** Máscara de CPF (11 dígitos) → `***.XXX.XXX-**` (mantém só os 6 do meio, como os demais formatos). */
function mascararCpf(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : digitos;
}

/**
 * Formato D — assinatura **Adobe / ICP-Brasil** (PAdES), do TEXTO RENDERIZADO por página. A aparência
 * (widget de assinatura) traz "Assinado de forma digital por NOME:CPF  Dados: AAAA.MM.DD …". Não há
 * marca d'água nem código verificador público (o pdf.js também não expõe o certificado nos metadados);
 * a prova é o certificado ICP-Brasil no PDF (validação oficial no ITI). Extrai o NOME (separando o CPF
 * colado no CN, e mascarando-o) + a DATA (normalizada). Dedup por nome+data. Puro/testável.
 */
export function assinaturasAdobeDeTexto(textos: string | string[]): Assinatura[] {
  const paginas = Array.isArray(textos) ? textos : [textos];
  const out: Assinatura[] = [];
  const vistos = new Set<string>();
  for (const texto of paginas) {
    RE_ADOBE_BLOCO.lastIndex = 0;
    let m: RegExpExecArray | null = RE_ADOBE_BLOCO.exec(texto);
    while (m !== null) {
      const bruto = m[1].trim();
      const data = normalizarDataAdobe(m[2].trim());
      // O CN do ICP-Brasil vem "NOME:CPF" — separa o CPF (11 dígitos) do nome. Sem end-anchor: se
      // vier um DN depois ("NOME:CPF DN: cn=…, o=ICP-Brasil"), fica só o nome (descarta o DN).
      const cpfM = bruto.match(/^(.+?):(\d{11})(?:\D|$)/);
      const nome = (cpfM ? cpfM[1] : bruto).trim();
      const eCpf = cpfM ? mascararCpf(cpfM[2]) : "";
      const chave = `${norm(nome)}|${data}`;
      if (!vistos.has(chave)) {
        vistos.add(chave);
        out.push({ nome, eCpf, usuario: "", local: "", data, ip: "", codigo: "", url: "", fonte: "adobe" });
      }
      m = RE_ADOBE_BLOCO.exec(texto);
    }
  }
  return out;
}

// ============================ Formato E — Foxit/ICP-Brasil por OCR ============================
// O carimbo Foxit/ICP-Brasil (e-CPF) vem ACHATADO como VETOR/IMAGEM (sem camada de texto, sem `/Sig`),
// então NENHUM parser de texto o lê — ele é obtido por **OCR** da região do carimbo (só no navegador,
// `ocr-assinatura.ts`). O TEXTO do OCR chega aqui. Layout real do carimbo (validado no PDF `pd101820`):
//   Assinado digitalmente por NOME:CPF        ← 1ª linha; costuma vir SOBREPOSTA pelo nome grande do
//   ND: C=BR, O=ICP-Brasil, …                   carimbo → SAI CORROMPIDA no OCR
//   … CN=NOME:CPF                             ← o subject do e-CPF sai LIMPO (não tem sobreposição)
//   Data: AAAA.MM.DD HH:MM:SS-03'00'          ← data ISO, sai LIMPA
//   Foxit PDF Reader Versão: …
//
// Por isso o parser é ANCORADO na **DATA ISO** (`AAAA.MM.DD`, sai confiável no OCR) e extrai o nome do
// **CN=** (limpo) com fallback para "Assinado digitalmente por" (quando não há CN / texto limpo).
// **Distinção do Formato B (fonte "sistema"):** B usa "em dd/mm/aaaa" (sem data ISO) → não casa aqui.
// **Distinção do Formato D (Adobe):** Adobe usa "de forma digital" e não tem "Foxit" → a MARCA exige
// "Foxit" ou "Assinado digitalmente por".
const RE_FOXIT_DATA_ISO =
  /(?:Dados|Data)\s*[:.]?\s*(\d{4}\.\d{2}\.\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?(?:\s*[-+]?\d{2}'?\d{2}'?)?)/gi;
// Marca que CONFIRMA um bloco Foxit (não Adobe, não prosa). "Foxit" (rodapé do carimbo) é o mais
// confiável no OCR; "Assinado digitalmente por" cobre o texto limpo/`.xlsx`.
const RE_FOXIT_MARCA = /Foxit|Assinado\s+digitalmente\s+por/i;
const JANELA_FOXIT = 600; // chars ANTES da data (onde ficam CN=/"por") + um respiro DEPOIS (p/ "Foxit")

/** Corrige confusões comuns de OCR **dentro de um grupo que deveria ser só dígitos** (o CPF): O/o→0,
 * I/l/|→1, S→5, B→8. Aplicado SÓ ao token do CPF (nunca ao nome). */
function digitosOcr(s: string): string {
  return s.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/[Ss]/g, "5").replace(/[Bb]/g, "8");
}

/** Nome + CPF de um bloco Foxit. Prefere o **CN=NOME:CPF** (subject do e-CPF — sai limpo mesmo com o
 * cabeçalho sobreposto; o "=" pode sumir no OCR → `[=:]?`); cai para "Assinado digitalmente por
 * NOME:CPF" e, por fim, só NOME. CPF tolera erro de OCR (`digitosOcr`) e é opcional. */
function nomeCpfFoxit(janela: string): { nome: string; eCpf: string } | null {
  const cn = janela.match(/\bCN\s*[=:]?\s*([A-Za-zÀ-ÿ][^,:=]{1,78}?)\s*:\s*([\dOoIl|SsBb]{11})\b/i);
  if (cn) {
    const d = digitosOcr(cn[2]);
    if (/^\d{11}$/.test(d)) return { nome: cn[1].replace(/\s+/g, " ").trim(), eCpf: mascararCpf(d) };
  }
  const pc = janela.match(/Assinado\s+digitalmente\s+por\s+([A-Za-zÀ-ÿ][^,:]{1,78}?)\s*:\s*([\dOoIl|SsBb]{11})\b/i);
  if (pc) {
    const d = digitosOcr(pc[2]);
    if (/^\d{11}$/.test(d)) return { nome: pc[1].replace(/\s+/g, " ").trim(), eCpf: mascararCpf(d) };
  }
  const pn = janela.match(/Assinado\s+digitalmente\s+por\s+([A-Za-zÀ-ÿ][^,:]{1,78}?)(?:\s+ND\b|,|\s+Dados?\b|\s+Data\b|$)/i);
  const nome = pn ? pn[1].replace(/\s+/g, " ").trim() : "";
  return nome ? { nome, eCpf: "" } : null;
}

/**
 * Formato E — assinatura **Foxit / ICP-Brasil** (e-CPF), a partir do TEXTO extraído por **OCR** da
 * região do carimbo (que vem achatado — ver `ocr-assinatura.ts`). Ancorado na DATA ISO (`AAAA.MM.DD`,
 * confiável no OCR) + MARCA "Foxit"/"digitalmente por"; extrai o nome do **CN=** (limpo) com fallback.
 * Emite `fonte:"foxit"`. Tolerante a OCR (colapsa espaços; corrige dígitos só no CPF). Dedup por
 * nome+data. Puro/testável — a etapa imagem→texto fica em `ocr-assinatura.ts`.
 */
export function assinaturasFoxitDeTexto(textos: string | string[]): Assinatura[] {
  const paginas = Array.isArray(textos) ? textos : [textos];
  const out: Assinatura[] = [];
  const vistos = new Set<string>();
  for (const bruto of paginas) {
    const texto = String(bruto ?? "").replace(/\s+/g, " ");
    RE_FOXIT_DATA_ISO.lastIndex = 0;
    let anterior = 0; // início da janela da PRÓXIMA data (evita cruzar blocos numa multi-assinatura)
    let m: RegExpExecArray | null = RE_FOXIT_DATA_ISO.exec(texto);
    while (m !== null) {
      const fim = m.index + m[0].length;
      // Janela = do bloco anterior/600 chars antes da data ATÉ um respiro depois (p/ pegar "Foxit").
      const janela = texto.slice(Math.max(anterior, m.index - JANELA_FOXIT), fim + 60);
      anterior = fim;
      if (RE_FOXIT_MARCA.test(janela)) {
        const nc = nomeCpfFoxit(janela);
        if (nc) {
          const data = normalizarDataAdobe(m[1].trim());
          const chave = `${norm(nc.nome)}|${data}`;
          if (!vistos.has(chave)) {
            vistos.add(chave);
            out.push({ nome: nc.nome, eCpf: nc.eCpf, usuario: "", local: "", data, ip: "", codigo: "", url: "", fonte: "foxit" });
          }
        }
      }
      m = RE_FOXIT_DATA_ISO.exec(texto);
    }
  }
  return out;
}

// Marcadores INEQUÍVOCOS da APARÊNCIA de uma assinatura Adobe/ICP-Brasil FLATTEN (achatada no
// conteúdo da página — por isso aparece no `getTextContent` e VAZA para o texto das seções, ao
// contrário do Dropsigner, que fica só no render). Usados só para LOCALIZAR a região e removê-la.
const RE_APARENCIA_SIG = [
  /assinado\s+de\s+forma\s+digital/i,
  /\b(?:dados|data)\s*:\s*\d{4}\.\d{2}\.\d{2}/i,
  /\d{1,2}:\d{2}:\d{2}\s*[-+]\d{2}'\d{2}'/,
];
// Vão máximo (pt) entre trechos CONTÍGUOS da mesma aparência. Maior que a entrelinha do bloco
// (~7pt), menor que o respiro até a legenda de cargo/nome que fica ABAIXO da linha de assinatura.
const GAP_APARENCIA = 11;
// Âncora ESTRITA (o trecho COMEÇA com o marcador) — p/ a assinatura SOBRE o texto, onde não há coluna
// separada: prosa que CITA o marcador no meio da frase nunca casa.
const RE_APARENCIA_ESTRITA = /^(?:assinado\s+de\s+forma\s+digital|(?:dados|data)\s*:\s*\d{4}\.\d{2}\.\d{2}|\d{1,2}:\d{2}:\d{2}\s*[-+]\d{2}'\d{2}'?$)/i;

/**
 * Remove a APARÊNCIA de assinatura (bloco Adobe FLATTEN) dos trechos, para NÃO vazar no texto das
 * seções do DFD (a Seção 9/10 vinha poluída com "Assinado de forma digital por NOME:CPF Dados: …").
 * A assinatura em si é extraída à parte (texto renderizado), então removê-la daqui não perde nada.
 * **CIRÚRGICO por GEOMETRIA, não por nome** — para nunca apagar um nome DIGITADO legítimo numa seção:
 *  1) acha as âncoras da aparência (marcadores inequívocos) e o CORTE `x` que separa a coluna do
 *     TEXTO DA SEÇÃO (à esquerda, na margem) da coluna da APARÊNCIA (à direita);
 *  2) na coluna direita, remove só o CLUSTER CONTÍGUO em `y` que contém as âncoras (vãos ≤ `GAP`) —
 *     assim uma legenda (ex.: "ORDENADOR") logo ABAIXO da aparência, separada por um respiro, é
 *     PRESERVADA. Sem âncora ⇒ trechos inalterados (nenhum DFD sem Adobe-flatten é afetado). Só age
 *     quando há separação clara margem×âncora (`≥ 60pt`). Independe de ONDE a assinatura esteja. Puro.
 */
export function removerAparenciaAssinatura(items: PdfItem[]): PdfItem[] {
  const anchors = items.filter((i) => RE_APARENCIA_SIG.some((re) => re.test(i.str)));
  if (anchors.length === 0) return items;
  const remover = new Set<PdfItem>();
  const porPagina = new Map<number, PdfItem[]>();
  for (const a of anchors) {
    const arr = porPagina.get(a.page) ?? [];
    arr.push(a);
    porPagina.set(a.page, arr);
  }
  for (const [page, ancs] of porPagina) {
    const doPage = items.filter((i) => i.page === page);
    const margemEsq = Math.min(...doPage.map((i) => i.x)); // margem esquerda do texto da página
    const ancoraMinX = Math.min(...ancs.map((a) => a.x));
    let corte = (margemEsq + ancoraMinX) / 2;
    let anchorYs = new Set(ancs.map((a) => a.y));
    let sobreTexto = false;
    // Sem separação clara margem×âncora (≥ 60pt) = a assinatura foi posta SOBRE o texto (ou é prosa que cita
    // o marcador). Só age se houver âncora ESTRITA (o trecho COMEÇA com o marcador — prosa não começa) e
    // corta rente à âncora: o texto que começa na margem é preservado.
    if (ancoraMinX - margemEsq < 60) {
      const estritas = ancs.filter((a) => RE_APARENCIA_ESTRITA.test(a.str.trim()));
      if (estritas.length === 0) continue;
      corte = Math.min(...estritas.map((a) => a.x)) - 2;
      anchorYs = new Set(estritas.map((a) => a.y));
      sobreTexto = true;
    }
    // Coluna DIREITA (aparência), do topo para a base. Fatia em clusters contíguos (vão ≤ GAP);
    // remove só os clusters que contêm uma âncora (o bloco da assinatura), preservando o resto.
    const direita = doPage.filter((i) => i.x >= corte).sort((p, q) => q.y - p.y);
    let run: PdfItem[] = [];
    // Altura "de corpo" da página: o NOME GRANDE da aparência (à esquerda das âncoras, sobre o texto) é
    // reconhecido pela fonte bem maior; o pedaço "NOME:CPF"/cauda do CPF, pelo formato.
    const hs = doPage.map((i) => i.h ?? 0).filter((h) => h > 0).sort((a, b) => a - b);
    const hCorpo = hs[Math.floor(hs.length / 2)] ?? 0;
    const fechar = () => {
      if (run.some((i) => anchorYs.has(i.y))) {
        for (const i of run) remover.add(i);
        if (sobreTexto) {
          const topo = run[0].y + GAP_APARENCIA;
          const base = run[run.length - 1].y - GAP_APARENCIA;
          for (const i of doPage)
            if (i.x < corte && i.y <= topo && i.y >= base && (/:\s?\d{4,11}$|^\d{3,6}$/.test(i.str.trim()) || (hCorpo > 0 && (i.h ?? 0) >= hCorpo * 1.3)))
              remover.add(i);
        }
      }
      run = [];
    };
    for (const i of direita) {
      if (run.length > 0 && run[run.length - 1].y - i.y > GAP_APARENCIA) fechar();
      run.push(i);
    }
    fechar();
  }
  return remover.size === 0 ? items : items.filter((i) => !remover.has(i));
}

// Segmento que É a aparência de uma assinatura inline (Adobe/Foxit/Dropsigner) na camada de texto —
// casado no INÍCIO do segmento (prosa que cita "assinado de forma digital" no meio da frase é preservada).
const RE_SEGMENTO_ASSINATURA = [
  /^assinado\s+de\s+forma\s+digital\b/i, // Adobe
  /^(?:assinad[oa]\s+(?:digital|eletronica)mente\s+por|digitally\s+signed\s+by)\s*:/i, // Dropsigner (PT/EN, com ":")
  /^assinado\s+digitalmente\s+por\s+[^,]+:\s?\d{11}\b/i, // Foxit ("NOME:CPF"; o Formato B usa ", portador")
  /^(?:dados|data|date)\s*:\s*\d{4}\.\d{2}\.\d{2}/i, // data ISO do Adobe/Foxit
  /^\d{1,2}:\d{2}:\d{2}\s*[-+]\d{2}'\d{2}'?$/, // hora do Adobe
  /^[\p{L} .'-]{3,}:\s?\d{11}$/u, // CN do e-CPF ("NOME:CPF")
  /^(?:nd|cn)\s*:\s*c\s*=\s*br\b|\bo\s*=\s*icp-brasil\b/i, // ND/CN do certificado ICP-Brasil
  /^foxit\s+pdf\b/i,
  /documento\s+assinado\s+no\s+dropsigner|dropsigner\.com\/validate\//i, // marca d'água Dropsigner
];
// Linhas do BLOCO Dropsigner abaixo do "Assinado … por:" (alinhadas a ele): CPF/Data.
const RE_LINHA_BLOCO = /^(?:cpf|data|date)\s*:/i;
const GAP_SEGMENTO = 12; // vão horizontal (pt) que separa dois blocos na mesma linha

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");
export function ehSegmentoAssinatura(texto: string): boolean {
  const t = semAcento(texto.trim());
  return RE_SEGMENTO_ASSINATURA.some((re) => re.test(t));
}

/** Segmentos de uma linha: trechos contíguos em `x` (vão ≤ `GAP_SEGMENTO`). Sem largura, estima. */
function segmentosDaLinha(l: PdfLine): PdfItem[][] {
  const segs: PdfItem[][] = [];
  let fim = Number.NEGATIVE_INFINITY;
  for (const it of [...l.items].sort((a, b) => a.x - b.x)) {
    if (segs.length === 0 || it.x - fim > GAP_SEGMENTO) segs.push([it]);
    else segs[segs.length - 1].push(it);
    fim = Math.max(fim, it.x + (it.w ?? it.str.length * (it.h ?? 10) * 0.5));
  }
  return segs;
}

/**
 * Tira da camada de texto TUDO o que é assinatura e NADA do texto do DFD — para a assinatura posta em
 * QUALQUER lugar (margem, sobre o texto, qualquer página) não vazar para as seções/itens e, ao contrário do
 * antigo corte por LINHA inteira, não apagar o texto legítimo que divide a mesma linha com ela:
 *  1) texto ROTACIONADO (marca d'água vertical) — nunca é conteúdo do DFD (só se for minoria na página);
 *  2) a aparência Adobe FLATTEN por geometria (`removerAparenciaAssinatura`, inclusive sobre o texto);
 *  3) por SEGMENTO (trechos contíguos da linha): remove só o segmento que É assinatura
 *     (`ehSegmentoAssinatura`) + as linhas CPF/Data/nome do bloco Dropsigner alinhadas logo abaixo.
 * A assinatura em si é extraída À PARTE (texto bruto/renderizado/OCR), então nada se perde. Puro.
 */
export function limparAssinaturasDoTexto(items: PdfItem[]): PdfItem[] {
  // 1) rotacionados (por página, só se forem minoria — página inteira girada fica intacta)
  const porPag = new Map<number, { tot: number; rot: number }>();
  for (const i of items) {
    const c = porPag.get(i.page) ?? { tot: 0, rot: 0 };
    c.tot++;
    if (i.rot) c.rot++;
    porPag.set(i.page, c);
  }
  let out = items.some((i) => i.rot)
    ? items.filter((i) => {
        if (!i.rot) return true;
        const c = porPag.get(i.page);
        return !c || c.rot / c.tot > 0.3;
      })
    : items;
  // 2) aparência Adobe (coluna / sobre o texto)
  out = removerAparenciaAssinatura(out);
  // 3) segmentos de assinatura
  const linhas = agruparLinhas(out);
  const remover = new Set<PdfItem>();
  for (let k = 0; k < linhas.length; k++) {
    for (const seg of segmentosDaLinha(linhas[k])) {
      const texto = seg.map((i) => i.str).join(" ");
      if (!ehSegmentoAssinatura(texto)) continue;
      for (const i of seg) remover.add(i);
      // Bloco Dropsigner: "…por:" ⏎ NOME ⏎ CPF: … ⏎ Data: … — alinhado à esquerda com a âncora.
      if (!/por\s*:|by\s*:?$/i.test(semAcento(texto))) continue;
      const x0 = seg[0].x;
      let yAnt = linhas[k].y;
      for (let j = k + 1, n = 0; j < linhas.length && n < 4 && linhas[j].page === linhas[k].page; j++) {
        if (yAnt - linhas[j].y > 16) break;
        const alinhado = segmentosDaLinha(linhas[j]).find((sg) => Math.abs(sg[0].x - x0) <= 8);
        if (!alinhado) break;
        const t = semAcento(alinhado.map((i) => i.str).join(" ").trim());
        // 1ª linha = o NOME (curto, sem dígitos); depois, só CPF/Data — texto do DFD alinhado ali fica.
        if (n === 0 ? /\d/.test(t) || t.split(/\s+/).length > 8 : !RE_LINHA_BLOCO.test(t)) break;
        for (const i of alinhado) remover.add(i);
        yAnt = linhas[j].y;
        n++;
      }
    }
  }
  return remover.size === 0 ? out : out.filter((i) => !remover.has(i));
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

// ─────────────────────────── Tabela de itens (Seção 4) ───────────────────────────

/** Colunas da tabela, na ordem do formulário. */
const ORDEM_COLUNAS: readonly ColunaItem[] = ["item", "codigo", "descricao", "unidade", "quantidade", "valorUnitario", "valorTotal"];
const COLUNAS_VALOR: readonly ColunaItem[] = ["quantidade", "valorUnitario", "valorTotal"];
// Rótulo de QUANTIDADE no cabeçalho ("QUANTIDADE", "QTD", "QTDE").
const RE_ROTULO_QTD = /QUANTIDADE|^QTDE?\.?$/;
// Partes do cabeçalho de coluna que ocupam uma linha própria ("VALOR" ⏎ "UNITÁRIO").
const PARTES_CABECALHO = new Set(["VALOR", "UNITARIO", "VALOR UNITARIO", "VALOR TOTAL"]);
// Rótulo da linha do TOTAL GERAL (na área dos valores, nunca na descrição).
const ROTULOS_TOTAL = new Set(["VALOR TOTAL", "TOTAL", "TOTAL GERAL", "VALOR TOTAL GERAL", "VALOR GLOBAL"]);
// Conteúdo da célula ITEM: o nº (até 6 dígitos; "1." / "1)" / "1º" também valem).
const RE_NUMERO_ITEM = /^(\d{1,6})[.)º°]?$/;

/** Linha do CABEÇALHO da tabela de itens: um trecho EXATAMENTE "ITEM" + um de QUANTIDADE/QTD — uma descrição
 * que cita "item" e "quantidade" no meio do texto não é cabeçalho (não some da tabela). */
export function ehCabecalhoItens(l: PdfLine): boolean {
  return l.items.some((i) => norm(i.str) === "ITEM") && l.items.some((i) => RE_ROTULO_QTD.test(norm(i.str)));
}

/** Trecho do corpo da tabela + o índice da sua linha visual (`agruparLinhas`). */
type TrechoCorpo = { f: PdfItem; k: number };
/** Nº de item achado pelo texto (âncora no MEIO da célula): y da linha visual + os trechos que o formam. */
type NumeroItem = { page: number; y: number; n: number; fr: PdfItem[] };
type Colunas = Record<ColunaItem, TrechoCorpo[]>;
const colunasVazias = (): Colunas => ({ item: [], codigo: [], descricao: [], unidade: [], quantidade: [], valorUnitario: [], valorTotal: [] });
/** Ordem de leitura: página, linha visual, x. */
const ordemLeitura = (a: TrechoCorpo, b: TrechoCorpo) => a.f.page - b.f.page || a.k - b.k || a.f.x - b.f.x;
const mediana = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Há algum `y` em (lo, hi] na lista em ordem DESC? Busca binária — O(log n). */
function algumEntre(ysDesc: number[], lo: number, hi: number): boolean {
  let a = 0;
  let b = ysDesc.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (ysDesc[m] > hi) a = m + 1;
    else b = m;
  }
  return a < ysDesc.length && ysDesc[a] > lo;
}

/**
 * Item a partir dos trechos de cada coluna, em ordem de leitura: o CÓDIGO junta os pedaços SEM espaço e fica só
 * com os dígitos ("524194727" ⏎ "0" = "5241947270"; zero à esquerda preservado); a DESCRIÇÃO junta as linhas com
 * espaço e sai limpa (sem marcadores de lista, tabs ou caracteres invisíveis); a UNIDADE junta as linhas; os
 * VALORES juntam os pedaços quebrados ANTES de converter (um valor quebrado não perde as casas decimais).
 */
function montarItem(n: number | null, col: Colunas): DfdItemParseado {
  const texto = (k: ColunaItem, sep: string) => [...col[k]].sort(ordemLeitura).map((c) => c.f.str).join(sep);
  return {
    item: n,
    codigo: codigoDoItem(texto("codigo", "")),
    descricao: limparDescricaoItem(texto("descricao", " ")) || null,
    unidade: limparTexto(texto("unidade", " ")) || null,
    quantidade: numeroDfd(texto("quantidade", "")),
    valorUnitario: numeroDfd(texto("valorUnitario", "")),
    valorTotal: numeroDfd(texto("valorTotal", "")),
  };
}

/**
 * Itens pela GRADE DESENHADA (Centi — ver `grade-pdf.ts`): cada trecho cai na CÉLULA (linha × coluna) que o
 * contém, sem adivinhação por espaçamento. Uma linha da grade = um item. Célula que ATRAVESSA a página: a linha
 * sem nº no TOPO da página continua o item anterior; a do FIM da página (com o nº na seguinte) é a cabeça do
 * próximo. Linha sem nº, código nem descrição (subtotal) não é item; linha sem nº no meio da página vira um item
 * próprio (nunca se mistura a outro). `null` quando a grade não explica o corpo da tabela (trecho fora das linhas
 * desenhadas, nº em 2 linhas = borda faltando, ou nº de itens diferente do que o texto viu) — aí vale a geometria
 * do texto.
 */
function itensPelaGrade(corpo: TrechoCorpo[], grade: Grade<ColunaItem>, qtdNumeros: number): DfdItemParseado[] | null {
  type LinhaG = { page: number; idx: number; col: Colunas };
  const porChave = new Map<string, LinhaG>();
  for (const c of corpo) {
    const idx = linhaDe(grade, c.f.page, c.f.y);
    if (idx == null) return null;
    const key = colunaDe(grade, c.f.x);
    if (key == null) continue; // fora das colunas (margem da página): não é dado de item
    const chave = `${c.f.page}:${idx}`;
    let l = porChave.get(chave);
    if (!l) {
      l = { page: c.f.page, idx, col: colunasVazias() };
      porChave.set(chave, l);
    }
    l.col[key].push(c);
  }
  const linhasG = [...porChave.values()].sort((a, b) => a.page - b.page || a.idx - b.idx);
  if (linhasG.some((l) => new Set(l.col.item.map((c) => c.k)).size > 1)) return null; // nº em 2 linhas: borda faltando
  const numeros = linhasG.map((l) => {
    const m = [...l.col.item].sort(ordemLeitura).map((c) => c.f.str).join("").match(RE_NUMERO_ITEM);
    return m ? Number(m[1]) : null;
  });
  const numerados = numeros.filter((n) => n != null).length;
  if (numerados === 0 || numerados !== qtdNumeros) return null;
  const primeira = new Map<number, number>();
  const ultima = new Map<number, number>();
  for (const l of linhasG) {
    if (!primeira.has(l.page)) primeira.set(l.page, l.idx);
    ultima.set(l.page, l.idx);
  }
  const itens: { n: number | null; partes: LinhaG[] }[] = [];
  let cabeca: LinhaG[] = []; // parte(s) SEM nº no fim da página, à espera do nº na página seguinte
  for (let i = 0; i < linhasG.length; i++) {
    const l = linhasG[i];
    const n = numeros[i];
    if (n != null) {
      itens.push({ n, partes: [...cabeca, l] });
      cabeca = [];
      continue;
    }
    if (l.col.codigo.length === 0 && l.col.descricao.length === 0) continue; // subtotal/soma: não é item
    const ehPrimeira = primeira.get(l.page) === l.idx;
    if (cabeca.length > 0 && ehPrimeira) cabeca.push(l); // meio de uma célula de 3+ páginas
    else if (ehPrimeira && itens.length > 0) itens[itens.length - 1].partes.push(l); // cauda da célula da pág. anterior
    else if (ultima.get(l.page) === l.idx && (linhasG[i + 1]?.page ?? l.page) > l.page) cabeca = [l];
    else itens.push({ n: null, partes: [l] });
  }
  if (cabeca.length > 0) itens.push({ n: null, partes: cabeca });
  return itens.map((it) => {
    const col = colunasVazias();
    for (const p of it.partes) for (const k of ORDEM_COLUNAS) col[k].push(...p.col[k]);
    return montarItem(it.n, col);
  });
}

/**
 * Itens pela GEOMETRIA DO TEXTO (PDF sem grade desenhada). O nº/código/valores ficam na ÂNCORA (meio da célula);
 * a descrição ocupa várias linhas ACIMA e ABAIXO do nº e é casada pela BORDA da célula = um vão entre linhas
 * MAIOR que a entrelinha (`LIM`). Robustez: a entrelinha é o MENOR vão recorrente (a mediana errava num DFD com
 * muitos itens de 1 linha e um item enorme: a borda não era vista e a descrição vazava); os vãos são por LINHA
 * VISUAL (um marcador/sobrescrito fora da linha de base não inventa vão); com mais de uma borda possível (linha em
 * branco na descrição), vale a que deixa o item SIMÉTRICO em volta do seu nº (célula centralizada); o código e os
 * valores acima do 1º nº de uma página de continuação ou numa página sem nº seguem a mesma regra da descrição (o
 * "0" de um código que virou a página não vira zero à esquerda do item seguinte).
 */
function itensPelaGeometria(
  corpo: TrechoCorpo[],
  numeros: NumeroItem[],
  linhas: PdfLine[],
  anchors: ColMap,
  /** Borda DIREITA do rótulo de cada coluna (quando a largura é conhecida). */
  direitas: Partial<Record<ColunaItem, number>>,
): DfdItemParseado[] {
  const nums = [...numeros].sort((a, b) => a.page - b.page || b.y - a.y);
  if (nums.length === 0) return [];
  const doNumero = new Set(nums.flatMap((n) => n.fr));
  const trechos = corpo.filter((c) => !doNumero.has(c.f));
  const cols = ORDEM_COLUNAS.map((key) => ({ key, x: anchors[key] })).filter((c): c is { key: ColunaItem; x: number } => c.x != null);
  // INÍCIO REAL do texto da descrição (alinhado à esquerda, bem antes do rótulo "DESCRIÇÃO") = o menor x de um
  // trecho com LETRA entre o código e a unidade — só DA TABELA (varrer as seções 5–9 derrubava o limite com um
  // texto qualquer e mandava dígitos do código p/ a descrição). Dígito à direita dele é descrição (nº de peça).
  const codAnchor = anchors.codigo ?? 0;
  const uniAnchor = anchors.unidade ?? Number.POSITIVE_INFINITY;
  let descStartX = anchors.descricao ?? Number.POSITIVE_INFINITY;
  for (const c of trechos) if (c.f.x > codAnchor + 5 && c.f.x < uniAnchor && c.f.x < descStartX && /\p{L}/u.test(c.f.str)) descStartX = c.f.x;
  // Número ALINHADO À DIREITA (quantidade/valores): a coluna do rótulo cuja borda direita fica mais perto da borda
  // direita do número — um pedaço curto ("8912" de um valor quebrado) começa bem à direita e cruzaria o ponto médio.
  const colunaNumero = (f: PdfItem): ColunaItem | null => {
    if (f.w == null || !/^[\d.,\s-]+$/.test(f.str)) return null;
    let melhor: ColunaItem | null = null;
    let dist = Number.POSITIVE_INFINITY;
    for (const k of COLUNAS_VALOR) {
      const r = direitas[k];
      if (r != null && Math.abs(f.x + f.w - r) < dist) {
        dist = Math.abs(f.x + f.w - r);
        melhor = k;
      }
    }
    return dist <= 20 ? melhor : null;
  };
  const colOf = (f: PdfItem): ColunaItem => {
    let idx = 0;
    for (let i = 0; i < cols.length - 1; i++) if (f.x >= (cols[i].x + cols[i + 1].x) / 2) idx = i + 1;
    const c: ColunaItem = cols[idx]?.key ?? "descricao";
    // Entre o código e a descrição: dígitos (mesmo com espaço no meio) antes do início do texto = código.
    if (c === "codigo" || c === "descricao") return /^\d[\d\s]*$/.test(f.str) && f.x < descStartX ? "codigo" : "descricao";
    if (COLUNAS_VALOR.includes(c)) return colunaNumero(f) ?? c;
    return c;
  };
  const yDe = (c: TrechoCorpo) => linhas[c.k].y; // y da LINHA VISUAL (todos os trechos da linha andam juntos)
  const trechosCol = trechos.map((c) => ({ c, col: colOf(c.f) }));

  // Âncoras (nº) por página, em y DESC.
  const porPagina = new Map<number, { ys: number[]; bi: number[]; topo: number; first: number }>();
  nums.forEach((b, i) => {
    const g = porPagina.get(b.page);
    if (!g) porPagina.set(b.page, { ys: [b.y], bi: [i], topo: b.y, first: i });
    else {
      g.ys.push(b.y);
      g.bi.push(i);
      if (b.y > g.topo) g.topo = b.y;
    }
  });
  // Linhas visuais com descrição, por página (y DESC, uma por linha).
  const descPorPagina = new Map<number, number[]>();
  const vistas = new Set<number>();
  for (const { c, col } of trechosCol) {
    if (col !== "descricao" || vistas.has(c.k)) continue;
    vistas.add(c.k);
    const arr = descPorPagina.get(c.f.page);
    if (arr) arr.push(yDe(c));
    else descPorPagina.set(c.f.page, [yDe(c)]);
  }
  for (const ys of descPorPagina.values()) ys.sort((x, y) => y - x);
  // ── Entrelinha e limiar de BORDA: o menor vão RECORRENTE (≥ 2 ocorrências e ≥ 5% dos vãos) acima de um piso
  // pela altura da fonte (vão menor que 0,9 do corpo não é linha — é sobrescrito/ruído). Sem recorrência, a
  // mediana (comportamento anterior). ──
  const vaos: number[] = [];
  for (const ys of descPorPagina.values())
    for (let i = 0; i + 1 < ys.length; i++) if (ys[i] - ys[i + 1] > 0 && ys[i] - ys[i + 1] <= 40) vaos.push(ys[i] - ys[i + 1]);
  const hDesc = trechosCol.filter((t) => t.col === "descricao" && (t.c.f.h ?? 0) > 0).map((t) => t.c.f.h as number);
  const piso = hDesc.length > 0 ? 0.9 * mediana(hDesc) : 0.6 * mediana(vaos);
  const minimo = Math.max(2, Math.ceil(vaos.length * 0.05));
  const acimaDoPiso = vaos.filter((v) => v >= piso).sort((x, y) => x - y);
  let entrelinha = 0;
  // Janela deslizante (O(n)): quantos vãos caem em ±0,5 de cada candidato, do menor para o maior.
  for (let i = 0, lo = 0, hi = 0; i < acimaDoPiso.length && entrelinha === 0; i++) {
    const v = acimaDoPiso[i];
    while (acimaDoPiso[lo] < v - 0.5) lo++;
    while (hi < acimaDoPiso.length && acimaDoPiso[hi] <= v + 0.5) hi++;
    if (hi - lo >= minimo) entrelinha = v;
  }
  if (entrelinha === 0) entrelinha = mediana(vaos);
  const LIM = entrelinha > 0 ? Math.max(entrelinha * 1.3, entrelinha + 2) : 12;

  // ── Fronteira do TOPO de cada página de continuação: acima do 1º nº há a CAUDA do item anterior e a CABEÇA do
  // 1º item desta página (nº no meio); subindo do nº, a cabeça é contígua (vão ≤ LIM) e o 1º vão > LIM é a borda.
  // Sem borda ⇒ o item anterior terminou na página anterior (tudo é cabeça). ──
  const topCutPorPagina = new Map<number, number>();
  const topoPrimeiro = new Map<number, number>(); // y mais alto do 1º item da página (cabeça incluída)
  for (const [page, g] of porPagina) {
    const acima = (descPorPagina.get(page) ?? []).filter((y) => y > g.topo).sort((x, y) => x - y); // ASC
    let topCut = Number.POSITIVE_INFINITY;
    if (g.first > 0) {
      let prev = g.topo;
      for (const y of acima) {
        if (y - prev <= LIM) prev = y;
        else {
          topCut = y;
          break;
        }
      }
      topCutPorPagina.set(page, topCut);
    }
    topoPrimeiro.set(page, Math.max(g.topo, ...acima.filter((y) => y < topCut)));
  }

  // ── Fronteiras (cuts) entre itens da MESMA página: numa borda (vão > LIM) entre as âncoras. Várias bordas
  // possíveis (linha em branco) ⇒ a que deixa o item simétrico em volta do nº (se o leiaute é centralizado);
  // nenhuma ⇒ a posição simétrica (centralizado) ou o ponto médio das âncoras. ──
  type Faixa = { seq: number[]; cands: number[] };
  const faixas = new Map<number, Faixa[]>();
  // Leiaute CENTRALIZADO (o do Centi: o nº fica no MEIO da célula) é o padrão; só vale "nº no topo" (outro emissor)
  // com evidência: itens com a 1ª linha NA ALTURA do nº e a seguinte logo abaixo, e nenhum com descrição logo ACIMA.
  let votoCentro = 0;
  let votoTopo = 0;
  for (const [page, g] of porPagina) {
    const dys = descPorPagina.get(page) ?? [];
    const lista: Faixa[] = [];
    let p = 0;
    for (let j = 0; j + 1 < g.ys.length; j++) {
      const hiA = g.ys[j];
      const loA = g.ys[j + 1];
      while (p < dys.length && dys[p] >= hiA) p++;
      const seq = [hiA];
      while (p < dys.length && dys[p] > loA) seq.push(dys[p++]);
      seq.push(loA);
      const cands: number[] = [];
      for (let i = 0; i + 1 < seq.length; i++) if (seq[i] - seq[i + 1] > LIM) cands.push(i);
      lista.push({ seq, cands });
    }
    faixas.set(page, lista);
    for (const a of g.ys) {
      if (algumEntre(dys, a + 1, a + LIM)) votoCentro++;
      else if (algumEntre(dys, a - 1, a + 1) && algumEntre(dys, a - LIM, a - 1)) votoTopo++;
    }
  }
  const centrado = votoCentro > 0 || votoTopo === 0;
  const cutsPorPagina = new Map<number, number[]>();
  for (const [page, g] of porPagina) {
    const cuts: number[] = [];
    let topoItem = topoPrimeiro.get(page) ?? g.topo;
    for (const [j, { seq, cands }] of (faixas.get(page) ?? []).entries()) {
      const fundo = 2 * g.ys[j] - topoItem; // base prevista do item j (simétrico em volta do nº)
      const maisPerto = (is: number[]) => is.reduce((m, i) => (Math.abs(seq[i] - fundo) < Math.abs(seq[m] - fundo) ? i : m), is[0]);
      const maiorVao = (is: number[]) => is.reduce((m, i) => (seq[i] - seq[i + 1] > seq[m] - seq[m + 1] ? i : m), is[0]);
      let i = -1;
      if (cands.length === 1) i = cands[0];
      else if (cands.length > 1) i = centrado ? maisPerto(cands) : maiorVao(cands);
      else if (centrado) i = maisPerto(seq.slice(0, -1).map((_, k) => k));
      const cut = i >= 0 ? (seq[i] + seq[i + 1]) / 2 : (g.ys[j] + g.ys[j + 1]) / 2;
      cuts.push(cut);
      topoItem = Math.max(g.ys[j + 1], ...seq.filter((y) => y < cut));
    }
    cutsPorPagina.set(page, cuts);
  }

  // Último item de cada página COM itens → alvo de uma página SÓ de continuação (sem nº).
  const ultimoDaPagina = new Map<number, number>();
  nums.forEach((b, i) => {
    ultimoDaPagina.set(b.page, i);
  });
  const paginasComItem = [...ultimoDaPagina.keys()].sort((x, y) => x - y);
  const itemAntesDaPagina = (page: number): number | undefined => {
    let alvo: number | undefined;
    for (const pg of paginasComItem) {
      if (pg < page) alvo = ultimoDaPagina.get(pg);
      else break;
    }
    return alvo;
  };

  const buckets = nums.map(() => colunasVazias());
  for (const { c, col } of trechosCol) {
    if (col === "item") continue; // célula ITEM sem nº legível: não é dado do item
    const g = porPagina.get(c.f.page);
    const y = yDe(c);
    let b: number | undefined;
    if (!g) b = itemAntesDaPagina(c.f.page); // página sem nº = continuação do último item anterior
    else if (y > g.topo && g.first > 0) {
      // Acima do 1º nº da página: cauda do item anterior (acima da borda) ou cabeça do 1º item desta página.
      b = y >= (topCutPorPagina.get(c.f.page) ?? Number.POSITIVE_INFINITY) ? g.first - 1 : g.first;
    } else if (col === "descricao") b = g.bi[itemPorCuts(cutsPorPagina.get(c.f.page) ?? [], y)];
    else b = g.bi[nearestByY(g.ys, y)]; // código/unidade/valores: na âncora
    if (b != null) buckets[b][col].push(c);
  }
  return nums.map((n, i) => {
    const col = buckets[i];
    // Valores: a linha MAIS PERTO do nº (+ a linha seguinte da coluna, se o número quebrou no separador) — um
    // valor solto que caiu no item (ex.: total geral numa linha própria) não se junta ao valor do item.
    for (const k of COLUNAS_VALOR) {
      if (col[k].length === 0) continue;
      const ks = [...new Set(col[k].map((c) => c.k))].sort((a, b) => a - b);
      const perto = [...ks].sort((a, b) => Math.abs(linhas[a].y - n.y) - Math.abs(linhas[b].y - n.y) || a - b)[0];
      const manter = new Set([perto]);
      const texto0 = col[k].filter((c) => c.k === perto).sort(ordemLeitura).map((c) => c.f.str).join("");
      const seguinte = ks[ks.indexOf(perto) + 1];
      if (/[.,]$/.test(texto0) && seguinte != null) manter.add(seguinte);
      col[k] = col[k].filter((c) => manter.has(c.k));
    }
    return montarItem(n.n, col);
  });
}

/**
 * Lê a TABELA DE ITENS (Seção 4) a partir da linha do cabeçalho (`hi`): varre as linhas (todas as páginas),
 * separa o CORPO (linhas de item) do cabeçalho de coluna repetido, do cabeçalho do documento, do rodapé, do TOTAL
 * GERAL e do texto de APOIO abaixo da tabela, e monta os itens pela GRADE desenhada (quando há) ou pela geometria
 * do texto. `fim` = índice da linha que encerra a tabela (próxima seção); `viaGrade` = os itens vieram da grade.
 */
export function lerTabelaItens(
  linhas: PdfLine[],
  hi: number,
  tracos: PdfTraco[],
): { itens: DfdItemParseado[]; valorTotal: number | null; apoio: string; fim: number; viaGrade: boolean } {
  // Âncoras (x) de cada coluna — "VALOR UNITÁRIO" pode vir só como "UNITÁRIO" numa 2ª linha do cabeçalho.
  const anchors: ColMap = {};
  const rotulos: { key: ColunaItem; x: number; y: number; page: number; w?: number }[] = [];
  for (const off of [0, 1, -1]) {
    const l = linhas[hi + off];
    if (!l) continue;
    for (const it of l.items) {
      const k = HDR[norm(it.str)];
      if (k && anchors[k] == null) {
        anchors[k] = it.x;
        rotulos.push({ key: k, x: it.x, y: it.y, page: it.page, w: it.w });
      }
    }
  }
  const cols = ORDEM_COLUNAS.map((key) => ({ key, x: anchors[key] })).filter((c): c is { key: ColunaItem; x: number } => c.x != null);
  const [c0, c1] = cols;
  const itemBound = c0 && c1 ? (c0.x + c1.x) / 2 : 70;
  const colValoresX = Math.min(anchors.unidade ?? Number.POSITIVE_INFINITY, anchors.quantidade ?? Number.POSITIVE_INFINITY) - 15;
  // Coluna pela posição do rótulo do cabeçalho (ponto médio entre rótulos vizinhos).
  const colunaTexto = (x: number): ColunaItem | undefined => {
    let idx = 0;
    for (let i = 0; i < cols.length - 1; i++) if (x >= (cols[i].x + cols[i + 1].x) / 2) idx = i + 1;
    return cols[idx]?.key;
  };
  // Nº do item: na coluna ITEM e CENTRADO sob o rótulo "ITEM" (com largura conhecida) — um "12" solto do texto de
  // apoio ("12 MESES.", à margem) não vira item.
  const rItem = rotulos.find((r) => r.key === "item");
  const centroItem = rItem?.w != null ? rItem.x + rItem.w / 2 : null;
  const naColunaItem = (i: PdfItem, centrado: boolean) =>
    i.x < itemBound && (!centrado || centroItem == null || i.w == null || Math.abs(i.x + i.w / 2 - centroItem) <= 8);
  // Margem esquerda do documento (títulos de seção e texto de apoio começam nela).
  const xsTitulos = linhas.filter((l) => tituloSecaoPadrao(l.items.map((i) => i.str).join(" ")) != null).map((l) => Math.min(...l.items.map((i) => i.x)));
  const margem = xsTitulos.length > 0 ? mediana(xsTitulos) : null;
  const grade = montarGrade(tracos, rotulos, ["item", "codigo", "descricao"], ["item", "descricao"]);
  const naColunaValorTotal = (i: PdfItem) => (grade ? colunaDe(grade, i.x) : colunaTexto(i.x)) === "valorTotal";
  const direitas: Partial<Record<ColunaItem, number>> = {};
  for (const r of rotulos) if (r.w != null) direitas[r.key] = r.x + r.w;

  // Cabeçalho de coluna repetido a cada página: a linha "ITEM … QUANTIDADE" ou uma linha só com as partes do
  // rótulo dos valores ("VALOR" / "UNITÁRIO") na área dos valores.
  const ehCabecalhoColuna = (l: PdfLine) =>
    ehCabecalhoItens(l) || l.items.every((i) => i.x >= colValoresX && PARTES_CABECALHO.has(norm(i.str)));
  // Próxima seção ("5 - PREVISÃO…") encerra a Seção 4 — só um TÍTULO PADRONIZADO e sem nada nas colunas de
  // unidade/quantidade/valores. Uma LINHA DE ITEM cuja descrição começa com "- " não encerra a tabela.
  const ehSecaoHeading = (l: PdfLine) =>
    tituloSecaoPadrao(l.items.map((i) => i.str).join(" ")) != null && !l.items.some((i) => i.x >= colValoresX);
  // TOTAL GERAL: o rótulo ("VALOR TOTAL") é um trecho próprio NA ÁREA DOS VALORES — "…o valor total…" dentro da
  // descrição não é o total (antes a linha inteira da descrição sumia).
  const ehLinhaTotal = (l: PdfLine) => l.items.some((i) => i.x >= colValoresX && ROTULOS_TOTAL.has(norm(i.str)));

  const varrer = (centrado: boolean) => {
    const corpo: TrechoCorpo[] = [];
    const numeros: NumeroItem[] = [];
    const apoioLinhas: string[] = [];
    let valorTotal: number | null = null;
    let fimTabela = false; // após a última linha de item vem o texto de apoio
    let fim = linhas.length;
    // Páginas cujo CABEÇALHO DE COLUNA já apareceu — acima dele (por página) fica o CABEÇALHO DO DOCUMENTO repetido
    // (ESTADO DE GOIÁS / <órgão> / DOCUMENTO… / Número DFD / Tipo DFD), pulado para não grudar na descrição.
    const viuColuna = new Set<number>([linhas[hi].page]);
    for (let k = hi + 1; k < linhas.length; k++) {
      const l = linhas[k];
      const joined = norm(l.items.map((i) => i.str).join(" "));
      const minx = Math.min(...l.items.map((i) => i.x));
      // Nº do item da linha (pedaços do nº partido pelo PDF são reunidos).
      const frNum = l.items.filter((i) => naColunaItem(i, centrado)).sort((a, b) => a.x - b.x);
      const mNum = frNum.map((i) => i.str).join("").match(RE_NUMERO_ITEM);

      // Só uma seção "N - …" À MARGEM ESQUERDA encerra a tabela; um "2-52" no meio de uma descrição não é seção.
      if (minx < itemBound && ehSecaoHeading(l)) {
        fim = k;
        break;
      }
      if (ehCabecalhoColuna(l)) {
        viuColuna.add(l.page);
        // A tabela CONTINUA nesta página: o que parecia apoio na página anterior era rodapé (não perde itens).
        if (fimTabela) {
          fimTabela = false;
          apoioLinhas.length = 0;
        }
        continue;
      }
      if (!viuColuna.has(l.page)) continue; // cabeçalho do documento (antes do cabeçalho de coluna desta página)
      // Rodapé (Centi/Emitido/Página) e afins: à MARGEM e sem nº — uma descrição que começa com "CENTÍMETROS…" fica.
      if (!mNum && minx < itemBound && ehRuido(joined)) continue;
      // Linha do TOTAL GERAL — captura, mas NÃO encerra.
      if (!mNum && ehLinhaTotal(l)) {
        const v = l.items.filter((i) => naColunaValorTotal(i) && /\d/.test(i.str)).sort((a, b) => a.x - b.x);
        if (v.length > 0) valorTotal = numeroDfd(v.map((i) => i.str).join(""));
        continue;
      }
      // Texto de apoio: prosa À MARGEM (sem nº de item) DEPOIS da tabela.
      if (fimTabela || (!mNum && minx < itemBound && (margem == null || minx <= margem + 4))) {
        fimTabela = true;
        apoioLinhas.push(l.items.map((i) => i.str).join(" "));
        continue;
      }
      // Linha de item.
      if (mNum) numeros.push({ page: l.page, y: l.y, n: Number(mNum[1]), fr: frNum });
      for (const f of l.items) corpo.push({ f, k });
    }
    return { corpo, numeros, apoioLinhas, valorTotal, fim };
  };
  // Nº CENTRADO sob o rótulo "ITEM" (o Centi); se nenhum aparece assim (outro emissor alinha diferente), vale
  // qualquer nº na coluna ITEM — nunca "nenhum item" por causa do alinhamento.
  let varredura = varrer(true);
  if (varredura.numeros.length === 0) varredura = varrer(false);
  const { corpo, numeros, apoioLinhas, valorTotal, fim } = varredura;
  const pelaGrade = grade ? itensPelaGrade(corpo, grade, numeros.length) : null;
  return {
    itens: pelaGrade ?? itensPelaGeometria(corpo, numeros, linhas, anchors, direitas),
    valorTotal,
    apoio: apoioLinhas.join(" ").replace(/\s+/g, " ").trim(),
    fim,
    viaGrade: pelaGrade != null,
  };
}

export function parseDfdFromPdfItems(
  bruto: PdfItem[],
  nomeArquivo: string,
  // Texto RENDERIZADO POR PÁGINA (Dropsigner) — `string[]` (uma entrada por página, na ordem)
  // permite parear o bloco ao código da própria página e descartar anexos; um único texto
  // também é aceito (1 página). Vazio ⇒ sem Dropsigner.
  textosRender: string | string[] = [],
  // Traços desenhados das páginas (bordas das células — `tracosDaOpList`): com eles, a tabela de itens é lida
  // pela GRADE (exata). Vazio ⇒ geometria do texto.
  tracos: PdfTraco[] = [],
): DfdParseado {
  // Tira a assinatura (em QUALQUER lugar: coluna, sobre o texto, marca d'água) da camada de texto ANTES de
  // reconstruir as linhas — senão vaza p/ as seções/itens. As assinaturas A/B são lidas das linhas BRUTAS.
  const normalizados = normalizar(bruto);
  const items = limparAssinaturasDoTexto(normalizados);
  const linhas = agruparLinhas(items);
  const lineTexts = linhas.map((l) => l.items.map((i) => i.str).join(" "));
  const lineTextsBrutos = items.length === normalizados.length ? lineTexts : linhasDeTexto(normalizados);

  const cab = extrairCabecalho(lineTexts);

  // ---- Tabela (Seção 4) ----
  const hi = linhas.findIndex(ehCabecalhoItens);
  const tabela = hi >= 0 ? lerTabelaItens(linhas, hi, tracos) : null;
  const itens: DfdItemParseado[] = tabela?.itens ?? [];
  const valorTotalGrand = tabela?.valorTotal ?? null;
  const apoioSecao4 = tabela?.apoio ?? "";
  // Índice da linha onde a tabela ENCERRA (próxima seção) — o `coletarSecoes` recebe só as linhas FORA da tabela.
  const tableEndIdx = tabela?.fim ?? linhas.length;

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
    // Formatos A/B (páginas de assinatura, texto normal) + C Dropsigner + D Adobe/ICP-Brasil (ambos
    // do texto RENDERIZADO por página, que inclui a aparência das anotações de assinatura).
    assinaturas: [
      ...extrairAssinaturas(lineTextsBrutos),
      ...assinaturasDropsignerDeTexto(textosRender),
      ...assinaturasAdobeDeTexto(textosRender),
    ],
  };
}
