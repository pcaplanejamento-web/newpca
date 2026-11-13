/**
 * Conferência DFD do sistema × DFD lido na Centi — TODAS as informações (cabeçalho, seções e itens), pela MESMA régua
 * do reenvio/sobrescrita (`compararDfd`). Puro: devolve as diferenças em frases curtas "sistema × Centi".
 */
import { type ComparacaoDfd, compararDfd, type DfdComparavel } from "./comparar-protocolo.ts";
import { normalizarSecoesDfd } from "./dfd-tratamento.ts";
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
      // O total do item = quantidade × valor unitário: só aparece quando nenhum dos dois mudou.
      const qv = it.campos.some((f) => f.campo === "quantidade" || f.campo === "valorUnitario");
      const partes = it.campos.filter((f) => !(qv && f.campo === "valorTotal")).map((f) => {
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
  const partes = (t.includes(SEPARADOR_DIVERGENCIAS) ? t.split(SEPARADOR_DIVERGENCIAS) : t.split(/;\s+/)).map((x) => x.trim()).filter(Boolean);
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
