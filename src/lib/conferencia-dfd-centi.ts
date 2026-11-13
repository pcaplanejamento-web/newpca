/**
 * Conferência DFD do sistema × DFD lido na Centi — TODAS as informações (cabeçalho, seções e itens), pela MESMA régua
 * do reenvio/sobrescrita (`compararDfd`). Puro: devolve as diferenças em frases curtas "sistema × Centi".
 */
import { type ComparacaoDfd, compararDfd, type DfdComparavel } from "./comparar-protocolo.ts";
import { normalizarSecoesDfd } from "./dfd-tratamento.ts";
import type { BlocoDoc } from "./documento-pdf-core.ts";
import { normTexto } from "./fluxo-core.ts";
import { brl, num } from "./format.ts";
import { type DfdParseado, normComparacao } from "./parse-dfd-comum.ts";

/** O DFD do sistema como o `GET /api/dfd/[id]` devolve (o que importa aqui). */
export type DfdSistemaComparavel = Omit<DfdComparavel, "anoPca" | "reparticaoId"> & { anoPca?: number | null; protocoloAnoPca?: number | null };

/** Teto do motivo gravado — cabe a lista inteira das divergências de um DFD grande (a rota aceita até 20 mil). */
export const MAX_MOTIVO_CENTI = 19_000;
/** Separador entre as divergências no motivo gravado: numa linha só a tela mostra "a; b"; a lista o separa sem ambiguidade
 * (os textos das divergências nunca têm quebra de linha). */
export const SEPARADOR_DIVERGENCIAS = ";\n";
const CORTE = 60;

const txt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const curto = (v: unknown) => {
  const t = txt(v);
  if (!t) return "vazio";
  return t.length > CORTE ? `“${t.slice(0, CORTE - 1)}…”` : `“${t}”`;
};
const moeda = (v: number | null | undefined) => (v == null ? "—" : brl(v));
const qtd = (v: number | null | undefined) => (v == null ? "—" : num(v));

/** Cópia para COMPARAR: textos sem pontuação/espaços/caixa/acento — a quebra de linha ou uma vírgula não é diferença. */
function paraComparar(d: DfdComparavel): DfdComparavel {
  const n = (v: string | null) => (v == null ? null : normComparacao(v));
  return {
    ...d,
    objeto: n(d.objeto),
    orgaoEntidade: n(d.orgaoEntidade),
    setorRequisitante: n(d.setorRequisitante),
    responsavel: n(d.responsavel),
    matricula: n(d.matricula),
    email: n(d.email),
    telefone: d.telefone == null ? null : d.telefone.replace(/\D/g, ""),
    secoes: d.secoes.map((s) => ({ titulo: s.titulo, texto: normComparacao(s.texto) })),
    itens: d.itens.map((i) => ({ ...i, codigo: i.codigo == null ? null : String(i.codigo).replace(/\D/g, ""), descricao: i.descricao == null ? null : normComparacao(i.descricao), unidade: i.unidade == null ? null : normComparacao(i.unidade) })),
  };
}

const rotuloItem = (i: { item: number | null; codigo: string | null }) => `Item ${i.item ?? "?"}${txt(i.codigo) ? ` (cód. ${txt(i.codigo)})` : ""}`;

/**
 * As diferenças entre o DFD do sistema e o da Centi, cada uma uma frase ("Objeto: “…” no sistema × “…” na Centi").
 * Fora da comparação: unidade e ano do PCA (só do sistema), assinaturas (a do sistema é validada; o PDF lido sem OCR
 * não a traz), nº de planejamento (já conferido), nº do DFD e tipo (o resumo os aponta). O valor total usa a
 * `tolerancia`; as seções da Centi passam pela MESMA normalização da importação (prioridade/previsão).
 */
