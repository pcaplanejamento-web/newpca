import {
  aplicarSinonimos,
  type ChaveAvaliacao,
  comportamentoDe,
  comportamentoNo,
  corComportamentoPadrao,
  corImportancia,
  estadoCicloCfg,
  nivelDe,
  type RegrasAvaliacao,
  regrasPadrao,
  sinonimosDe,
} from "./avaliacao-core.ts";
import { normPrevisao, normPrioridade, valoresBatem } from "./normalize.ts";
import { type ConferenciaItem, type FaltaCatalogoItem, piorFalta, ROTULO_FALTA_CATALOGO } from "./catalogo-conferencia.ts";
import { normalizarCodigo } from "./parse-catalogo-comum.ts";
import {
  type DfdItemParseado,
  type DfdParseado,
  type DfdSecao,
  norm,
  tipoCurtoDfd,
} from "./parse-dfd-comum.ts";

/**
 * Tratamento das seções TRATÁVEIS do DFD (PRIORIDADE §6, PREVISÃO §5, FUNDAMENTAÇÃO
 * §7). Puro/testável. As seções vivem em `DfdParseado.secoes` ({numero,titulo,texto})
 * e são localizadas por KEYWORD do título (igual à validação `faltasObrigatorias`).
 */

export type CampoTratavel = "prioridade" | "previsao" | "fundamentacao";

