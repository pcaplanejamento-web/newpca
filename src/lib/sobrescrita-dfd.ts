import {
  assinantes,
  type ComparacaoDfd,
  chaveSecao,
  compararDfd,
  type DfdComparavel,
  type DiffCampo,
  type DiffItemDfd,
  diffItem,
  parearItens,
} from "./comparar-protocolo.ts";
import { type DfdItemParseado, type DfdParseado, type DfdSecao, listaRefs, SEPARADOR_REFS, tipoCurtoDfd } from "./parse-dfd-comum.ts";

/**
 * SOBRESCRITA de um DFD com ESCOLHA POR DADO — núcleo PURO/testável (sem getDb/JSX). Quando um DFD
 * importado vai sobrescrever o DFD GRAVADO de mesmo número, cada DIFERENÇA entre os dois (campo do
 * cabeçalho, seção, assinaturas, item) é uma ESCOLHA: manter o GRAVADO ou usar o NOVO (o arquivo). A
 * escolha COPIA o valor do lado escolhido para o DFD de TRABALHO (o que a tela confere/edita e o que é
 * gravado), e o ESTADO de cada escolha é lido do próprio DFD de trabalho: igual ao gravado, igual ao
 * novo, ou "editado" (mudado à mão — nenhum dos dois). As diferenças vêm da MESMA régua da comparação
 * do reenvio (`compararDfd`) e os itens do MESMO pareamento (`parearItens`), pela chave estável.
 */

/** De qual lado vem o dado: o GRAVADO (mantém) ou o NOVO (o arquivo que sobrescreve). */
export type Lado = "gravado" | "novo";
/** Estado de uma escolha no DFD de trabalho: igual ao gravado, igual ao novo, ou editado à mão. */
export type EstadoEscolha = Lado | "editado";

/** Campos do cabeçalho ESCOLHÍVEIS (o ano do PCA segue o processo, a unidade é do cadastro e o valor
 * total é a soma dos itens — ficam fora da escolha). */
export const CAMPOS_ESCOLHA = [
  "planejamento",
  "tipo",
  "objeto",
  "orgaoEntidade",
  "setorRequisitante",
  "responsavel",
  "matricula",
  "email",
  "telefone",
  "numeroContrato",
  "numeroAta",
  "numeroLicitacao",
] as const;
export type CampoEscolha = (typeof CAMPOS_ESCOLHA)[number];

/** Um dado ESCOLHÍVEL (uma diferença entre o gravado e o novo). `chave` identifica a escolha. */
export type EntradaEscolha =
  | { tipo: "campo"; chave: string; campo: CampoEscolha; rotulo: string }
  | { tipo: "secao"; chave: string; secao: string; rotulo: string }
  | { tipo: "assinaturas"; chave: string; rotulo: string }
  | { tipo: "item"; chave: string; item: number | null; codigo: string | null; rotulo: string };

/** Bloco da escolha (as ações "todos" por bloco na tela). */
export type BlocoEscolha = "cabecalho" | "secoes" | "assinaturas" | "itens";
export const blocoDe = (e: EntradaEscolha): BlocoEscolha =>
  e.tipo === "campo" ? "cabecalho" : e.tipo === "secao" ? "secoes" : e.tipo === "assinaturas" ? "assinaturas" : "itens";

const txt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const REFS = new Set<CampoEscolha>(["numeroContrato", "numeroAta", "numeroLicitacao"]);
const ehCampo = (c: string): c is CampoEscolha => (CAMPOS_ESCOLHA as readonly string[]).includes(c);

/** Valor CANÔNICO de um campo para comparar (tipo pelo código curto; refs como conjunto; texto colapsado). */
function canonCampo(d: DfdParseado, c: CampoEscolha): string {
  if (c === "tipo") return tipoCurtoDfd(d.tipo) ?? "";
  if (REFS.has(c)) return [...listaRefs(d[c])].sort().join(SEPARADOR_REFS);
  return txt(d[c]);
}

/** O DFD na forma comparável da ESCOLHA (unidade/ano fora — não são escolhas do arquivo). */
const comparavel = (d: DfdParseado): DfdComparavel => ({ ...d, reparticaoId: null, anoPca: null });

