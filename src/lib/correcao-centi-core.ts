/**
 * CORRIGIR O DFD DO SISTEMA PELA CENTI (puro, testado em `tests/correcao-centi.test.ts`): a partir do RETRATO guardado na
 * conferência, monta o DFD "novo" da Centi e decide — pela MESMA régua da conferência (textos sem pontuação/caixa/acento,
 * a tolerância nos valores) — quais dados DIVERGEM. O banner usa as escolhas da sobrescrita (Manter sistema | Usar Centi)
 * com só as divergências já marcadas "Usar Centi"; a correção em massa aplica só os TIPOS escolhidos.
 */
import { tipoCurto, type RetratoCenti } from "./conferencia-dfd-centi.ts";
import { normalizarSecoesDfd } from "./dfd-tratamento.ts";
import { type DfdParseado, normComparacao } from "./parse-dfd-comum.ts";
import { chaveSecao } from "./comparar-protocolo.ts";
import { aplicarTodas, comparacaoEscolha, type EntradaEscolha, entradasEscolha, marcarItensGravados, marcarItensNovos } from "./sobrescrita-dfd.ts";

/** O DFD da Centi pronto para comparar e aplicar: as seções normalizadas como na conferência; nº do DFD, planejamento,
 * arquivo e ASSINATURAS ficam os do sistema (a correção nunca troca identificador nem a assinatura validada). */
export function novoDaCenti(sistema: DfdParseado, r: RetratoCenti, anoPca: number | null): DfdParseado {
  const c = normalizarSecoesDfd(r.dfd, undefined, anoPca).dfd;
  return {
    ...c,
    numero: sistema.numero,
    planejamento: sistema.planejamento,
    nomeArquivo: sistema.nomeArquivo,
    assinaturas: sistema.assinaturas,
    tipo: tipoCurto(c.tipo) ? c.tipo : sistema.tipo,
    anoPca: sistema.anoPca,
  };
}

const n = (v: unknown) => (v == null ? "" : normComparacao(String(v)));
const tel = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const cod = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const textoSecao = (d: DfdParseado, k: string) =>
  normComparacao(
    d.secoes
      .filter((s) => chaveSecao(s.titulo) === k)
      .map((s) => s.texto)
      .join(" "),
  );

function indices(chave: string): { g: number | null; c: number | null } {
  const [t, a, b] = chave.split(":");
  if (t === "a") return { g: Number(a), c: Number(b) };
  if (t === "n") return { g: null, c: Number(a) };
  return { g: Number(a), c: null };
}

/** Os campos do ITEM que divergem (régua da conferência; a tolerância vale nos valores). */
export function camposItemDivergentes(x: DfdParseado["itens"][number], y: DfdParseado["itens"][number], tol: number): string[] {
  const fora = (u: number | null | undefined, v: number | null | undefined) => (u == null) !== (v == null) || (u != null && v != null && Math.abs(u - v) > tol);
  const out: string[] = [];
  if ((x.item ?? null) !== (y.item ?? null)) out.push("item");
  if (cod(x.codigo) !== cod(y.codigo)) out.push("codigo");
  if (n(x.descricao) !== n(y.descricao)) out.push("descricao");
  if (n(x.unidade) !== n(y.unidade)) out.push("unidade");
  if ((x.quantidade ?? null) !== (y.quantidade ?? null)) out.push("quantidade");
  if (fora(x.valorUnitario, y.valorUnitario)) out.push("valorUnitario");
  if (fora(x.valorTotal, y.valorTotal)) out.push("valorTotal");
  return out;
}

const ROTULO_CAMPO_ITEM: Record<string, string> = {
  item: "Item: nº",
  codigo: "Item: código",
  descricao: "Item: descrição",
  unidade: "Item: medida",
  quantidade: "Item: quantidade",
  valorUnitario: "Item: valor unitário",
  valorTotal: "Item: valor total",
};

/** Os TIPOS de divergência que uma escolha corrige — os MESMOS rótulos do filtro da coluna Centi (`tiposDivergencia`).
 * Vazio = a escolha não diverge pela régua da conferência (fica o sistema). */