export const TRATAVEIS: { campo: CampoTratavel; chave: ChaveAvaliacao; kw: string; titulo: string; numero: number }[] = [
  { campo: "prioridade", chave: "dfd.prioridade", kw: "PRIORIDADE", titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", numero: 6 },
  { campo: "previsao", chave: "dfd.previsao", kw: "PREVISAO DE ENTREGA", titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", numero: 5 },
  { campo: "fundamentacao", chave: "dfd.fundamentacao", kw: "FUNDAMENTACAO LEGAL", titulo: "FUNDAMENTAÇÃO LEGAL", numero: 7 },
];

export function acharSecao(secoes: DfdSecao[], kw: string): number {
  return secoes.findIndex((s) => norm(s.titulo).includes(kw));
}

export function textoSecao(secoes: DfdSecao[], kw: string): string {
  const i = acharSecao(secoes, kw);
  return i >= 0 ? secoes[i].texto : "";
}

/** Grava (ou cria, se faltava) o texto de uma seção — mantendo a ordem. */
export function setTextoSecao(
  secoes: DfdSecao[],
  cfg: { kw: string; titulo: string; numero: number },
  texto: string,
): DfdSecao[] {
  const i = acharSecao(secoes, cfg.kw);
  if (i >= 0) {
    const n = [...secoes];
    n[i] = { ...n[i], texto };
    return n;
  }
  return [...secoes, { numero: cfg.numero, titulo: cfg.titulo, texto }];
}

/**
 * Aplica a normalização AUTOMÁTICA das seções tratáveis — grava o texto canônico e
 * devolve quais campos foram auto-corrigidos. Duas fontes, nesta ordem:
 * 1) as PALAVRAS-CHAVE do ADM (`sinonimos`), quando o ponto está em nível "automático"
 *    (troca o texto TODO da seção quando um termo casa);
 * 2) a normalização embutida de PRIORIDADE/PREVISÃO (comportamento histórico).
 * Com `regras` no padrão do catálogo, só a (2) roda — igual a hoje.
 */
export function normalizarSecoesDfd(
  dfd: DfdParseado,
  regras: RegrasAvaliacao = regrasPadrao(),
  // Ano do PCA do processo (previsão de entrega segue o PCA — ponto 7): quando a §5 traz só o
  // MÊS, o ano é completado com o do PCA. `undefined` ⇒ usa o `anoPca` do próprio DFD.
  anoPca?: number | null,
): { dfd: DfdParseado; auto: CampoTratavel[] } {
  let secoes = dfd.secoes;
  const auto: CampoTratavel[] = [];
  const ctxTipo = { dfdTipo: tipoCurtoDfd(dfd.tipo) };

  for (const cfg of TRATAVEIS) {
    const raw = textoSecao(secoes, cfg.kw);
    // (1) Palavras-chave do ADM (só quando o ponto está em "automático" — respeita a exceção por tipo).
    if (comportamentoNo(regras, cfg.chave, ctxTipo) === "automatico") {
      const custom = aplicarSinonimos(raw, sinonimosDe(regras, cfg.chave));
      if (custom) {
        secoes = setTextoSecao(secoes, cfg, custom);
        auto.push(cfg.campo);
        continue;
      }
    }
    // (2) Normalização embutida (histórica) — só PRIORIDADE e PREVISÃO.
    if (cfg.campo === "prioridade") {
      const p = normPrioridade(raw);
      if (p.valor && p.auto) {
        secoes = setTextoSecao(secoes, cfg, p.valor);
        auto.push("prioridade");
      }
    } else if (cfg.campo === "previsao") {
      const v = normPrevisao(raw, anoPca ?? dfd.anoPca);
      if (v.valor && v.auto) {
        secoes = setTextoSecao(secoes, cfg, v.valor);
        auto.push("previsao");
      }
    }
  }
  return { dfd: secoes === dfd.secoes ? dfd : { ...dfd, secoes }, auto };
}

// ---- Estado por DFD (para a tabela do protocolo) ----
// `descartado` = DFD duplicado que o usuário optou por NÃO manter — cinza, fora de tudo
// (somatória, protocolação). É definido pelo host (não passa por `estadoDfd`).
export type EstadoDfd = "pendente" | "regular" | "regularizado" | "editado" | "atencao" | "erro" | "descartado";

/**
 * Precedência: erro (faltas) > atenção (DFD-R sem referência) > editado > regularizado
 * (auto) > regular. A ATENÇÃO **não bloqueia** — só sinaliza (ex.: DFD-R sem contrato/
 * ata/licitação); fica acima de editado/regular para não se perder na lista.
 */
export function estadoDfd(faltas: number, auto: boolean, editado: boolean, atencao = false): EstadoDfd {
  if (faltas > 0) return "erro";
  if (atencao) return "atencao";
  if (editado) return "editado";
  if (auto) return "regularizado";
  return "regular";
}

export const ESTADO_ROTULO: Record<EstadoDfd, string> = {
  pendente: "Pendente",
  regular: "Regular",
  regularizado: "Regularizado",
  editado: "Editado",
  atencao: "Atenção",
  erro: "Com erro",
  descartado: "Descartado",
};

/**
 * Cor semântica por estado. Sem `regras` ⇒ tokens (comportamento/tema atual). Com `regras`,
 * as cores SEGUEM a configuração do ADM: severidade (erro/atenção) puxa a cor da importância
 * base do comportamento; ciclo (editado/regularizado/regular/pendente) puxa de `estadosCiclo`.
 */
export function estadoCor(e: EstadoDfd, regras?: RegrasAvaliacao): string {
  if (e === "descartado") return "var(--faint)"; // cinza — DFD duplicado descartado
  if (!regras) {
    if (e === "erro") return "var(--danger)";
    if (e === "atencao") return "var(--warn)";
    if (e === "editado") return "var(--info)";
    if (e === "regularizado" || e === "regular") return "var(--ok)";
    return "var(--muted)";
  }
  if (e === "erro") return corComportamentoPadrao(regras, "bloqueia");
  if (e === "atencao") return corComportamentoPadrao(regras, "avisa");
  if (e === "editado") return estadoCicloCfg(regras, "editado").cor;
  if (e === "regularizado") return estadoCicloCfg(regras, "regularizado").cor;
  if (e === "regular") return estadoCicloCfg(regras, "regular").cor;
  return estadoCicloCfg(regras, "pendente").cor;
}

/**
 * Rótulo do estado. Sem `regras` ⇒ os rótulos fixos (`ESTADO_ROTULO`). Com `regras`, os
 * estados de CICLO seguem os nomes editáveis do ADM (`estadosCiclo`); severidade fica fixa.
 */
export function estadoRotulo(e: EstadoDfd, regras?: RegrasAvaliacao): string {
  if (e === "descartado") return ESTADO_ROTULO.descartado;
  if (!regras) return ESTADO_ROTULO[e];
  if (e === "editado") return estadoCicloCfg(regras, "editado").nome;
  if (e === "regularizado") return estadoCicloCfg(regras, "regularizado").nome;
  if (e === "regular") return estadoCicloCfg(regras, "regular").nome;
  if (e === "pendente") return estadoCicloCfg(regras, "pendente").nome;
  return ESTADO_ROTULO[e]; // erro/atencao: rótulo genérico fixo
}

/**
 * DFD de RENOVAÇÃO (DFD-R) **sem nenhuma referência** (contrato/ata/licitação) → estado
 * de **ATENÇÃO** (não bloqueia; só sinaliza que falta a referência da renovação). Puro.
 */
export function dfdRSemReferencia(d: {
  tipo?: string | null;
  numeroContrato?: string | null;
  numeroAta?: string | null;
  numeroLicitacao?: string | null;
}): boolean {
  return tipoCurtoDfd(d.tipo) === "DFD-R" && !d.numeroContrato && !d.numeroAta && !d.numeroLicitacao;
}

/** Pendência (atenção) de um DFD-R sem referência — texto para o relatório opcional. */
export const FALTA_REFERENCIA_RENOVACAO =
  "DFD de renovação (DFD-R) sem referência de contrato, ARP ou licitação — informar ao menos uma.";

// ---- Estado/Situação de um PROTOCOLO já gravado (para a tabela de protocolos) ----
// ESTADO = integridade do valor da capa × somatória dos DFDs; SITUAÇÃO = conteúdo.
export type EstadoProtocolo = "regular" | "atencao";

export function estadoProtocolo(
  p: { valorCapa: number | null; valorTotal: number; totalDfds: number },
  regras: RegrasAvaliacao = regrasPadrao(),
  ctx?: { categoria?: string | null },
): EstadoProtocolo {
  if (p.totalDfds === 0) return "regular"; // sem DFDs: nada a conferir
  // O ADM pode desligar a conferência do valor da capa ("ignora").
  if (comportamentoNo(regras, "protocolo.valorCapa", { categoria: ctx?.categoria ?? null }) === "ignora") return "regular";
  if (p.valorCapa == null || p.valorCapa <= 0 || !valoresBatem(p.valorCapa, p.valorTotal)) return "atencao";
  return "regular";
}

export const ESTADO_PROTOCOLO_ROTULO: Record<EstadoProtocolo, string> = {
  regular: "Regular",
  atencao: "Atenção",
};

export function estadoProtocoloCor(e: EstadoProtocolo, regras?: RegrasAvaliacao): string {
  if (!regras) return e === "atencao" ? "var(--warn)" : "var(--ok)";
  return e === "atencao" ? corComportamentoPadrao(regras, "avisa") : estadoCicloCfg(regras, "regular").cor;
}

export type SituacaoProtocolo = "vazio" | "preenchido";

export function situacaoProtocolo(p: { totalDfds: number }): SituacaoProtocolo {
  return p.totalDfds > 0 ? "preenchido" : "vazio";
}

export const SITUACAO_PROTOCOLO_ROTULO: Record<SituacaoProtocolo, string> = {
  vazio: "Vazio",
  preenchido: "Com DFDs",
};

// ---- Estado por ITEM da tabela (mesma ideia do estado por DFD) ----
export type EstadoItem = "erro" | "regular";

/** Faltas de um item da Seção 4 (o que impede o DFD de ser importado). */
export function faltasDoItem(it: DfdItemParseado): string[] {
  const faltas: string[] = [];
  if (it.valorUnitario == null || it.valorUnitario <= 0) faltas.push("valor unitário");
  if (it.quantidade == null) faltas.push("quantidade");
  return faltas;
}

/** Um item está com erro quando falta algo essencial (valor unitário/quantidade). */
export function itemComErro(it: DfdItemParseado): boolean {
  return faltasDoItem(it).length > 0;
}

export function estadoItem(it: DfdItemParseado): EstadoItem {
  return itemComErro(it) ? "erro" : "regular";
}

export const ESTADO_ITEM_ROTULO: Record<EstadoItem, string> = { erro: "Com erro", regular: "Regular" };

export function estadoItemCor(e: EstadoItem, regras?: RegrasAvaliacao): string {
  if (!regras) return e === "erro" ? "var(--danger)" : "var(--ok)";
  return e === "erro" ? corComportamentoPadrao(regras, "bloqueia") : estadoCicloCfg(regras, "regular").cor;
}

/**
 * Edita UM item (índice `idx`) de um DFD e recomputa o `valorTotal` do DFD (Σ dos itens).
 * Puro/genérico — reusado na edição do item na importação (avulso/protocolo) e no gravado.
 */
export function editarItemDfd<
  I extends { valorTotal: number | null },
  T extends { itens: I[]; valorTotal: number | null },
>(d: T, idx: number, patch: Partial<I>): T {
  const itens = d.itens.map((it, i) => (i === idx ? { ...it, ...patch } : it));
  const soma = itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
  return { ...d, itens, valorTotal: soma > 0 ? Math.round(soma * 100) / 100 : null };
}

// ---- Detecção de DUPLICATAS (DFDs num protocolo / itens num DFD) ----

/**
 * Grupos de DFDs DUPLICADOS num protocolo: DFDs que compartilham o MESMO nº de DFD **ou** o
 * MESMO nº de planejamento (relação TRANSITIVA por união — cada DFD entra em UM único grupo,
 * evitando decisões conflitantes). Cada grupo devolve os ÍNDICES (2+), em ordem crescente;
 * lista vazia = sem duplicatas. `numero`/`planejamento` vazios NÃO ligam DFDs. Puro/testável.
 */
export function dfdsDuplicados(lista: { numero: string; planejamento: string | null }[]): number[][] {
  const n = lista.length;
  const pai = Array.from({ length: n }, (_, i) => i);
  const raiz = (x: number): number => {
    let r = x;
    while (pai[r] !== r) {
      pai[r] = pai[pai[r]];
      r = pai[r];
    }
    return r;
  };
  const unir = (a: number, b: number) => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) pai[ra] = rb;
  };
  const ligarPor = (mapa: Map<string, number>, chave: string, i: number) => {
    const j = mapa.get(chave);
    if (j !== undefined) unir(i, j);
    else mapa.set(chave, i);
  };
  const porNumero = new Map<string, number>();
  const porPlan = new Map<string, number>();
  lista.forEach((d, i) => {
    const num = (d.numero ?? "").trim();
    if (num) ligarPor(porNumero, num, i);
    const plan = (d.planejamento ?? "").trim();
    if (plan) ligarPor(porPlan, plan, i);
  });
  const grupos = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = raiz(i);
    const g = grupos.get(r);
    if (g) g.push(i);
    else grupos.set(r, [i]);
  }
  return [...grupos.values()].filter((g) => g.length > 1);
}

