import {
  assinantes,
  type ComparacaoDfd,
  chaveSecao,
  compararDfd,
  type DfdComparavel,
  type DiffCampo,
  type DiffItemDfd,
  diffItem,
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
  | { tipo: "item"; chave: string; item: number | null; rotulo: string };

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
    if (it.chave) out.push({ tipo: "item", chave: it.chave, item: it.item, rotulo: `Item ${it.item ?? "—"}${it.codigo ? ` (${it.codigo})` : ""}` });
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
  const achado = trabalho.itens.find((it) => (n != null && it.ref === refN(n)) || (g != null && it.ref === refG(g)));
  if (!achado) return n != null && g == null ? "gravado" : g != null && n == null ? "novo" : "editado";
  if (n != null && achado.ref === refN(n)) return igualItem(achado, novo.itens[n]) ? "novo" : "editado";
  if (g != null && achado.ref === refG(g)) return igualItem(achado, gravado.itens[g]) ? "gravado" : "editado";
  return "editado";
}

/** Soma dos itens (o valor do DFD é SEMPRE a soma — nunca estimado). */
function comTotal(d: DfdParseado, itens: DfdItemParseado[]): DfdParseado {
  const soma = itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
  return { ...d, itens, valorTotal: soma > 0 ? Math.round(soma * 100) / 100 : null };
}

/** Insere o item na posição pelo Nº do item (os sem nº no fim) — estável. */
function inserirOrdenado(itens: DfdItemParseado[], it: DfdItemParseado): DfdItemParseado[] {
  const n = it.item ?? Number.MAX_SAFE_INTEGER;
  const i = itens.findIndex((x) => (x.item ?? Number.MAX_SAFE_INTEGER) > n);
  return i < 0 ? [...itens, it] : [...itens.slice(0, i), it, ...itens.slice(i)];
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
    // A seção não estava no trabalho: entra na ordem pelo número da seção.
    let secoes = resto;
    for (const s of escolhidas) {
      const i = secoes.findIndex((x) => x.numero > s.numero);
      secoes = i < 0 ? [...secoes, s] : [...secoes.slice(0, i), s, ...secoes.slice(i)];
    }
    return { ...trabalho, secoes };
  }
  const { g, n } = indicesItem(e.chave);
  const eDoPar = (it: DfdItemParseado) => (n != null && it.ref === refN(n)) || (g != null && it.ref === refG(g));
  const pos = trabalho.itens.findIndex(eDoPar);
  const resto = trabalho.itens.filter((it) => !eDoPar(it));
  const escolhido: DfdItemParseado | null =
    lado === "novo" ? (n != null ? { ...novo.itens[n], ref: refN(n) } : null) : g != null ? { ...gravado.itens[g], ref: refG(g) } : null;
  if (!escolhido) return comTotal(trabalho, resto); // o lado escolhido NÃO tem o item → fica sem ele
  if (pos >= 0) return comTotal(trabalho, [...resto.slice(0, pos), escolhido, ...resto.slice(pos)]);
  return comTotal(trabalho, inserirOrdenado(resto, escolhido));
}

/** Aplica o MESMO lado a várias escolhas (os botões "usar todos os novos" / "manter todos os gravados"). */
export function aplicarTodas(entradas: EntradaEscolha[], lado: Lado, trabalho: DfdParseado, gravado: DfdParseado, novo: DfdParseado): DfdParseado {
  return entradas.reduce((w, e) => aplicarEscolha(e, lado, w, gravado, novo), trabalho);
}

/** O que foi MANTIDO do gravado e o que foi EDITADO à mão — vai ao histórico da sobrescrita. */
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
  const nums = new Set(entradas.flatMap((e) => (e.tipo === "item" ? [e.item] : [])));
  return {
    campos: [...comp.campos, ...comp.secoes, ...(comp.assinaturas ? [comp.assinaturas] : [])].filter((d) => !chaves.has(d.campo)),
    itens: comp.itens.filter((it) => !nums.has(it.item)),
  };
}

/** Tira a marca de origem dos itens (o DFD que vai ao servidor — a marca é só da tela). */
export function semMarcas<T extends { itens: DfdItemParseado[] }>(d: T): T {
  return d.itens.some((it) => it.ref !== undefined) ? { ...d, itens: d.itens.map(({ ref: _r, ...it }) => it) } : d;
}

/** Lista curta p/ o histórico ("A, B, C e mais N"). */
export function listaCurta(l: string[], max = 12): string {
  return l.length > max ? `${l.slice(0, max).join(", ")} e mais ${l.length - max}` : l.join(", ");
}