/** As DIFERENÇAS escolhíveis entre o gravado e o NOVO (o arquivo, sem as edições). A `comparacao` é a
 * mesma da tela ("Diferenças"); o valor total (Σ itens) fica de fora — segue os itens escolhidos (aparece em
 * "Outras alterações", pelo resultado). */
export function comparacaoEscolha(gravado: DfdParseado, novo: DfdParseado): ComparacaoDfd {
  const c = compararDfd(comparavel(gravado), comparavel(novo));
  const campos = c.campos.filter((d) => d.campo !== "valorTotal");
  if (campos.length === c.campos.length) return c;
  const total = c.total - (c.campos.length - campos.length);
  return { ...c, campos, total, situacao: total === 0 ? "igual" : c.situacao };
}

/** As ENTRADAS de escolha de uma comparação (gravado × novo). */
export function entradasEscolha(c: ComparacaoDfd): EntradaEscolha[] {
  const out: EntradaEscolha[] = [];
  for (const d of c.campos) if (ehCampo(d.campo)) out.push({ tipo: "campo", chave: d.campo, campo: d.campo, rotulo: d.rotulo });
  for (const d of c.secoes) out.push({ tipo: "secao", chave: d.campo, secao: d.campo.slice("secao:".length), rotulo: d.rotulo });
  if (c.assinaturas) out.push({ tipo: "assinaturas", chave: "assinaturas", rotulo: "Assinaturas" });
  for (const it of c.itens)
    if (it.chave)
      out.push({ tipo: "item", chave: it.chave, item: it.item, codigo: it.codigo, rotulo: `Item ${it.item ?? "—"}${it.codigo ? ` (${it.codigo})` : ""}` });
  return out;
}

/** Texto (canônico) das seções de uma chave — várias com o mesmo título são UMA (como na comparação). */
const textoSecaoChave = (secoes: DfdSecao[], k: string) =>
  txt(
    secoes
      .filter((s) => chaveSecao(s.titulo) === k)
      .map((s) => s.texto)
      .join(" "),
  );

/** Índices (gravado, novo) de uma chave de item: `a:g:n`, `n:n`, `r:g`. */
function indicesItem(chave: string): { g: number | null; n: number | null } {
  const [t, a, b] = chave.split(":");
  if (t === "a") return { g: Number(a), n: Number(b) };
  if (t === "n") return { g: null, n: Number(a) };
  return { g: Number(a), n: null };
}
const refG = (i: number) => `g:${i}`;
const refN = (j: number) => `n:${j}`;
const igualItem = (a: DfdItemParseado, b: DfdItemParseado) => diffItem(a, b).length === 0;
/** Índice dos itens do DFD de trabalho pela marca de origem — uma vez por versão do DFD (a tela consulta o
 * estado de CADA escolha a cada edição: sem o índice seria escolhas × itens). */
const indicesRef = new WeakMap<DfdItemParseado[], Map<string, DfdItemParseado>>();
function porRef(itens: DfdItemParseado[]): Map<string, DfdItemParseado> {
  let m = indicesRef.get(itens);
  if (!m) {
    m = new Map();
    for (const it of itens) if (it.ref && !m.has(it.ref)) m.set(it.ref, it);
    indicesRef.set(itens, m);
  }
  return m;
}
/** Ordena pelo Nº do item (os sem nº no fim), ESTÁVEL — a ordem da tabela (e do `sequencial` gravado) não
 * muda com as escolhas. */
function ordenarPorItem(itens: DfdItemParseado[]): DfdItemParseado[] {
  const n = (it: DfdItemParseado) => it.item ?? Number.MAX_SAFE_INTEGER;
  return itens
    .map((it, i) => [it, i] as const)
    .sort((a, b) => n(a[0]) - n(b[0]) || a[1] - b[1])
    .map(([it]) => it);
}

/** O DFD NOVO pronto para a escolha: cada item marca a sua ORIGEM (`n:<j>`) — a escolha o reencontra
 * mesmo depois de editado/reordenado. O ponto de partida do DFD de trabalho (tudo "novo"). */