/** Chave de deduplicação de um item: código (só dígitos, via `normalizarCodigo`) ou, sem
 * código, a descrição normalizada (`norm`). `null` quando não há código nem descrição. */
function chaveDupItem(it: { codigo: string | null; descricao: string | null }): string | null {
  const cod = normalizarCodigo(it.codigo ?? "");
  if (cod) return `c:${cod}`;
  const desc = norm(it.descricao ?? "");
  return desc ? `d:${desc}` : null;
}

/**
 * Grupos de ITENS DUPLICADOS num DFD: itens com a MESMA chave (código; sem código, a
 * descrição). Cada grupo devolve os ÍNDICES (2+), em ordem; lista vazia = sem duplicatas.
 * Puro/testável.
 */
export function itensDuplicados(itens: { codigo: string | null; descricao: string | null }[]): number[][] {
  const grupos = new Map<string, number[]>();
  itens.forEach((it, i) => {
    const k = chaveDupItem(it);
    if (!k) return;
    const g = grupos.get(k);
    if (g) g.push(i);
    else grupos.set(k, [i]);
  });
  return [...grupos.values()].filter((g) => g.length > 1);
}

// ---- Faltas CIRÚRGICAS + relatório em formato de DESPACHO (copiável) ----

/** Seções obrigatórias do DFD (fonte única — `faltasObrigatorias` no `dfd-validation`
 * também usa esta lista). O `rotulo` já indica a seção exata a corrigir. */
export const SECOES_OBRIGATORIAS: { chave: ChaveAvaliacao; kw: string; rotulo: string }[] = [
  { chave: "dfd.justificativa", kw: "JUSTIFICATIVA", rotulo: "Justificativa da necessidade (Seção 3)" },
  { chave: "dfd.previsao", kw: "PREVISAO DE ENTREGA", rotulo: "Previsão de entrega/execução (Seção 5)" },
  { chave: "dfd.prioridade", kw: "PRIORIDADE", rotulo: "Prioridade da compra/contratação (Seção 6)" },
  { chave: "dfd.fundamentacao", kw: "FUNDAMENTACAO LEGAL", rotulo: "Fundamentação legal (Seção 7)" },
];

function temSecaoPreenchida(secoes: { titulo: string; texto: string }[], kw: string): boolean {
  return secoes.some((s) => norm(s.titulo).includes(kw) && s.texto.trim().length > 0);
}

/** Formata uma lista de nº de item ("3, 5, 8" — trunca se for enorme). */
function listaItens(nums: number[]): string {
  const s = nums.slice(0, 30).join(", ");
  return nums.length > 30 ? `${s} … (+${nums.length - 30})` : s;
}

/** Dados de um DFD para avaliação (subconjunto de `DfdParseado`, + tipo/refs). */
export type EntradaAvaliacaoDfd = {
  reparticaoId?: number | null;
  itens: { valorUnitario?: number | null; quantidade?: number | null; codigo?: string | null; item?: number | null }[];
  secoes: { titulo: string; texto: string }[];
  tipo?: string | null;
  numeroContrato?: string | null;
  numeroAta?: string | null;
  numeroLicitacao?: string | null;
};