export function diferencasDfdCenti(sistema: DfdSistemaComparavel, centi: DfdParseado, tolerancia = 0.01): string[] {
  const anoPca = sistema.anoPca ?? sistema.protocoloAnoPca ?? null;
  const c = normalizarSecoesDfd(centi, undefined, anoPca).dfd;
  const base = { anoPca: null, reparticaoId: null, assinaturas: [] };
  const a: DfdComparavel = { ...sistema, ...base, tipo: null, planejamento: null, valorTotal: 0 };
  const b: DfdComparavel = { ...c, ...base, tipo: null, planejamento: null, valorTotal: 0 };
  const r: ComparacaoDfd = compararDfd(paraComparar(a), paraComparar(b));
  const out: string[] = [];
  for (const d of r.campos) {
    const k = d.campo as keyof DfdComparavel;
    out.push(`${d.rotulo}: ${curto(a[k])} no sistema × ${curto(b[k])} na Centi`);
  }
  const vs = sistema.valorTotal ?? 0;
  const vc = c.valorTotal ?? 0;
  if (Math.abs(vs - vc) > tolerancia) out.push(`Valor total: ${moeda(vs)} no sistema × ${moeda(vc)} na Centi`);
  if (a.itens.length !== b.itens.length) out.push(`Nº de itens: ${a.itens.length} no sistema × ${b.itens.length} na Centi`);
  for (const s of r.secoes) {
    const so = s.antes === "—" ? " (só na Centi)" : s.depois === "—" ? " (só no sistema)" : "";
    out.push(`Seção ${txt(s.rotulo) || "sem título"} diferente${so}`);
  }
  for (const it of r.itens) {
    if (it.tipo === "novo") {
      const j = Number(it.chave?.split(":")[1]);
      out.push(`${rotuloItem(b.itens[j] ?? it)} só na Centi`);
    } else if (it.tipo === "removido") {
      const i = Number(it.chave?.split(":")[1]);
      out.push(`${rotuloItem(a.itens[i] ?? it)} só no sistema`);
    } else {
      const [, gi, pj] = (it.chave ?? "").split(":").map(Number);
      const x = a.itens[gi];
      const y = b.itens[pj];
      if (!x || !y) continue;
      // A TOLERÂNCIA vale também nos valores do item (centavos de arredondamento não são divergência).
      const dentro = (u: number | null | undefined, v: number | null | undefined) => u != null && v != null && Math.abs(u - v) <= tolerancia;
      const campos = it.campos.filter(
        (f) => !((f.campo === "valorUnitario" && dentro(x.valorUnitario, y.valorUnitario)) || (f.campo === "valorTotal" && dentro(x.valorTotal, y.valorTotal))),
      );
      if (!campos.length) continue;
      // O total do item = quantidade × valor unitário: só aparece quando nenhum dos dois mudou.
      const qv = campos.some((f) => f.campo === "quantidade" || f.campo === "valorUnitario");
      const partes = campos.filter((f) => !(qv && f.campo === "valorTotal")).map((f) => {
        if (f.campo === "quantidade") return `quantidade ${qtd(x.quantidade)} × ${qtd(y.quantidade)}`;
        if (f.campo === "valorUnitario") return `valor unitário ${moeda(x.valorUnitario)} × ${moeda(y.valorUnitario)}`;
        if (f.campo === "valorTotal") return `valor total ${moeda(x.valorTotal)} × ${moeda(y.valorTotal)}`;
        if (f.campo === "item") return `nº ${x.item ?? "—"} × ${y.item ?? "—"}`;
        if (f.campo === "codigo") return `código ${txt(x.codigo) || "—"} × ${txt(y.codigo) || "—"}`;
        if (f.campo === "unidade") return `medida ${txt(x.unidade) || "—"} × ${txt(y.unidade) || "—"}`;
        return `descrição ${curto(x.descricao)} × ${curto(y.descricao)}`;
      });
      out.push(`${rotuloItem(x)}: ${partes.join(", ")} (sistema × Centi)`);
    }
  }
  return out;
}