export function marcarItensNovos(d: DfdParseado): DfdParseado {
  return { ...d, itens: d.itens.map((it, j) => ({ ...it, ref: refN(j) })) };
}

/** Estado de UMA escolha no DFD de trabalho. */
export function estadoEscolha(e: EntradaEscolha, trabalho: DfdParseado, gravado: DfdParseado, novo: DfdParseado): EstadoEscolha {
  if (e.tipo === "campo") {
    const w = canonCampo(trabalho, e.campo);
    return w === canonCampo(novo, e.campo) ? "novo" : w === canonCampo(gravado, e.campo) ? "gravado" : "editado";
  }
  if (e.tipo === "secao") {
    const w = textoSecaoChave(trabalho.secoes, e.secao);
    return w === textoSecaoChave(novo.secoes, e.secao) ? "novo" : w === textoSecaoChave(gravado.secoes, e.secao) ? "gravado" : "editado";
  }
  if (e.tipo === "assinaturas") {
    const w = assinantes(trabalho.assinaturas);
    return w === assinantes(novo.assinaturas) ? "novo" : w === assinantes(gravado.assinaturas) ? "gravado" : "editado";
  }
  const { g, n } = indicesItem(e.chave);
  const idx = porRef(trabalho.itens);
  // Depois de qualquer escolha só um dos dois existe no trabalho (a escolha troca um pelo outro).
  const achado = (n != null ? idx.get(refN(n)) : undefined) ?? (g != null ? idx.get(refG(g)) : undefined);
  if (!achado) return n != null && g == null ? "gravado" : g != null && n == null ? "novo" : "editado";
  // Pelo VALOR (como os campos): igual ao do arquivo ⇒ novo; igual ao gravado ⇒ gravado; senão editado à mão.
  if (n != null && igualItem(achado, novo.itens[n])) return "novo";
  if (g != null && igualItem(achado, gravado.itens[g])) return "gravado";
  return "editado";
}

/** Os itens são EXATAMENTE os de `fonte` (o mesmo pareamento da comparação, sem nenhuma diferença)? */
function mesmosItens(itens: DfdItemParseado[], fonte: DfdItemParseado[]): boolean {
  if (itens.length !== fonte.length) return false;
  const { pares, novos, removidos } = parearItens(fonte, itens);
  return novos.length === 0 && removidos.length === 0 && pares.every(([i, j]) => igualItem(fonte[i], itens[j]));
}

/** O valor do DFD depois das escolhas dos itens: com os itens de UM lado inteiro, o valor total DESSE lado (o "TOTAL
 * GERAL" do documento pode diferir da soma por arredondamento — "Manter todos os gravados" devolve o valor gravado e o
 * DFD volta a ser IGUAL); com a mistura dos dois, a soma dos itens (nunca estimado). */
function comTotal(d: DfdParseado, itens: DfdItemParseado[], lados: DfdParseado[]): DfdParseado {
  const lado = lados.find((l) => mesmosItens(itens, l.itens));
  if (lado) return { ...d, itens, valorTotal: lado.valorTotal };
  const soma = itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
  return { ...d, itens, valorTotal: soma > 0 ? Math.round(soma * 100) / 100 : null };
}

/** O item do `lado` escolhido para uma chave de item (com a marca de origem) — `null` = esse lado não tem. */
function itemDoLado(chave: string, lado: Lado, gravado: DfdParseado, novo: DfdParseado): DfdItemParseado | null {
  const { g, n } = indicesItem(chave);
  if (lado === "novo") return n != null ? { ...novo.itens[n], ref: refN(n) } : null;
  return g != null ? { ...gravado.itens[g], ref: refG(g) } : null;
}

/** Troca, nos itens do trabalho, os PARES das escolhas pelo item do lado escolhido — no lugar do par (senão no
 * fim) — e ordena pelo Nº do item. Uma passada só (linear), para 1 ou N escolhas. */