export type AvaliacaoDfd = { bloqueantes: string[]; atencoes: string[] };

/** Conformidade dos itens com o catálogo (referência) — o veredito por CÓDIGO é
 * PRÉ-COMPUTADO pelo chamador (que consultou o catálogo, via `conferirItensNoCatalogo`)
 * e passado no `ctx`, mantendo os avaliadores PUROS (mesmo padrão de `orgaoUnidadeDivergente`). */
export type CtxConformidade = { conformidade?: Map<string, ConferenciaItem> };
export const CHAVE_FALTA_CATALOGO: Record<FaltaCatalogoItem, ChaveAvaliacao> = {
  naoCatalogado: "item.naoCatalogado",
  divergenteCatalogo: "item.divergenteCatalogo",
  tipoIncompativel: "item.tipoIncompativel",
};

/** Veredito de conformidade de UMA linha (coluna "Catálogo" / detalhe do item), já
 * resolvido pelos níveis do ADM: descarta as faltas em "ignorar" e escolhe a mais grave.
 * `null` = item sem código / sem veredito (nada a mostrar na coluna). Puro. */
export type VeredictoLinhaCatalogo = { nivel: "conforme" | "atencao" | "erro"; falta: FaltaCatalogoItem | null };
export function veredictoLinhaCatalogo(
  c: ConferenciaItem | undefined,
  regras: RegrasAvaliacao,
  dfdTipo: string | null,
): VeredictoLinhaCatalogo | null {
  if (!c) return null;
  const ativas = c.faltas.filter((f) => comportamentoNo(regras, CHAVE_FALTA_CATALOGO[f], { dfdTipo }) !== "ignora");
  if (ativas.length === 0) return { nivel: "conforme", falta: null };
  const falta = piorFalta(ativas) as FaltaCatalogoItem;
  const nivel = comportamentoNo(regras, CHAVE_FALTA_CATALOGO[falta], { dfdTipo }) === "bloqueia" ? "erro" : "atencao";
  return { nivel, falta };
}

/** Cor (token) do nível de um veredito de linha do catálogo. */
export function corVeredictoCatalogo(nivel: VeredictoLinhaCatalogo["nivel"]): string {
  return nivel === "erro" ? "var(--danger)" : nivel === "atencao" ? "var(--warn)" : "var(--ok)";
}

/** Itens com uma dada falta de conformidade, segundo o veredito pré-computado. */
function itensComFaltaCatalogo<T extends { codigo?: string | null }>(
  itens: T[],
  conformidade: Map<string, ConferenciaItem> | undefined,
  falta: FaltaCatalogoItem,
): T[] {
  if (!conformidade) return [];
  return itens.filter((it) => conformidade.get(normalizarCodigo(it.codigo ?? null))?.faltas.includes(falta));
}

/** Algum ponto de conformidade com o catálogo está em "fundamental" (bloqueia)? Decide se
 * vale a pena o servidor consultar o catálogo (portão preguiçoso, como órgão×unidade). Puro. */
export function algumCatalogoFundamental(
  regras: RegrasAvaliacao,
  ctx?: { categoria?: string | null; dfdTipo?: string | null },
): boolean {
  const c = { dfdTipo: ctx?.dfdTipo ?? null, categoria: ctx?.categoria ?? null };
  return (Object.keys(CHAVE_FALTA_CATALOGO) as FaltaCatalogoItem[]).some(
    (f) => comportamentoNo(regras, CHAVE_FALTA_CATALOGO[f], c) === "bloqueia",
  );
}

/** Bloqueantes SÓ do catálogo (rótulos) — para o portão do servidor nos LOTES, que não
 * reavalia as demais regras. Só entram as faltas cujo ponto o ADM elevou a "fundamental". Puro. */
export function bloqueantesCatalogo(
  itens: { codigo?: string | null }[],
  conformidade: Map<string, ConferenciaItem> | undefined,
  regras: RegrasAvaliacao,
  ctx?: { categoria?: string | null; dfdTipo?: string | null },
): string[] {
  const c = { dfdTipo: ctx?.dfdTipo ?? null, categoria: ctx?.categoria ?? null };
  const out: string[] = [];
  for (const falta of Object.keys(CHAVE_FALTA_CATALOGO) as FaltaCatalogoItem[]) {
    if (comportamentoNo(regras, CHAVE_FALTA_CATALOGO[falta], c) !== "bloqueia") continue;
    if (itensComFaltaCatalogo(itens, conformidade, falta).length > 0) out.push(ROTULO_FALTA_CATALOGO[falta]);
  }
  return out;
}

/**
 * Avaliação CONFIGURÁVEL de um DFD: para cada ponto (itens/seções/repartição/renovação)
 * resolve o nível efetivo (`nivelDe`, com exceções por tipo de DFD e categoria de
 * protocolo) e separa em **bloqueantes** (fundamental) e **atenções** (intermediário/
 * automático). Com `regras` no padrão do catálogo os bloqueantes reproduzem EXATAMENTE
 * a lista de `faltasObrigatorias` de hoje (invariante coberto por teste). Pura.
 * Obs.: `dfd.anoPca` e `dfd.assinatura` são portões à parte (conferidos no envio).
 */
