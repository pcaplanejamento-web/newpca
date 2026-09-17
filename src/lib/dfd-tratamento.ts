import {
  aplicarSinonimos,
  type ChaveAvaliacao,
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
): { dfd: DfdParseado; auto: CampoTratavel[] } {
  let secoes = dfd.secoes;
  const auto: CampoTratavel[] = [];
  const ctxTipo = { dfdTipo: tipoCurtoDfd(dfd.tipo) };

  for (const cfg of TRATAVEIS) {
    const raw = textoSecao(secoes, cfg.kw);
    // (1) Palavras-chave do ADM (só quando o ponto está em "automático" — respeita a exceção por tipo).
    if (nivelDe(regras, cfg.chave, ctxTipo) === "automatico") {
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
      const v = normPrevisao(raw);
      if (v.valor && v.auto) {
        secoes = setTextoSecao(secoes, cfg, v.valor);
        auto.push("previsao");
      }
    }
  }
  return { dfd: secoes === dfd.secoes ? dfd : { ...dfd, secoes }, auto };
}

// ---- Estado por DFD (para a tabela do protocolo) ----
export type EstadoDfd = "pendente" | "regular" | "regularizado" | "editado" | "atencao" | "erro";

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
};

/** Cor semântica por estado (token). Regularizado automaticamente = verde (é um sucesso);
 * atenção = âmbar (`--warn`, não é erro). */