/** O motivo: "<ref>: N diferença(s) — a;⏎b;⏎…" com o teto `max` ("e mais N" só quando não cabe). */
export function motivoDivergencias(ref: string, difs: string[], max = MAX_MOTIVO_CENTI): string {
  const cab = `${ref}: ${difs.length} diferença${difs.length === 1 ? "" : "s"} — `;
  let corpo = "";
  let usados = 0;
  for (const d of difs) {
    const resto = difs.length - usados - 1;
    const fim = resto > 0 ? `${SEPARADOR_DIVERGENCIAS}e mais ${resto}` : "";
    const prox = corpo ? `${corpo}${SEPARADOR_DIVERGENCIAS}${d}` : d;
    if ((cab + prox + fim).length > max && usados > 0) break;
    corpo = prox;
    usados++;
  }
  const faltam = difs.length - usados;
  return `${cab}${corpo}${faltam > 0 ? `${SEPARADOR_DIVERGENCIAS}e mais ${faltam}` : ""}`.slice(0, max);
}

export type GrupoDivergencias = { titulo: string | null; itens: string[] };

const CABECALHO = /^(.+?): (\d+) diferenças? — ([\s\S]*)$/;

/**
 * As divergências de um motivo gravado, para LISTAR: um grupo por DFD/origem ("DFD 1 (Planej. 2): 3 diferenças") com cada
 * divergência. Lê o formato atual (";⏎") e o anterior ("; " numa linha). Vazio = nenhum grupo.
 */
export function divergenciasDoMotivo(motivo: string | null | undefined): GrupoDivergencias[] {
  const t = String(motivo ?? "").trim();
  if (!t) return [];
  // Sem o separador atual: o formato antigo ("; " numa linha) — menos o motivo de UMA diferença, que nunca se parte
  // (um "; " dentro da descrição do item não é uma divergência nova).
  const uma = /^.+?: 1 diferença — /.test(t);
  const partes = (t.includes(SEPARADOR_DIVERGENCIAS) ? t.split(SEPARADOR_DIVERGENCIAS) : uma ? [t] : t.split(/;\s+/)).map((x) => x.trim()).filter(Boolean);
  const grupos: GrupoDivergencias[] = [];
  let atual: GrupoDivergencias | null = null;
  for (const p of partes) {
    const m = CABECALHO.exec(p);
    if (m) {
      atual = { titulo: `${m[1]}: ${m[2]} diferença${m[2] === "1" ? "" : "s"}`, itens: [] };
      grupos.push(atual);
      if (m[3].trim()) atual.itens.push(m[3].trim());
      continue;
    }
    if (!atual) {
      atual = { titulo: null, itens: [] };
      grupos.push(atual);
    }
    atual.itens.push(p);
  }
  return grupos;
}