export function avaliarDfd(
  d: EntradaAvaliacaoDfd,
  regras: RegrasAvaliacao = regrasPadrao(),
  ctx?: { categoria?: string | null; orgaoNaoIdentificado?: boolean; orgaoUnidadeDivergente?: boolean } & CtxConformidade,
): AvaliacaoDfd {
  const c = { dfdTipo: tipoCurtoDfd(d.tipo ?? null), categoria: ctx?.categoria ?? null };
  const bloqueantes: string[] = [];
  const atencoes: string[] = [];
  const add = (chave: ChaveAvaliacao, falta: boolean, rotulo: string) => {
    if (!falta) return;
    const comp = comportamentoNo(regras, chave, c);
    if (comp === "bloqueia") bloqueantes.push(rotulo);
    else if (comp === "avisa" || comp === "automatico") atencoes.push(rotulo);
    // "ignora": não entra em lugar nenhum.
  };
  // Ordem preserva a de `faltasObrigatorias` (valor unitário → repartição → seções).
  const semVU = d.itens.length === 0 || !d.itens.every((i) => i.valorUnitario != null && i.valorUnitario > 0);
  add("item.valorUnitario", semVU, "valor unitário em todos os itens");
  // `=== null` (não `== null`): só conta quando a quantidade foi realmente informada
  // como ausente — evita falso-positivo quando o chamador nem carrega a quantidade.
  add("item.quantidade", d.itens.some((i) => i.quantidade === null), "quantidade em todos os itens");
  add("dfd.reparticao", d.reparticaoId == null, "unidade vinculada");
  // Órgão identificado + divergência órgão×unidade: flags PRÉ-COMPUTADAS pelo chamador (que tem o
  // cadastro) e passadas no ctx — mantêm `avaliarDfd` puro. Só bloqueiam se o ADM elevar a
  // "fundamental" (padrão = intermediário ⇒ atenção, não bloqueia; ctx ausente ⇒ sem efeito).
  add("dfd.orgao", ctx?.orgaoNaoIdentificado === true, "órgão identificado (Órgão/Entidade)");
  add("dfd.orgaoUnidadeDivergente", ctx?.orgaoUnidadeDivergente === true, "órgão × unidade divergentes");
  for (const s of SECOES_OBRIGATORIAS) add(s.chave, !temSecaoPreenchida(d.secoes, s.kw), s.rotulo);
  add("dfd.referenciaRenovacao", dfdRSemReferencia(d), "referência de renovação (contrato, ARP ou licitação)");
  // Conformidade com o catálogo (veredito pré-computado no ctx; sem catálogo/verdicto ⇒ sem efeito).
  add("item.naoCatalogado", itensComFaltaCatalogo(d.itens, ctx?.conformidade, "naoCatalogado").length > 0, "itens não catalogados");
  add("item.divergenteCatalogo", itensComFaltaCatalogo(d.itens, ctx?.conformidade, "divergenteCatalogo").length > 0, "itens divergentes do catálogo");
  add("item.tipoIncompativel", itensComFaltaCatalogo(d.itens, ctx?.conformidade, "tipoIncompativel").length > 0, "itens com tipo incompatível com o catálogo");
  return { bloqueantes, atencoes };
}

// ---- Mensagens COMPLETAS de um DFD (erro / atenção / acerto) para o painel lateral ----

export type StatusMensagem = "erro" | "atencao" | "acerto";

/**
 * Uma mensagem de conferência do DFD: um ponto avaliado (item/seção/repartição/…) com
 * o `status` (erro bloqueia · atenção avisa · acerto ok), o `texto` e a `ancora` — o id
 * do componente correspondente no banner do DFD (para rolar/destacar ao clicar).
 */
export type MensagemDfd = { chave: string; status: StatusMensagem; texto: string; ancora: string; cor?: string };

export const STATUS_MENSAGEM_COR: Record<StatusMensagem, string> = {
  erro: "var(--danger)",
  atencao: "var(--warn)",
  acerto: "var(--ok)",
};

export const STATUS_MENSAGEM_ROTULO: Record<StatusMensagem, string> = {
  erro: "Erro",
  atencao: "Atenção",
  acerto: "Acerto",
};

/** Entrada de avaliação para as mensagens (superset de `EntradaAvaliacaoDfd`). */
export type EntradaMensagensDfd = EntradaAvaliacaoDfd & {
  anoPca?: number | null;
  /** Resultado já conferido da assinatura (o chamador roda `validarAssinatura`). */
  assinatura?: { status: "ok" | "dropsigner" | "erro" | "sem-assinatura"; motivo?: string | null } | null;
};

/**
 * TODAS as mensagens de conferência de um DFD — erro, atenção E acerto, **sem exceção**
 * (só omite pontos que o ADM marcou "ignorar"). Cada uma aponta uma `ancora` no banner.
 * Puro/testável. É a fonte única do painel de mensagens (lista + rolagem/destaque) e do
 * contador do botão "Ver mensagens". Respeita os níveis do ADM (config padrão ⇒ igual a
 * hoje: os pontos fundamentais viram erro, os intermediários viram atenção).
 */