export function estadoCor(e: EstadoDfd): string {
  if (e === "erro") return "var(--danger)";
  if (e === "atencao") return "var(--warn)";
  if (e === "editado") return "var(--info)";
  if (e === "regularizado") return "var(--ok)";
  if (e === "regular") return "var(--ok)";
  return "var(--muted)";
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
  "DFD de renovação (DFD-R) sem referência de contrato, ata (registro de preços) ou licitação — informar ao menos uma.";

// ---- Estado/Situação de um PROTOCOLO já gravado (para a tabela de protocolos) ----
// ESTADO = integridade do valor da capa × somatória dos DFDs; SITUAÇÃO = conteúdo.
export type EstadoProtocolo = "regular" | "atencao";

export function estadoProtocolo(
  p: { valorCapa: number | null; valorTotal: number; totalDfds: number },
  regras: RegrasAvaliacao = regrasPadrao(),
  ctx?: { categoria?: string | null },
): EstadoProtocolo {
  if (p.totalDfds === 0) return "regular"; // sem DFDs: nada a conferir
  // O ADM pode desligar a conferência do valor da capa ("ignorar").
  if (nivelDe(regras, "protocolo.valorCapa", { categoria: ctx?.categoria ?? null }) === "ignorar") return "regular";
  if (p.valorCapa == null || p.valorCapa <= 0 || !valoresBatem(p.valorCapa, p.valorTotal)) return "atencao";
  return "regular";
}

export const ESTADO_PROTOCOLO_ROTULO: Record<EstadoProtocolo, string> = {
  regular: "Regular",
  atencao: "Atenção",
};

export function estadoProtocoloCor(e: EstadoProtocolo): string {
  return e === "atencao" ? "var(--warn)" : "var(--ok)";
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

export function estadoItemCor(e: EstadoItem): string {
  return e === "erro" ? "var(--danger)" : "var(--ok)";
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
  const ativas = c.faltas.filter((f) => nivelDe(regras, CHAVE_FALTA_CATALOGO[f], { dfdTipo }) !== "ignorar");
  if (ativas.length === 0) return { nivel: "conforme", falta: null };
  const falta = piorFalta(ativas) as FaltaCatalogoItem;
  const nivel = nivelDe(regras, CHAVE_FALTA_CATALOGO[falta], { dfdTipo }) === "fundamental" ? "erro" : "atencao";
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
    (f) => nivelDe(regras, CHAVE_FALTA_CATALOGO[f], c) === "fundamental",
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
    if (nivelDe(regras, CHAVE_FALTA_CATALOGO[falta], c) !== "fundamental") continue;
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
    const n = nivelDe(regras, chave, c);
    if (n === "fundamental") bloqueantes.push(rotulo);
    else if (n === "intermediario" || n === "automatico") atencoes.push(rotulo);
    // "ignorar": não entra em lugar nenhum.
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
  add("dfd.referenciaRenovacao", dfdRSemReferencia(d), "referência de renovação (contrato, ata ou licitação)");
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
export type MensagemDfd = { chave: string; status: StatusMensagem; texto: string; ancora: string };

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
  valorEstimado?: number | null;
  valorTotal?: number | null;
  /** Resultado já conferido da assinatura (o chamador roda `validarAssinatura`). */
  assinatura?: { status: "ok" | "erro" | "sem-assinatura"; motivo?: string | null } | null;
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
    const n = nivelDe(regras, chave, c);
    if (n === "ignorar") return;
    if (ok) out.push({ chave, status: "acerto", texto: okTexto, ancora });
    else out.push({ chave, status: n === "fundamental" ? "erro" : "atencao", texto: faltaTexto, ancora });
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
      FALTA_REFERENCIA_RENOVACAO, "Referência de renovação informada (contrato, ata ou licitação).");
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
      const n = nivelDe(regras, CHAVE_FALTA_CATALOGO[cm.falta], c);
      if (n === "ignorar") continue;
      algumAtivo = true;
      const qtd = itensComFaltaCatalogo(d.itens, ctx.conformidade, cm.falta).length;
      if (qtd === 0) continue;
      algumProblema = true;
      out.push({ chave: CHAVE_FALTA_CATALOGO[cm.falta], status: n === "fundamental" ? "erro" : "atencao", texto: cm.texto(qtd), ancora: "itens" });
    }
    if (algumAtivo && !algumProblema && total > 0)
      out.push({ chave: "item.naoCatalogado", status: "acerto", texto: "Itens conferem com o catálogo de referência.", ancora: "itens" });
  }

  // Valor estimado (nota) × somatória
  if (d.valorEstimado != null && d.valorTotal != null) {
    add("dfd.valorEstimadoVsTotal", "valor", valoresBatem(d.valorEstimado, d.valorTotal),
      "Valor estimado (nota) difere da somatória dos itens.", "Valor estimado confere com a somatória dos itens.");
  }

  // Assinatura digital
  if (d.assinatura && nivelDe(regras, "dfd.assinatura", c) !== "ignorar") {
    if (d.assinatura.status === "ok") out.push({ chave: "dfd.assinatura", status: "acerto", texto: "Assinatura digital conferida.", ancora: "assinatura" });
    else if (d.assinatura.status === "sem-assinatura") out.push({ chave: "dfd.assinatura", status: "acerto", texto: "Documento sem assinatura digital (.xlsx) — não exigida.", ancora: "assinatura" });
    else out.push({
      chave: "dfd.assinatura",
      status: nivelDe(regras, "dfd.assinatura", c) === "fundamental" ? "erro" : "atencao",
      texto: `Assinatura digital não conferida${d.assinatura.motivo ? `: ${d.assinatura.motivo}` : "."}`,
      ancora: "assinatura",
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
  const ativo = (chave: ChaveAvaliacao) => nivelDe(regras, chave, c) !== "ignorar";
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
  dfds: { numero: string; tipo?: string | null; faltas: string[] }[]; // só os com pendência
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
  for (const d of info.dfds) {
    const tipo = tipoCurtoDfd(d.tipo);
    L.push(`${n}. DFD ${d.numero}${tipo ? ` (${tipo})` : ""}:`);
    for (const f of d.faltas) L.push(`   - ${f}`);
    n++;
  }
  if (n === 1) L.push("Nenhuma pendência encontrada.");
  L.push("");
  L.push("Sanadas as pendências, reencaminhe-se o processo para nova análise e protocolização.");
  return L;
}