export function tiposDaEntrada(e: EntradaEscolha, sistema: DfdParseado, centi: DfdParseado, r: Pick<RetratoCenti, "objeto" | "tolerancia">): string[] {
  if (e.tipo === "assinaturas") return [];
  if (e.tipo === "campo") {
    const k = e.campo;
    if (k === "planejamento") return [];
    if (k === "tipo") return tipoCurto(sistema.tipo) && tipoCurto(centi.tipo) && tipoCurto(sistema.tipo) !== tipoCurto(centi.tipo) ? ["Tipo"] : [];
    if (k === "objeto" && !r.objeto) return [];
    const a = sistema[k as keyof DfdParseado];
    const b = centi[k as keyof DfdParseado];
    const igual = k === "telefone" ? tel(a) === tel(b) : n(a) === n(b);
    return igual ? [] : [e.rotulo];
  }
  if (e.tipo === "secao") {
    if (textoSecao(sistema, e.secao) === textoSecao(centi, e.secao)) return [];
    return [`Seção ${String(e.rotulo ?? "").replace(/\s+/g, " ").trim().replace(/^\d+\s*[-.–]\s*/, "") || "sem título"}`];
  }
  const { g, c } = indices(e.chave);
  if (g == null) return ["Item só na Centi", "Nº de itens", "Valor total"];
  if (c == null) return ["Item só no sistema", "Nº de itens", "Valor total"];
  const x = sistema.itens[g];
  const y = centi.itens[c];
  if (!x || !y) return [];
  const campos = camposItemDivergentes(x, y, r.tolerancia);
  if (!campos.length) return [];
  // O total do item = quantidade × valor unitário: só conta como tipo próprio quando nenhum dos dois mudou (como no motivo).
  const qv = campos.includes("quantidade") || campos.includes("valorUnitario");
  const tipos = campos.filter((f) => !(qv && f === "valorTotal")).map((f) => ROTULO_CAMPO_ITEM[f]);
  if (campos.some((f) => f === "quantidade" || f === "valorUnitario" || f === "valorTotal")) tipos.push("Valor total");
  return tipos;
}

export type PlanoCorrecao = {
  /** O DFD da Centi pronto (o "novo" das escolhas). */
  centi: DfdParseado;
  entradas: EntradaEscolha[];
  /** As escolhas que divergem, com os tipos. */
  divergentes: { entrada: EntradaEscolha; tipos: string[] }[];
};

export function planoCorrecao(sistema: DfdParseado, r: RetratoCenti, anoPca: number | null): PlanoCorrecao {
  const centi = marcarItensNovos(novoDaCenti(sistema, r, anoPca));
  const entradas = entradasEscolha(comparacaoEscolha(sistema, centi));
  const divergentes = entradas.map((entrada) => ({ entrada, tipos: tiposDaEntrada(entrada, sistema, centi, r) })).filter((d) => d.tipos.length);
  return { centi, entradas, divergentes };
}

/** Os tipos que o plano consegue corrigir (sem repetir, na ordem em que aparecem). */
export const tiposCorrigiveis = (p: PlanoCorrecao): string[] => [...new Set(p.divergentes.flatMap((d) => d.tipos))];

/** Aplica a Centi nas divergências — todas, ou só as dos `tipos` escolhidos (o mesmo rótulo do filtro). O resultado traz
 * as marcas de origem dos itens (a tela das escolhas as usa); antes de gravar, `semMarcas`. */
export function aplicarCentiPorTipos(sistema: DfdParseado, p: PlanoCorrecao, tipos?: readonly string[] | null): DfdParseado {
  const quer = tipos ? new Set(tipos) : null;
  const escolhidas = p.divergentes.filter((d) => !quer || d.tipos.some((t) => quer.has(t))).map((d) => d.entrada);
  const base = marcarItensGravados(sistema);
  if (!escolhidas.length) return base;
  return aplicarTodas(escolhidas, "novo", base, base, p.centi);
}