export function mensagensDfd(
  d: EntradaMensagensDfd,
  regras: RegrasAvaliacao = regrasPadrao(),
  ctx?: { categoria?: string | null; orgaoNaoIdentificado?: boolean; orgaoUnidadeDivergente?: boolean } & CtxConformidade,
): MensagemDfd[] {
  const c = { dfdTipo: tipoCurtoDfd(d.tipo ?? null), categoria: ctx?.categoria ?? null };
  const out: MensagemDfd[] = [];
  const add = (chave: ChaveAvaliacao, ancora: string, ok: boolean, faltaTexto: string, okTexto: string) => {
    const id = nivelDe(regras, chave, c);
    const comp = comportamentoDe(regras, id);
    if (comp === "ignora") return;
    if (ok) out.push({ chave, status: "acerto", texto: okTexto, ancora });
    else out.push({ chave, status: comp === "bloqueia" ? "erro" : "atencao", texto: faltaTexto, ancora, cor: corImportancia(regras, id) });
  };
  const plural = (n: number) => (n === 1 ? "item" : "itens");

  // Unidade / Setor (topo do banner)
  add("dfd.reparticao", "reparticao", d.reparticaoId != null,
    "Unidade/Setor requisitante não vinculado.", "Unidade/Setor requisitante vinculado.");

  // Órgão identificado (Órgão/Entidade) — só APONTA quando não foi identificado (flag do ctx).
  if (ctx?.orgaoNaoIdentificado === true) {
    add("dfd.orgao", "reparticao", false,
      "Órgão/Entidade do DFD não corresponde a nenhum órgão cadastrado.", "");
  }

  // Divergência órgão × unidade (item 6.3) — só APONTA quando há divergência real (a flag é
  // pré-computada pelo chamador, que tem o cadastro). Ancorada no bloco da unidade; não
  // bloqueia por padrão (intermediário). Sem acerto "coincidem" (evita ruído/falso-positivo).
  if (ctx?.orgaoUnidadeDivergente === true) {
    add("dfd.orgaoUnidadeDivergente", "reparticao", false,
      "Órgão/Entidade do DFD diverge do órgão da unidade selecionada.", "");
  }

  // PCA (ano) — portão à parte, mas exibido como mensagem.
  add("dfd.anoPca", "anoPca", d.anoPca != null,
    "PCA (ano) do DFD não definido.", `PCA (ano) do DFD definido${d.anoPca != null ? `: ${d.anoPca}` : ""}.`);

  // Seções tratáveis + justificativa (Tratamento e Seção 3)
  for (const s of SECOES_OBRIGATORIAS) {
    const ancora = s.chave.replace(/^dfd\./, "");
    add(s.chave, ancora, temSecaoPreenchida(d.secoes, s.kw), `${s.rotulo} não preenchida.`, `${s.rotulo} preenchida.`);
  }

  // Referência de renovação — só para DFD-R
  if (c.dfdTipo === "DFD-R") {
    add("dfd.referenciaRenovacao", "referenciaRenovacao", !dfdRSemReferencia(d),
      FALTA_REFERENCIA_RENOVACAO, "Referência de renovação informada (contrato, ARP ou licitação).");
  }

  // Itens (Seção 4)
  const total = d.itens.length;
  const semVU = d.itens.filter((i) => i.valorUnitario == null || i.valorUnitario <= 0).length;
  add("item.valorUnitario", "itens", total > 0 && semVU === 0,
    total === 0 ? "Nenhum item na tabela (Seção 4)." : `Falta valor unitário em ${semVU} de ${total} ${plural(total)} (Seção 4).`,
    `Valor unitário informado nos ${total} ${plural(total)} (Seção 4).`);
  const semQtd = d.itens.filter((i) => i.quantidade === null).length;
  add("item.quantidade", "itens", semQtd === 0,
    `Falta quantidade em ${semQtd} ${plural(semQtd)} (Seção 4).`, "Quantidade informada em todos os itens (Seção 4).");

  // Conformidade com o catálogo (itens) — só APONTA problemas (como órgão×unidade); um acerto
  // único quando tudo confere. Veredito pré-computado no ctx (sem catálogo ⇒ nada).
  if (ctx?.conformidade) {
    let algumAtivo = false;
    let algumProblema = false;
    const catMsgs: { falta: FaltaCatalogoItem; texto: (q: number) => string }[] = [
      { falta: "naoCatalogado", texto: (q) => `${q} de ${total} ${plural(total)} fora do catálogo (Seção 4).` },
      { falta: "divergenteCatalogo", texto: (q) => `${q} ${plural(q)} ${q === 1 ? "diverge" : "divergem"} do catálogo (descrição/unidade) — ver detalhe do item.` },
      { falta: "tipoIncompativel", texto: (q) => `${q} ${plural(q)} com tipo de DFD incompatível com o catálogo.` },
    ];
    for (const cm of catMsgs) {
      const id = nivelDe(regras, CHAVE_FALTA_CATALOGO[cm.falta], c);
      const comp = comportamentoDe(regras, id);
      if (comp === "ignora") continue;
      algumAtivo = true;
      const qtd = itensComFaltaCatalogo(d.itens, ctx.conformidade, cm.falta).length;
      if (qtd === 0) continue;
      algumProblema = true;
      out.push({ chave: CHAVE_FALTA_CATALOGO[cm.falta], status: comp === "bloqueia" ? "erro" : "atencao", texto: cm.texto(qtd), ancora: "itens", cor: corImportancia(regras, id) });
    }
    if (algumAtivo && !algumProblema && total > 0)
      out.push({ chave: "item.naoCatalogado", status: "acerto", texto: "Itens conferem com o catálogo de referência.", ancora: "itens" });
  }

  // Assinatura digital
  const idAssin = nivelDe(regras, "dfd.assinatura", c);
  if (d.assinatura && comportamentoDe(regras, idAssin) !== "ignora") {
    if (d.assinatura.status === "ok") out.push({ chave: "dfd.assinatura", status: "acerto", texto: "Assinatura digital conferida.", ancora: "assinatura" });
    else if (d.assinatura.status === "dropsigner") out.push({ chave: "dfd.assinatura", status: "acerto", texto: "Assinatura reconhecida via Dropsigner (Lacuna).", ancora: "assinatura" });
    else if (d.assinatura.status === "sem-assinatura") out.push({ chave: "dfd.assinatura", status: "acerto", texto: "Documento sem assinatura digital (.xlsx) — não exigida.", ancora: "assinatura" });
    else out.push({
      chave: "dfd.assinatura",
      status: comportamentoDe(regras, idAssin) === "bloqueia" ? "erro" : "atencao",
      texto: `Assinatura digital não conferida${d.assinatura.motivo ? `: ${d.assinatura.motivo}` : "."}`,
      ancora: "assinatura",
      cor: corImportancia(regras, idAssin),
    });
  }

  return out;
}

/** Contagem por status (para o botão "Ver mensagens (N erros · M atenções · K ok)"). */
export function contarMensagens(msgs: MensagemDfd[]): Record<StatusMensagem, number> {
  return {
    erro: msgs.filter((m) => m.status === "erro").length,
    atencao: msgs.filter((m) => m.status === "atencao").length,
    acerto: msgs.filter((m) => m.status === "acerto").length,
  };
}

// ---- Resumo COMPACTO do estado (célula "Estado" das tabelas de DFDs e de itens) ----

/**
 * Rótulo CURTO (≤3 palavras) por ponto de conferência (`chave`) — para a célula "Estado" APONTAR o
 * erro diretamente, em vez de "Com erro"/"Atenção". Sem entrada ⇒ cai no texto completo da mensagem.
 */