function trocarItens(
  trabalho: DfdParseado,
  escolhas: { chave: string; item: DfdItemParseado | null }[],
  gravado: DfdParseado,
  novo: DfdParseado,
): DfdParseado {
  const donoDaRef = new Map<string, number>(); // ref (n:/g:) → índice da escolha
  escolhas.forEach((c, k) => {
    const { g, n } = indicesItem(c.chave);
    if (n != null) donoDaRef.set(refN(n), k);
    if (g != null) donoDaRef.set(refG(g), k);
  });
  const colocado = new Set<number>();
  const out: DfdItemParseado[] = [];
  for (const it of trabalho.itens) {
    const k = it.ref != null ? donoDaRef.get(it.ref) : undefined;
    if (k == null) {
      out.push(it);
      continue;
    }
    const escolhido = escolhas[k].item;
    if (escolhido && !colocado.has(k)) out.push(escolhido); // no lugar do par
    colocado.add(k);
  }
  escolhas.forEach((c, k) => {
    if (c.item && !colocado.has(k)) out.push(c.item); // o par não estava no trabalho → entra (a ordem vem abaixo)
  });
  return comTotal(trabalho, ordenarPorItem(out), [gravado, novo]);
}

/** APLICA uma escolha: copia o valor do `lado` escolhido para o DFD de trabalho (sobrepõe uma edição à mão
 * desse mesmo dado — é o pedido explícito). */
export function aplicarEscolha(e: EntradaEscolha, lado: Lado, trabalho: DfdParseado, gravado: DfdParseado, novo: DfdParseado): DfdParseado {
  const fonte = lado === "novo" ? novo : gravado;
  if (e.tipo === "campo") return { ...trabalho, [e.campo]: fonte[e.campo] };
  if (e.tipo === "assinaturas") return { ...trabalho, assinaturas: fonte.assinaturas };
  if (e.tipo === "secao") {
    const daChave = (s: DfdSecao) => chaveSecao(s.titulo) === e.secao;
    const pos = trabalho.secoes.findIndex(daChave);
    const resto = trabalho.secoes.filter((s) => !daChave(s));
    const escolhidas = fonte.secoes.filter(daChave);
    if (pos >= 0) {
      const antes = trabalho.secoes.slice(0, pos).filter((s) => !daChave(s)).length;
      return { ...trabalho, secoes: [...resto.slice(0, antes), ...escolhidas, ...resto.slice(antes)] };
    }
    // A seção não estava no trabalho: entra num BLOCO só (na ordem da fonte), antes da 1ª de número maior.
    const n0 = escolhidas[0]?.numero ?? Number.MAX_SAFE_INTEGER;
    const i = resto.findIndex((x) => x.numero > n0);
    return { ...trabalho, secoes: i < 0 ? [...resto, ...escolhidas] : [...resto.slice(0, i), ...escolhidas, ...resto.slice(i)] };
  }
  // Item: o lado escolhido NÃO tem o item ⇒ fica sem ele.
  return trocarItens(trabalho, [{ chave: e.chave, item: itemDoLado(e.chave, lado, gravado, novo) }], gravado, novo);
}

/** Aplica o MESMO lado a várias escolhas (os botões "usar todos os novos" / "manter todos os gravados") — os
 * itens numa passada só (linear, mesmo com milhares). */
export function aplicarTodas(entradas: EntradaEscolha[], lado: Lado, trabalho: DfdParseado, gravado: DfdParseado, novo: DfdParseado): DfdParseado {
  const itens = entradas.filter((e) => e.tipo === "item");
  const demais = entradas.filter((e) => e.tipo !== "item").reduce((w, e) => aplicarEscolha(e, lado, w, gravado, novo), trabalho);
  return itens.length === 0
    ? demais
    : trocarItens(
        demais,
        itens.map((e) => ({ chave: e.chave, item: itemDoLado(e.chave, lado, gravado, novo) })),
        gravado,
        novo,
      );
}

/**
 * TODAS as diferenças de um DFD para o `lado` — o "Manter todos os gravados"/"Usar todos os novos" do painel Diferenças,
 * e a escolha EM MASSA dos DFDs selecionados (Gravado × novo). Edição à mão num dado que difere é sobreposta (é o pedido
 * explícito); o que não é escolha do arquivo (a unidade, um dado igual nos dois — editado ou não) fica como está.
 */