/** Quantas divergências o motivo lista (o "e mais N" conta as N). */
export function contarDivergencias(grupos: GrupoDivergencias[]): number {
  let n = 0;
  for (const g of grupos)
    for (const i of g.itens) {
      const m = /^e mais (\d+)$/.exec(i);
      n += m ? Number(m[1]) : 1;
    }
  return n;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const CAMPOS_ITEM: [RegExp, string][] = [
  [/(^|, )quantidade /, "Item: quantidade"],
  [/(^|, )valor unitario /, "Item: valor unitário"],
  [/(^|, )valor total /, "Item: valor total"],
  [/(^|, )descricao /, "Item: descrição"],
  [/(^|, )codigo /, "Item: código"],
  [/(^|, )medida /, "Item: medida"],
  [/(^|, )n[ºo°] /, "Item: nº"],
];

/**
 * O(s) TIPO(s) de UMA divergência (o texto gravado), para FILTRAR: "Valor total", "Seção JUSTIFICATIVA", "Item só na Centi",
 * "Item: quantidade"… O item com vários campos dá um tipo por campo. "e mais N" não tem tipo. Desconhecido = "Outras".
 */
export function tiposDivergencia(texto: string): string[] {
  const t0 = String(texto ?? "").trim();
  if (!t0 || /^e mais \d+$/.test(t0)) return [];
  const n = semAcento(t0);
  const sec = /^Seção (.+?) diferente(?: \(só (?:na Centi|no sistema)\))?$/.exec(t0);
  if (sec) return [`Seção ${sec[1].replace(/^\d+\s*[-.–]\s*/, "")}`];
  if (/^item .+ so na centi$/.test(n)) return ["Item só na Centi"];
  if (/^item .+ so no sistema$/.test(n)) return ["Item só no sistema"];
  const item = /^item [^:]+: (.+) \(sistema × centi\)$/.exec(n);
  if (item) {
    const r = CAMPOS_ITEM.filter(([re]) => re.test(item[1])).map(([, t]) => t);
    return r.length ? r : ["Item: outros"];
  }
  if (/nao encontrado na centi|nao esta na cm002/.test(n)) return ["Não encontrado na Centi"];
  if (/^achado na centi no orgao|^[^:]*: na cm002 esta na entidade/.test(n)) return ["Órgão"];
  if (/situacao .+ na (centi|cm002)/.test(n)) return ["Situação"];
  if (/^na centi e o dfd /.test(n)) return ["Nº do DFD"];
  if (/^tipo: /.test(n)) return ["Tipo"];
  if (/^valor total: |: valor .+ no dfd × .+ na cm002/.test(n)) return ["Valor total"];
  if (/^n[ºo°] de itens: /.test(n)) return ["Nº de itens"];
  if (/^objeto: |^objeto diferente/.test(n)) return ["Objeto"];
  const rot = /^([^:]{1,40}): .+ no sistema × .+ na centi$/i.exec(t0.replace(/\s+/g, " "));
  if (rot) return [rot[1].trim()];
  return ["Outras"];
}

/** Os tipos de TODAS as divergências de um motivo gravado (sem repetir, na ordem em que aparecem). */
export function tiposDoMotivo(motivo: string | null | undefined): string[] {
  const chave = String(motivo ?? "");
  const memo = MEMO_TIPOS.get(chave);
  if (memo) return memo;
  const s = new Set<string>();
  for (const g of divergenciasDoMotivo(chave)) for (const i of g.itens) for (const t of tiposDivergencia(i)) s.add(t);
  const r = [...s];
  if (MEMO_TIPOS.size >= 2000) MEMO_TIPOS.clear();
  MEMO_TIPOS.set(chave, r);
  return r;
}
// Os filtros da tabela relêem os valores de cada linha a cada mudança: o motivo (até 19 mil caracteres) é classificado uma vez.
const MEMO_TIPOS = new Map<string, string[]>();

// ---------------------------------------------------------------------------
// Leituras do motivo gravado (a Mesa): Δ do valor, divergências de UM item, desatualizada, histórico e relatório.
// ---------------------------------------------------------------------------

const numeroBR = (t: string): number | null => {
  const s = t.replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

/** Δ do VALOR TOTAL = sistema − Centi, lido do motivo ("Valor total: R$ a no sistema × R$ b na Centi" ou o da CM002
 * "valor a no DFD × b na CM002"); null = sem diferença de valor apontada. */
export function deltaValorDoMotivo(motivo: string | null | undefined): number | null {
  for (const g of divergenciasDoMotivo(motivo))
    for (const i of g.itens) {
      const m = /^Valor total: (.+?) no sistema × (.+?) na Centi$/.exec(i) ?? /: valor (.+?) no DFD × (.+?) na CM002$/.exec(i);
      if (!m) continue;
      const a = numeroBR(m[1]);
      const b = numeroBR(m[2]);
      if (a != null && b != null) return Math.round((a - b) * 100) / 100;
    }
  return null;
}

/** As divergências de UM item do DFD (pelo nº do item: "Item 4 (cód. 12): …", "Item 4 só no sistema"). */
export function divergenciasDoItem(motivo: string | null | undefined, item: number | null | undefined): string[] {
  if (item == null || !Number.isFinite(item)) return [];
  const re = new RegExp(`^Item ${item}(?=[\\s:(]|$)`);
  // "Item N só na Centi" leva o nº do item DA CENTI (não há item no sistema): não pertence a nenhum item do sistema.
  return divergenciasDoMotivo(motivo).flatMap((g) => g.itens.filter((i) => re.test(i) && !/ só na Centi$/.test(i)));
}

/** Um instante do banco ("AAAA-MM-DD HH:MM:SS" em UTC, do CURRENT_TIMESTAMP) ou ISO → ms; null se não der. */
function instante(v: string | null | undefined): number | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(t) ? `${t.replace(" ", "T")}Z` : t;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : null;
}

/** A conferência ficou VELHA: o DFD foi gravado DEPOIS dela (o resultado pode não valer mais — "Reconferir"). */
export function conferenciaDesatualizada(conferidoEm: string | null | undefined, atualizadoEm: string | null | undefined): boolean {
  const c = instante(conferidoEm);
  const a = instante(atualizadoEm);
  return c != null && a != null && a > c + 1000;
}

/** Duas conferências do MESMO DFD comparadas pelos textos das divergências: o que foi resolvido, o que é novo. */
export function comparacaoConferencias(antes: string | null | undefined, depois: string | null | undefined): { resolvidas: string[]; novas: string[]; mantidas: number } {
  const lista = (m: string | null | undefined) => divergenciasDoMotivo(m).flatMap((g) => g.itens).filter((i) => !/^e mais \d+$/.test(i));
  const a = new Set(lista(antes));
  const d = new Set(lista(depois));
  return { resolvidas: [...a].filter((x) => !d.has(x)), novas: [...d].filter((x) => !a.has(x)), mantidas: [...d].filter((x) => a.has(x)).length };
}

/** Um DFD no RELATÓRIO da conferência. */
export type DfdRelatorioCenti = { numero: string; planejamento: string | null; sigla: string | null; protocolo?: string | null; motivo: string | null };
export type FormatoRelatorioCenti = "despacho" | "whatsapp" | "lista";

const refRel = (d: DfdRelatorioCenti) => `DFD ${d.numero}${d.planejamento ? ` (Planej. ${d.planejamento})` : ""}${d.sigla ? ` — ${d.sigla}` : ""}`;
const itensDe = (d: DfdRelatorioCenti) => divergenciasDoMotivo(d.motivo).flatMap((g) => g.itens);

/** Os tipos com os DFDs que os têm (o tipo mais frequente primeiro). */
export function relatorioPorTipo(dfds: readonly DfdRelatorioCenti[]): { tipo: string; dfds: DfdRelatorioCenti[] }[] {
  const m = new Map<string, DfdRelatorioCenti[]>();
  for (const d of dfds) for (const t of tiposDoMotivo(d.motivo)) m.set(t, [...(m.get(t) ?? []), d]);
  return [...m].map(([tipo, ds]) => ({ tipo, dfds: ds })).sort((a, b) => b.dfds.length - a.dfds.length || a.tipo.localeCompare(b.tipo, "pt-BR"));
}

/** O TEXTO do relatório (despacho de devolução, WhatsApp ou lista simples): o resumo por tipo e, por DFD, cada divergência. */
export function textoRelatorioCenti(dfds: readonly DfdRelatorioCenti[], formato: FormatoRelatorioCenti): string {
  const tipos = relatorioPorTipo(dfds);
  const negrito = (t: string) => (formato === "whatsapp" ? `*${t}*` : t);
  const linhas: string[] = [];
  if (formato === "despacho") {
    linhas.push("Senhor(a) responsável,", "");
    linhas.push(`Na conferência com o sistema Centi, ${dfds.length === 1 ? "o DFD abaixo apresentou divergências" : `os ${dfds.length} DFDs abaixo apresentaram divergências`} entre os dados cadastrados na Plataforma PCA e os registrados na Centi. Solicitamos a verificação e a correção, conforme o caso:`, "");
  } else linhas.push(negrito(`Divergências com a Centi — ${dfds.length} DFD${dfds.length === 1 ? "" : "s"}`), "");
  linhas.push(negrito("Resumo por tipo:"));
  for (const t of tipos) linhas.push(`- ${t.tipo}: ${t.dfds.length} DFD${t.dfds.length === 1 ? "" : "s"}`);
  linhas.push("");
  for (const d of dfds) {
    linhas.push(negrito(`${refRel(d)}${d.protocolo ? ` · Protocolo ${d.protocolo}` : ""}`));
    for (const i of itensDe(d)) linhas.push(`- ${i}`);
    linhas.push("");
  }
  if (formato === "despacho") linhas.push("Respeitosamente");
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Os BLOCOS do PDF do relatório (o gerador de documento A4): resumo, a tabela por tipo e, por DFD, as divergências. */
export function blocosRelatorioCenti(dfds: readonly DfdRelatorioCenti[], geradoEm: string): { titulo: string; blocos: BlocoDoc[] } {
  const tipos = relatorioPorTipo(dfds);
  const total = dfds.reduce((s, d) => s + contarDivergencias(divergenciasDoMotivo(d.motivo)), 0);
  const blocos: BlocoDoc[] = [
    { tipo: "titulo", texto: "Divergências com a Centi" },
    { tipo: "paragrafo", texto: `Conferência dos DFDs da Plataforma PCA com o sistema Centi — gerado em ${geradoEm}.`, cor: "muted" },
    {
      tipo: "destaques",
      itens: [
        { rotulo: "DFDs divergentes", valor: String(dfds.length) },
        { rotulo: "Divergências", valor: String(total) },
        { rotulo: "Tipos", valor: String(tipos.length) },
      ],
    },
    { tipo: "secao", texto: "Resumo por tipo de divergência" },
    {
      tipo: "tabela",
      colunas: [
        { titulo: "Tipo", peso: 3 },
        { titulo: "DFDs", peso: 1, alinhar: "center" },
      ],
      linhas: tipos.map((t) => ({ celulas: [t.tipo, String(t.dfds.length)] })),
      vazio: "Nenhuma divergência.",
    },
    { tipo: "secao", texto: "Divergências por DFD" },
  ];
  for (const d of dfds) {
    blocos.push({ tipo: "subsecao", texto: refRel(d), detalhe: d.protocolo ? `Protocolo ${d.protocolo}` : undefined });
    blocos.push({ tipo: "lista", itens: itensDe(d) });
  }
  return { titulo: "Divergências com a Centi", blocos };
}

/** O que FAZER com cada tipo de divergência (o painel do selo, abaixo da lista). Só os tipos presentes, sem repetir. */
export function orientacoesDivergencias(tipos: readonly string[]): string[] {
  const s = new Set(tipos);
  const out: string[] = [];
  const algum = (...ts: string[]) => ts.some((t) => s.has(t));
  if (algum("Situação")) out.push("Situação na Centi (ex.: cancelado): confira o planejamento na Centi; se não vale mais, exclua o DFD da Mesa.");
  if (algum("Órgão")) out.push("Órgão: confira o “ID na Centi” do órgão em Órgãos e Unidades.");
  if (algum("Não encontrado na Centi", "Nº do DFD")) out.push("Não encontrado ou outro DFD na Centi: confira o nº de planejamento do DFD.");
  const dados = [...s].some((t) => t.startsWith("Item") || t.startsWith("Seção") || ["Valor total", "Nº de itens", "Objeto", "Tipo"].includes(t));
  if (dados || [...s].some((t) => !/^(Situação|Órgão|Não encontrado na Centi|Nº do DFD|Outras)$/.test(t) && !t.startsWith("Item") && !t.startsWith("Seção")))
    out.push("Dados diferentes: se a Centi está certa, use “Usar os dados da Centi” (o DFD é regravado com os dados de lá); se o sistema está certo, corrija na Centi e reconfira.");
  return out;
}

// ---------------------------------------------------------------------------
// O RETRATO da Centi: o DFD lido na conferência, GUARDADO (a correção campo a campo e a reconferência sem a extensão).
// ---------------------------------------------------------------------------

const str = (v: unknown) => (v == null ? "" : typeof v === "object" ? "" : String(v).trim());

/** O tipo do DFD em uma letra (S/R/O/E) — "DFD-S", "DFD - S", "Serviço"…; desconhecido = null. */
export const tipoCurto = (t: unknown): string | null => {
  const c = (/DFD-?\s*([SROE])\b/i.exec(str(t))?.[1] ?? normTexto(t).slice(0, 1)).toUpperCase();
  return /^[SROE]$/.test(c) ? c : null;
};

/** O DFD conferido (o lado do sistema): nº, tipo e o órgão (o cadastrado e o em que foi achado na Centi). */
export type DfdConferido = { numero?: unknown; tipo?: unknown; entidade?: unknown; entidadeAchada?: unknown };
/** O que a Centi diz do planejamento: a situação, o nº do DFD e o tipo. */
export type ResumoCenti = { situacao?: unknown; numero?: unknown; tipo?: unknown };

/** As divergências de IDENTIDADE (órgão, situação, nº do DFD, tipo) — as MESMAS na automação e na reconferência. */
export function difsIdentidadeCenti(d: DfdConferido, x: ResumoCenti): string[] {
  const difs: string[] = [];
  if (str(d.entidadeAchada) && str(d.entidadeAchada) !== str(d.entidade))
    difs.push(`achado na Centi no órgão ${str(d.entidadeAchada)}, mas o DFD está cadastrado no órgão ${str(d.entidade) || "sem ID"}`);
  if (/CANCEL/.test(normTexto(x.situacao))) difs.push(`situação ${str(x.situacao)} na Centi`);
  if (str(x.numero) && str(x.numero).replace(/^0+/, "") !== str(d.numero).replace(/^0+/, "")) difs.push(`na Centi é o DFD ${str(x.numero)}`);
  if (tipoCurto(d.tipo) && tipoCurto(x.tipo) && tipoCurto(d.tipo) !== tipoCurto(x.tipo)) difs.push(`Tipo: ${str(d.tipo)} no sistema × ${str(x.tipo)} na Centi`);
  return difs;
}

/** O retrato guardado: o DFD da Centi COMO LIDO (sem as assinaturas — a do sistema é a validada) + o que a conferência
 * usou (situação, órgãos, opções) — refazer a conferência com ele dá o MESMO resultado da automação. */
export type RetratoCenti = {
  v: 1;
  dfd: DfdParseado;
  situacao: string;
  entidade: string;
  entidadeAchada: string;
  objeto: boolean;
  tolerancia: number;
  /** O tipo e o nº do DFD como o LOAD da Centi os deu (a automação compara a identidade por eles, não pelo PDF). */
  tipoCenti?: string | null;
  numeroCenti?: string | null;
};
/** Teto do retrato guardado (uma linha do D1 tem até 2 MB): DFDs gigantes ficam sem retrato (corrigir pelo PDF). */
export const MAX_RETRATO = 1_500_000;

export function montarRetrato(d: DfdConferido, x: ResumoCenti, dfdCenti: DfdParseado, o: { objeto: boolean; tolerancia: number }): RetratoCenti {
  const { assinaturas: _a, ...resto } = dfdCenti;
  return {
    v: 1,
    dfd: { ...resto, assinaturas: [] },
    situacao: str(x.situacao),
    entidade: str(d.entidade),
    entidadeAchada: str(d.entidadeAchada),
    objeto: o.objeto,
    tolerancia: Number.isFinite(o.tolerancia) && o.tolerancia >= 0 ? o.tolerancia : 0.01,
    tipoCenti: str(x.tipo) || null,
    numeroCenti: str(x.numero) || null,
  };
}

/** O retrato em texto para gravar; `null` acima do teto. */
export function textoRetrato(r: RetratoCenti): string | null {
  const t = JSON.stringify(r);
  return t.length > MAX_RETRATO ? null : t;
}

/** Qualquer texto gravado → o retrato (ou `null` se não for um). */
export function lerRetrato(t: string | null | undefined): RetratoCenti | null {
  if (!t) return null;
  try {
    const r = JSON.parse(t) as Partial<RetratoCenti>;
    const d = r?.dfd as DfdParseado | undefined;
    if (r?.v !== 1 || !d || !Array.isArray(d.itens) || !Array.isArray(d.secoes)) return null;
    return {
      v: 1,
      dfd: { ...d, assinaturas: [] },
      situacao: str(r.situacao),
      entidade: str(r.entidade),
      entidadeAchada: str(r.entidadeAchada),
      objeto: r.objeto !== false,
      tolerancia: typeof r.tolerancia === "number" && r.tolerancia >= 0 ? r.tolerancia : 0.01,
      // Retrato antigo (sem a identidade do load): a do PDF.
      tipoCenti: "tipoCenti" in r ? str(r.tipoCenti) || null : d.tipo,
      numeroCenti: "numeroCenti" in r ? str(r.numeroCenti) || null : d.numero,
    };
  } catch {
    return null;
  }
}

/** A conferência REFEITA com o retrato (o DFD do sistema como está agora): as MESMAS divergências da automação. */
export function difsDoRetrato(sistema: DfdSistemaComparavel & { numero: string; tipo: string | null }, r: RetratoCenti): string[] {
  const id = difsIdentidadeCenti({ numero: sistema.numero, tipo: sistema.tipo, entidade: r.entidade, entidadeAchada: r.entidadeAchada }, { situacao: r.situacao, numero: r.numeroCenti, tipo: r.tipoCenti });
  const resto = diferencasDfdCenti(sistema, r.dfd, r.tolerancia).filter((f) => r.objeto || !f.startsWith("Objeto:"));
  return [...id, ...resto];
}

/** A conferência como a Mesa guarda: status + motivo (o MESMO formato da automação). */
export function conferenciaDoRetrato(sistema: DfdSistemaComparavel & { numero: string; planejamento: string | null; tipo: string | null }, r: RetratoCenti): { status: "convergente" | "divergente"; motivo: string | null } {
  const difs = difsDoRetrato(sistema, r);
  if (!difs.length) return { status: "convergente", motivo: null };
  return { status: "divergente", motivo: motivoDivergencias(`DFD ${sistema.numero} (Planej. ${sistema.planejamento ?? ""})`, difs) };
}

// ---------------------------------------------------------------------------
// ACEITAR a divergência (a Centi é que está errada): a ressalva vale para AQUELE motivo — outra divergência a derruba.
// ---------------------------------------------------------------------------

/** Assinatura curta do motivo (FNV-1a 32 bits) — a mesma no servidor e na tela. */
export function chaveMotivo(motivo: string | null | undefined): string {
  let h = 0x811c9dc5;
  const t = String(motivo ?? "");
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export type AceiteCenti = { chave: string; justificativa: string; por: string; em: string };
export const MIN_JUSTIFICATIVA = 10;
export const MAX_JUSTIFICATIVA = 500;

export function lerAceite(t: string | null | undefined): AceiteCenti | null {
  if (!t) return null;
  try {
    const a = JSON.parse(t) as Partial<AceiteCenti>;
    return a && typeof a.chave === "string" && typeof a.justificativa === "string" ? { chave: a.chave, justificativa: a.justificativa, por: str(a.por), em: str(a.em) } : null;
  } catch {
    return null;
  }
}

/** O aceite vale: a divergência é a MESMA que foi aceita (uma nova conferência com outra divergência o derruba). */
export const aceiteVale = (status: string | null | undefined, motivo: string | null | undefined, aceite: AceiteCenti | null) =>
  status === "divergente" && !!aceite && aceite.chave === chaveMotivo(motivo);