export const ROTULO_CURTO: Record<string, string> = {
  "item.valorUnitario": "Item sem valor",
  "item.quantidade": "Item sem quantidade",
  "dfd.reparticao": "Sem unidade",
  "dfd.orgao": "Órgão não identificado",
  "dfd.orgaoUnidadeDivergente": "Órgão × unidade",
  "dfd.anoPca": "Sem ano PCA",
  "dfd.justificativa": "Sem justificativa",
  "dfd.previsao": "Sem previsão",
  "dfd.prioridade": "Sem prioridade",
  "dfd.fundamentacao": "Sem fundamentação",
  "dfd.referenciaRenovacao": "DFD-R sem referência",
  "dfd.assinatura": "Sem assinatura",
  "protocolo.dfdDuplicado": "DFD duplicado",
  "item.naoCatalogado": "Fora de catálogo",
  "item.divergenteCatalogo": "Divergente do catálogo",
  "item.tipoIncompativel": "Tipo incompatível",
  "item.duplicado": "Item duplicado",
};

/** Resumo compacto para a célula "Estado": o problema PRINCIPAL (rótulo curto + cor), os contadores
 * "+N" por severidade (erros em vermelho, atenções em âmbar) e o `titulo` (lista completa) p/ o
 * tooltip (atributo `title`, sem precisar abrir o DFD/item). */
export type ResumoEstado = {
  rotulo: string; // rótulo curto do PRINCIPAL ("" ⇒ regular; a UI mantém "Regular")
  cor: string; // cor do principal (danger/warn) ou --ok
  extraErros: number; // erros ALÉM do principal (contador "+N" vermelho)
  extraAtencoes: number; // atenções a mostrar como "+N" âmbar
  titulo: string; // lista completa (erros + atenções) p/ o tooltip nativo (`title`)
};

/**
 * Monta o resumo da célula "Estado" a partir das mensagens (só erros/atenções contam). PRINCIPAL =
 * 1º erro; sem erros, 1ª atenção. Sem problema ⇒ `rotulo:""` (regular, nada muda). Puro/testável.
 */
export function resumoEstado(msgs: { status: StatusMensagem; chave: string; texto: string; cor?: string }[]): ResumoEstado {
  const erros = msgs.filter((m) => m.status === "erro");
  const atencoes = msgs.filter((m) => m.status === "atencao");
  const principal = erros[0] ?? atencoes[0];
  if (!principal) return { rotulo: "", cor: "var(--ok)", extraErros: 0, extraAtencoes: 0, titulo: "" };
  const ehErro = principal.status === "erro";
  const titulo = [...erros, ...atencoes].map((m) => `${m.status === "erro" ? "Erro" : "Atenção"}: ${m.texto}`).join("\n");
  return {
    rotulo: ROTULO_CURTO[principal.chave] ?? principal.texto,
    // A cor SEGUE a importância do ponto (definida pelo ADM em `mensagensDfd`); sem `cor`
    // explícita, cai na severidade (erro=vermelho / atenção=âmbar).
    cor: principal.cor ?? (ehErro ? "var(--danger)" : "var(--warn)"),
    extraErros: ehErro ? erros.length - 1 : 0,
    extraAtencoes: ehErro ? atencoes.length : atencoes.length - 1,
    titulo,
  };
}

/** Mensagens (erro) das faltas PRÓPRIAS de um item da Seção 4 (valor unitário/quantidade) — para o
 * resumo da célula "Estado" da tabela de itens. A conformidade com o catálogo é coluna à parte. */
export function mensagensItem(it: DfdItemParseado): { status: StatusMensagem; chave: string; texto: string }[] {
  const out: { status: StatusMensagem; chave: string; texto: string }[] = [];
  if (it.valorUnitario == null || it.valorUnitario <= 0)
    out.push({ status: "erro", chave: "item.valorUnitario", texto: "Item sem valor unitário." });
  if (it.quantidade == null) out.push({ status: "erro", chave: "item.quantidade", texto: "Item sem quantidade." });
  return out;
}

// ---- Tipo da assinatura (coluna "Assinatura") ----
export type GrupoAssinatura = "centi" | "dropsigner" | "adobe";

/** Grupo do tipo de assinatura pela `fonte`. Certificado/sistema = **Centi** (sistema oficial da
 * Prefeitura); dropsigner = **Dropsigner**; adobe = **Adobe**. */
export function grupoAssinatura(fonte: string): GrupoAssinatura {
  if (fonte === "dropsigner") return "dropsigner";
  if (fonte === "adobe") return "adobe";
  return "centi";
}

export const ASSINATURA_ROTULO: Record<GrupoAssinatura, string> = {
  centi: "Centi",
  dropsigner: "Dropsigner",
  adobe: "Adobe",
};

/** Grupos DISTINTOS de assinatura presentes (ordem fixa centi→dropsigner→adobe). Vazio ⇒ sem
 * assinatura reconhecida. */
export function gruposAssinatura(assinaturas: { fonte: string }[]): GrupoAssinatura[] {
  const set = new Set(assinaturas.map((a) => grupoAssinatura(a.fonte)));
  return (["centi", "dropsigner", "adobe"] as GrupoAssinatura[]).filter((g) => set.has(g));
}

/**
 * Faltas CIRÚRGICAS e ACIONÁVEIS de um DFD: aponta EXATAMENTE onde está o erro (quais
 * itens, qual seção) e O QUE fazer para corrigir. Puro/testável. Alimenta o relatório
 * (despacho) e o relatório do DFD. Respeita os níveis do ADM: pontos em "ignorar" não
 * aparecem (config padrão ⇒ mesma saída de hoje).
 */