export function escolherTudo(lado: Lado, trabalho: DfdParseado, gravado: DfdParseado, novo: DfdParseado): DfdParseado {
  return aplicarTodas(entradasEscolha(comparacaoEscolha(gravado, novo)), lado, trabalho, gravado, novo);
}

/** O que ficou COMO NO GRAVADO e o que foi EDITADO à mão (nenhum dos dois) — vai ao histórico da sobrescrita. */
export function resumoEscolhas(
  entradas: EntradaEscolha[],
  trabalho: DfdParseado,
  gravado: DfdParseado,
  novo: DfdParseado,
): { mantidos: string[]; editados: string[]; novos: number } {
  const mantidos: string[] = [];
  const editados: string[] = [];
  let novos = 0;
  for (const e of entradas) {
    const s = estadoEscolha(e, trabalho, gravado, novo);
    if (s === "gravado") mantidos.push(e.rotulo);
    else if (s === "editado") editados.push(e.rotulo);
    else novos++;
  }
  return { mantidos, editados, novos };
}

/**
 * OUTRAS diferenças do DFD de TRABALHO em relação ao gravado — as que NÃO são escolhas do arquivo (edições à
 * mão em dados iguais nos dois, a unidade, o valor total que segue os itens…). Só exibição ("Outras
 * alterações"), para a tela mostrar TUDO o que muda ao sobrescrever. `comp` = gravado × trabalho.
 */
export function outrasDiferencas(comp: ComparacaoDfd, entradas: EntradaEscolha[]): { campos: DiffCampo[]; itens: DiffItemDfd[] } {
  const chaves = new Set(entradas.map((e) => e.chave));
  // O item "já escolhido" é o de mesmo Nº E código (o nº sozinho esconderia outro item renumerado).
  const idItem = (item: number | null, codigo: string | null) => `${item ?? ""}|${txt(codigo)}`;
  const itensEscolha = new Set(entradas.flatMap((e) => (e.tipo === "item" ? [idItem(e.item, e.codigo)] : [])));
  return {
    campos: [...comp.campos, ...comp.secoes, ...(comp.assinaturas ? [comp.assinaturas] : [])].filter((d) => !chaves.has(d.campo)),
    itens: comp.itens.filter((it) => !itensEscolha.has(idItem(it.item, it.codigo))),
  };
}

/** Tira a marca de origem dos itens (o DFD que vai ao servidor — a marca é só da tela). */
export function semMarcas<T extends { itens: DfdItemParseado[] }>(d: T): T {
  return d.itens.some((it) => it.ref !== undefined) ? { ...d, itens: d.itens.map(({ ref: _r, ...it }) => it) } : d;
}

/** Lista curta p/ o histórico ("A, B, C e mais N") — `total` = quantos eram de fato (a lista pode vir cortada). */
export function listaCurta(l: string[], max = 12, total = l.length): string {
  const mostra = l.slice(0, max);
  const resto = Math.max(total, l.length) - mostra.length;
  return resto > 0 ? `${mostra.join(", ")} e mais ${resto}` : mostra.join(", ");
}

/** Quantos rótulos das escolhas vão ao histórico (o resto vira "e mais N") e o tamanho de cada rótulo. */
export const MAX_ROTULOS_HISTORICO = 12;
const MAX_ROTULO = 200;
/** As ESCOLHAS da sobrescrita no formato do histórico (`start-dfd.escolhas`): os primeiros rótulos + as
 * quantidades — o envio nunca é recusado por um DFD com milhares de diferenças. Puro. */
export function escolhasParaHistorico(r: { mantidos: string[]; editados: string[] }): {
  mantidos: string[];
  editados: string[];
  qtdMantidos: number;
  qtdEditados: number;
} | null {
  if (r.mantidos.length === 0 && r.editados.length === 0) return null;
  const corta = (l: string[]) => l.slice(0, MAX_ROTULOS_HISTORICO).map((t) => t.slice(0, MAX_ROTULO));
  return { mantidos: corta(r.mantidos), editados: corta(r.editados), qtdMantidos: r.mantidos.length, qtdEditados: r.editados.length };
}