export function faltasCirurgicasDfd(
  d: {
    itens: DfdItemParseado[];
    secoes: DfdSecao[];
    reparticaoId?: number | null;
    assinaturaMotivo?: string | null;
    tipo?: string | null;
  },
  regras: RegrasAvaliacao = regrasPadrao(),
  ctx?: { categoria?: string | null } & CtxConformidade,
): string[] {
  const c = { dfdTipo: tipoCurtoDfd(d.tipo ?? null), categoria: ctx?.categoria ?? null };
  const ativo = (chave: ChaveAvaliacao) => comportamentoNo(regras, chave, c) !== "ignora";
  const linhas: string[] = [];
  const nums = (its: DfdItemParseado[]) =>
    its.map((i) => i.item).filter((n): n is number => n != null);
  const semVU = d.itens.filter((i) => i.valorUnitario == null || i.valorUnitario <= 0);
  const semQtd = d.itens.filter((i) => i.quantidade == null);
  if (ativo("item.valorUnitario") && semVU.length > 0)
    linhas.push(`Informar o VALOR UNITÁRIO ${semVU.length === 1 ? "do item" : "dos itens"} ${listaItens(nums(semVU))} (Seção 4).`);
  if (ativo("item.quantidade") && semQtd.length > 0)
    linhas.push(`Informar a QUANTIDADE ${semQtd.length === 1 ? "do item" : "dos itens"} ${listaItens(nums(semQtd))} (Seção 4).`);
  if (ativo("dfd.reparticao") && d.reparticaoId == null)
    linhas.push("Vincular o DFD à repartição/Setor requisitante responsável.");
  for (const s of SECOES_OBRIGATORIAS)
    if (ativo(s.chave) && !temSecaoPreenchida(d.secoes, s.kw)) linhas.push(`Preencher a ${s.rotulo}.`);
  if (d.assinaturaMotivo && ativo("dfd.assinatura"))
    linhas.push(`Regularizar a assinatura digital: ${d.assinaturaMotivo}.`);
  // Conformidade com o catálogo (itens) — veredito pré-computado no ctx (sem catálogo ⇒ nada).
  const foraCat = ativo("item.naoCatalogado") ? itensComFaltaCatalogo(d.itens, ctx?.conformidade, "naoCatalogado") : [];
  if (foraCat.length > 0)
    linhas.push(`Cadastrar no catálogo (ou corrigir o código) ${foraCat.length === 1 ? "o item" : "os itens"} ${listaItens(nums(foraCat))} (Seção 4).`);
  const divCat = ativo("item.divergenteCatalogo") ? itensComFaltaCatalogo(d.itens, ctx?.conformidade, "divergenteCatalogo") : [];
  if (divCat.length > 0)
    linhas.push(`Padronizar pelo catálogo (descrição/unidade) ${divCat.length === 1 ? "o item" : "os itens"} ${listaItens(nums(divCat))} (Seção 4).`);
  const tipoCat = ativo("item.tipoIncompativel") ? itensComFaltaCatalogo(d.itens, ctx?.conformidade, "tipoIncompativel") : [];
  if (tipoCat.length > 0)
    linhas.push(`Rever o tipo do DFD ou o catálogo — ${tipoCat.length === 1 ? "o item não permite" : "os itens não permitem"} este tipo (${listaItens(nums(tipoCat))}, Seção 4).`);
  return linhas;
}

/** Relatório de UM DFD (lista cirúrgica de pendências, copiável). Puro. */
export function linhasRelatorioDfd(info: {
  numero: string;
  planejamento?: string | null;
  tipo?: string | null;
  faltas: string[]; // de `faltasCirurgicasDfd`
}): string[] {
  const tipo = tipoCurtoDfd(info.tipo);
  const linhas: string[] = [
    `DFD ${info.numero}${tipo ? ` (${tipo})` : ""}${info.planejamento ? ` — Planejamento ${info.planejamento}` : ""}`,
  ];
  if (info.faltas.length === 0) {
    linhas.push("Sem pendências.");
    return linhas;
  }
  linhas.push("Pendências a corrigir:");
  info.faltas.forEach((f, i) => {
    linhas.push(`  ${i + 1}. ${f}`);
  });
  return linhas;
}

/**
 * Relatório de UM PROTOCOLO em formato de **DESPACHO DE DEVOLUÇÃO** — pronto para
 * copiar e devolver o processo para correção. Cada pendência é cirúrgica (aponta o
 * DFD/capa e o que fazer). Puro.
 */
export function linhasRelatorioProtocolo(info: {
  numero: string;
  idExterno?: string | null;
  interessado?: string | null;
  assunto?: string | null;
  capaMotivo?: string | null;
  dfds: { numero: string; planejamento?: string | null; tipo?: string | null; faltas: string[] }[]; // só os com pendência
}): string[] {
  const L: string[] = ["DESPACHO DE DEVOLUÇÃO PARA CORREÇÃO", ""];
  L.push(`Processo nº ${info.numero}${info.idExterno ? ` (Id ${info.idExterno})` : ""}`);
  if (info.interessado) L.push(`Interessado: ${info.interessado}`);
  if (info.assunto) L.push(`Assunto: ${info.assunto}`);
  L.push("");
  L.push(
    "Analisado o presente processo, constataram-se as pendências abaixo. Devolve-se para correção antes da protocolização:",
  );
  L.push("");
  let n = 1;
  if (info.capaMotivo) {
    L.push(`${n}. CAPA DO PROCESSO: ${info.capaMotivo}`);
    n++;
  }
  // Agrupa numa ÚNICA mensagem os DFDs com EXATAMENTE as mesmas pendências (evita repetir o
  // mesmo texto de erro várias vezes). Cada DFD é referenciado por número + nº de planejamento.
  const grupos = new Map<string, { dfds: { numero: string; planejamento?: string | null }[]; faltas: string[] }>();
  for (const d of info.dfds) {
    const chave = d.faltas.join("");
    const g = grupos.get(chave);
    if (g) g.dfds.push({ numero: d.numero, planejamento: d.planejamento });
    else grupos.set(chave, { dfds: [{ numero: d.numero, planejamento: d.planejamento }], faltas: d.faltas });
  }
  for (const g of grupos.values()) {
    const refs = g.dfds
      .map((d) => `${d.numero}${d.planejamento ? ` (Planej. ${d.planejamento})` : ""}`)
      .join(", ");
    L.push(`${n}. ${g.dfds.length === 1 ? "DFD" : "DFDs"} ${refs}:`);
    for (const f of g.faltas) L.push(`   - ${f}`);
    n++;
  }
  if (n === 1) L.push("Nenhuma pendência encontrada.");
  L.push("");
  L.push("Sanadas as pendências, reencaminhe-se o processo para nova análise e protocolização.");
  return L;
}
