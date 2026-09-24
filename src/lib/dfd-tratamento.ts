import {
  aplicarSinonimos,
  type ChaveAvaliacao,
  comportamentoDaFalta,
  comportamentoDe,
  comportamentoNo,
  corComportamentoPadrao,
  corImportancia,
  estadoCicloCfg,
  nivelDaFalta,
  nivelDe,
  type RegrasAvaliacao,
  regrasPadrao,
  sinonimosDe,
  TIPO_DFD_ROTULO,
  TIPOS_DFD,
} from "./avaliacao-core.ts";
import { normPrevisao, normPrioridade, normUnidadeMedida, type Prioridade, valoresBatem } from "./normalize.ts";
import { type ConferenciaCompacta, type ConferenciaItem, type FaltaCatalogoItem, piorFalta, ROTULO_FALTA_CATALOGO } from "./catalogo-conferencia.ts";
import { normalizarCodigo } from "./parse-catalogo-comum.ts";
import {
  type DfdItemParseado,
  type DfdParseado,
  type DfdSecao,
  listaRefs,
  norm,
  refDfd,
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

/** PRIORIDADE do DFD pela seção (ALTA/MÉDIA/BAIXA; `null` = ausente ou fora do padrão) — a coluna das tabelas de DFDs e
 * itens (a lista da Mesa lê a MESMA seção no banco: `prioridadeTextoSql`). */
export const prioridadeDoDfd = (secoes: DfdSecao[]): Prioridade | null => normPrioridade(textoSecao(secoes, "PRIORIDADE")).valor;

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
 * Texto canônico da PREVISÃO a partir do editor (mês/ano/anual). É **um OU outro**: ANUAL (com ano
 * opcional → `ANUAL/AAAA`, senão só `ANUAL`) OU uma DATA `MÊS/AAAA` (exige mês E ano). Vazio = ainda a
 * preencher. Puro — usado pelo bloco Tratamento e pela edição em massa.
 */
export function buildPrevisao(mes: string, ano: string, anual: boolean): string {
  if (anual) return ano ? `ANUAL/${ano}` : "ANUAL";
  return mes && ano ? `${mes}/${ano}` : "";
}

// ---- Edição EM MASSA — fonte única (análise do protocolo, protocolo gravado e lista de DFDs) ----
export type CampoMassa = "reparticao" | "tipo" | "prioridade" | "previsao" | "fundamentacao";
/** Uma ação de massa: a UNIDADE (vive fora do conteúdo do DFD — o host aplica) ou um campo de CONTEÚDO. */
export type AcaoMassa =
  | { campo: "reparticao"; reparticaoId: number }
  | { campo: Exclude<CampoMassa, "reparticao">; valor: string };

/**
 * Aplica uma ação de massa de CONTEÚDO (tipo ou seção tratável) a UM DFD. O tipo aceita o código
 * curto ou o rótulo e grava o RÓTULO canônico (`TIPO_DFD_ROTULO`); as seções usam `setTextoSecao`
 * (cria a seção se faltava). Valor vazio/tipo inválido ⇒ sem efeito (devolve o mesmo objeto). A
 * `reparticao` é do host. Puro/genérico (DfdParseado ou o registro do servidor).
 */
export function aplicarMassaDfd<T extends { tipo: string | null; secoes: DfdSecao[] }>(d: T, acao: AcaoMassa): T {
  if (acao.campo === "reparticao") return d;
  const v = acao.valor.trim();
  if (!v) return d;
  if (acao.campo === "tipo") {
    const cod = tipoCurtoDfd(v) as (typeof TIPOS_DFD)[number] | null;
    if (!cod || !TIPOS_DFD.includes(cod)) return d;
    const rotulo = TIPO_DFD_ROTULO[cod];
    return d.tipo === rotulo ? d : { ...d, tipo: rotulo };
  }
  const cfg = TRATAVEIS.find((t) => t.campo === acao.campo);
  return cfg ? { ...d, secoes: setTextoSecao(d.secoes, cfg, v) } : d;
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

  // Seção TROCADA no formulário (ex.: DFD 136 real: "6 - FUNDAMENTAÇÃO LEGAL: BAIXA" e sem a seção de
  // PRIORIDADE) — o texto da fundamentação É uma prioridade: move para a PRIORIDADE (auto) e deixa a
  // fundamentação vazia (vira pendência a tratar).
  const [pCfg, , fCfg] = TRATAVEIS;
  const fundRaw = textoSecao(secoes, fCfg.kw);
  if (acharSecao(secoes, pCfg.kw) < 0 && /^(ALTA|MEDIA|BAIXA)$/.test(norm(fundRaw))) {
    const p = normPrioridade(fundRaw).valor;
    if (p) {
      secoes = setTextoSecao(setTextoSecao(secoes, fCfg, ""), pCfg, p);
      auto.push("prioridade");
    }
  }

  for (const cfg of TRATAVEIS) {
    if (cfg.campo === "prioridade" && auto.includes("prioridade")) continue; // já tratada acima
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
  return tipoCurtoDfd(d.tipo) === "DFD-R" && listaRefs([d.numeroContrato, d.numeroAta, d.numeroLicitacao].filter(Boolean).join(";")).length === 0;
}

/** Pendência (atenção) de um DFD-R sem referência — texto para o relatório opcional. */
export const FALTA_REFERENCIA_RENOVACAO =
  "DFD de renovação (DFD-R) sem referência de contrato, ARP ou licitação — informar ao menos uma.";

// ---- Conciliação do VALOR DA CAPA × somatória dos DFDs (fonte única: análise, gravado e lista) ----

/** Resultado da conciliação da capa. `ativa` = há o que conferir (DFDs + somatória completa + ponto não
 * ignorado); `divergente` = capa nula/zerada OU diferente da somatória; `bloqueia` = divergente e o ADM
 * pôs `protocolo.valorCapa` numa importância que bloqueia; `motivo` = linha do despacho (relatório). */
export type ConciliacaoCapa = {
  ativa: boolean;
  divergente: boolean;
  zerada: boolean;
  bloqueia: boolean;
  somatorio: number;
  motivo: string | null;
};

/** Valor em R$ (pt-BR) para as mensagens puras (sem depender do `format` do cliente). */
const reais = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Concilia o VALOR DA CAPA com a SOMATÓRIA dos DFDs (valor do DFD = Σ itens). Só confere quando há DFDs
 * e a somatória está COMPLETA (`completo` — na análise, todos os DFDs lidos; padrão `true` no gravado);
 * **não depende de os DFDs estarem sem erro** (antes a divergência sumia enquanto houvesse DFD com
 * erro). A somatória é arredondada ao centavo. Respeita `protocolo.valorCapa` do ADM (+ categoria). Puro.
 */
export function conciliacaoCapa(
  p: { valorCapa: number | null | undefined; somatorio: number; totalDfds: number; completo?: boolean },
  regras: RegrasAvaliacao = regrasPadrao(),
  ctx?: { categoria?: string | null },
): ConciliacaoCapa {
  const somatorio = Math.round((p.somatorio || 0) * 100) / 100;
  const inativa: ConciliacaoCapa = { ativa: false, divergente: false, zerada: false, bloqueia: false, somatorio, motivo: null };
  if (p.totalDfds <= 0 || p.completo === false) return inativa;
  const comp = comportamentoNo(regras, "protocolo.valorCapa", { categoria: ctx?.categoria ?? null });
  if (comp === "ignora") return inativa;
  const zerada = p.valorCapa == null || p.valorCapa <= 0;
  const divergente = zerada || !valoresBatem(p.valorCapa, somatorio);
  const motivo = !divergente
    ? null
    : zerada
      ? `Valor da capa ausente/zerado — informar o valor da capa (somatória dos DFDs: ${reais(somatorio)}).`
      : `Valor da capa (${reais(p.valorCapa as number)}) diferente da somatória dos DFDs (${reais(somatorio)}) — corrigir a capa.`;
  return { ativa: true, divergente, zerada, bloqueia: divergente && comp === "bloqueia", somatorio, motivo };
}

// ---- Estado de um PROTOCOLO (tabela de protocolos da Mesa) ----
// ESTADO = a capa + TODOS os problemas dos DFDs/itens do protocolo (`avaliarProtocolo`, conferencia-dfd).
// A SITUAÇÃO é de gestão — só as cadastradas pelo ADM (Configurações → Situações).
export type EstadoProtocolo = "erro" | "atencao" | "regular";

export const ESTADO_PROTOCOLO_ROTULO: Record<EstadoProtocolo, string> = {
  erro: "Com erro",
  atencao: "Atenção",
  regular: "Regular",
};

export function estadoProtocoloCor(e: EstadoProtocolo, regras?: RegrasAvaliacao): string {
  if (!regras) return e === "erro" ? "var(--danger)" : e === "atencao" ? "var(--warn)" : "var(--ok)";
  if (e === "erro") return corComportamentoPadrao(regras, "bloqueia");
  return e === "atencao" ? corComportamentoPadrao(regras, "avisa") : estadoCicloCfg(regras, "regular").cor;
}

// ---- Estado por ITEM da tabela (mesma ideia do estado por DFD) ----
export type EstadoItem = "erro" | "regular";

/** Valor unitário AUSENTE — vazio, zero, negativo ou não numérico (NaN viraria `null` no JSON e o servidor
 * recusaria): a MESMA régua em toda conferência, no cliente e no servidor. */
export const semValorUnitario = (v: number | null | undefined): boolean => v == null || !Number.isFinite(v) || v <= 0;

/** Faltas de um item da Seção 4 (o que impede o DFD de ser importado). */
export function faltasDoItem(it: DfdItemParseado): string[] {
  const faltas: string[] = [];
  if (semValorUnitario(it.valorUnitario)) faltas.push("valor unitário");
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
 * DFDs DUPLICADOS num protocolo — relação DIRETA (não transitiva): para cada DFD, os ÍNDICES dos OUTROS que têm o
 * MESMO nº de DFD **ou** o MESMO nº de planejamento (em ordem crescente; vazio = sem duplicata). A escolha "manter
 * este" descarta só quem conflita com ELE — um DFD ligado apenas a um descartado (A~B pelo nº, B~C pelo
 * planejamento: manter A tira B e C continua) nunca é descartado à toa. `numero`/`planejamento` vazios NÃO ligam
 * DFDs. Puro/testável.
 */
export function duplicadosDfds(lista: { numero: string | null; planejamento: string | null }[]): number[][] {
  const chave = (v: string | null | undefined) => (v ?? "").trim();
  const porNumero = new Map<string, number[]>();
  const porPlan = new Map<string, number[]>();
  const juntar = (m: Map<string, number[]>, k: string, i: number) => {
    if (!k) return;
    const g = m.get(k);
    if (g) g.push(i);
    else m.set(k, [i]);
  };
  lista.forEach((d, i) => {
    juntar(porNumero, chave(d.numero), i);
    juntar(porPlan, chave(d.planejamento), i);
  });
  return lista.map((d, i) => {
    const outros = new Set<number>();
    for (const j of porNumero.get(chave(d.numero)) ?? []) if (j !== i) outros.add(j);
    for (const j of porPlan.get(chave(d.planejamento)) ?? []) if (j !== i) outros.add(j);
    return [...outros].sort((a, b) => a - b);
  });
}

/** Por que dois DFDs do processo são duplicados (a comparação mostra): mesmo nº de DFD, de planejamento ou os dois. */
export function motivoDuplicidade(
  a: { numero: string | null; planejamento: string | null },
  b: { numero: string | null; planejamento: string | null },
): string {
  const igual = (x: string | null, y: string | null) => !!(x ?? "").trim() && (x ?? "").trim() === (y ?? "").trim();
  const num = igual(a.numero, b.numero);
  const plan = igual(a.planejamento, b.planejamento);
  return num && plan ? "mesmo nº de DFD e de planejamento" : num ? "mesmo nº de DFD" : "mesmo nº de planejamento";
}

type ItemDup = { codigo?: string | null; descricao?: string | null; unidade?: string | null };

/** Chave de deduplicação de um item: código (só dígitos) + descrição normalizada + UNIDADE normalizada. O MESMO
 * código com descrição DIFERENTE é legítimo (ex.: o mesmo serviço em locais diferentes — DFD 136 real, itens 3 e
 * 4), e a mesma descrição em OUTRA unidade (UN × CX) é outra compra — nenhum dos dois é duplicata. `null` quando
 * não há código nem descrição. */
function chaveDupItem(it: ItemDup): string | null {
  const cod = normalizarCodigo(it.codigo ?? "");
  const desc = norm(it.descricao ?? "");
  if (!cod && !desc) return null;
  return `${cod}|${desc}|${normUnidadeMedida(it.unidade)}`;
}

/** Remove UM item (tratamento do item duplicado) e recomputa o `valorTotal` do DFD. Puro. */
export function removerItemDfd<
  I extends { valorTotal: number | null },
  T extends { itens: I[]; valorTotal: number | null },
>(d: T, idx: number): T {
  const itens = d.itens.filter((_, i) => i !== idx);
  const soma = itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
  return { ...d, itens, valorTotal: soma > 0 ? Math.round(soma * 100) / 100 : null };
}

/**
 * Grupos de ITENS REPETIDOS num DFD: itens com a MESMA chave (código + descrição + unidade). Cada grupo devolve os
 * ÍNDICES (2+), em ordem; lista vazia = sem repetição. Puro/testável.
 */
export function itensDuplicados(itens: ItemDup[]): number[][] {
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

/** Para cada item REPETIDO, o GRUPO inteiro de iguais (índices em ordem, INCLUSIVE ele) — o MESMO array para todos os
 * membros (linear, mesmo com milhares de itens iguais). Item sem repetição não entra. Puro. */
export function mapaItensDuplicados(itens: ItemDup[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const g of itensDuplicados(itens)) for (const i of g) m.set(i, g);
  return m;
}

/** Os OUTROS índices do grupo de `i` (sem ele), no máximo `max` — as listas exibidas não crescem com o grupo. */
export function outrosDoGrupo(grupo: number[], i: number, max = Number.POSITIVE_INFINITY): number[] {
  const out: number[] = [];
  for (const j of grupo) {
    if (out.length >= max) break;
    if (j !== i) out.push(j);
  }
  return out;
}

/** Item REPETIDO para a célula/mensagem: o Nº de até 10 iguais + quantos são ao todo (a lista não cresce com o grupo). */
export type RepeticaoItem = { iguais: (number | null)[]; total: number };
const MAX_IGUAIS = 10;

/** Lista PLANA de itens de VÁRIOS DFDs (visão Itens da Mesa): para cada item repetido NO SEU DFD, os iguais (chave =
 * `id` da linha). Agrupa por DFD e reusa `mapaItensDuplicados` — linear. Puro. */
export function repetidosPorDfd(itens: (ItemDup & { id: number; dfdId: number; item: number | null })[]): Map<number, RepeticaoItem> {
  const porDfd = new Map<number, typeof itens>();
  for (const it of itens) {
    const g = porDfd.get(it.dfdId);
    if (g) g.push(it);
    else porDfd.set(it.dfdId, [it]);
  }
  const out = new Map<number, RepeticaoItem>();
  for (const lista of porDfd.values()) {
    for (const [i, grupo] of mapaItensDuplicados(lista))
      out.set(lista[i].id, { iguais: outrosDoGrupo(grupo, i, MAX_IGUAIS).map((j) => lista[j].item), total: grupo.length - 1 });
  }
  return out;
}

/** O mesmo para os itens de UM DFD (tabela de itens do banner): índice → os iguais. */
export function repetidosDoDfd(itens: (ItemDup & { item?: number | null })[]): Map<number, RepeticaoItem> {
  const out = new Map<number, RepeticaoItem>();
  for (const [i, grupo] of mapaItensDuplicados(itens))
    out.set(i, { iguais: outrosDoGrupo(grupo, i, MAX_IGUAIS).map((j) => itens[j].item ?? j + 1), total: grupo.length - 1 });
  return out;
}

/** Os itens de um grupo de repetidos podem ser UNIFICADOS (as quantidades somadas num só)? Exige a quantidade em
 * todos e o MESMO valor unitário (> 0) — senão o valor do item unificado seria inventado. `null` = pode; senão, o
 * motivo (a tela mostra). Puro. */
export function motivoNaoUnificar(itens: { quantidade: number | null; valorUnitario: number | null }[]): string | null {
  if (itens.length < 2) return "Não há item repetido para unificar.";
  if (itens.some((it) => it.quantidade == null || !Number.isFinite(it.quantidade) || it.quantidade <= 0))
    return "Há item sem quantidade — informe a quantidade antes de unificar.";
  if (itens.some((it) => semValorUnitario(it.valorUnitario))) return "Há item sem valor unitário — informe o valor antes de unificar.";
  const vu = itens[0].valorUnitario as number;
  if (itens.some((it) => Math.abs((it.valorUnitario as number) - vu) >= 0.005))
    return "Valores unitários diferentes — iguale o valor (cadeado) ou remova o item repetido.";
  return null;
}

/**
 * UNIFICA itens repetidos (tratamento do item duplicado): o item `manter` recebe a SOMA das quantidades e dos valores
 * totais do grupo, os `outros` saem do DFD e o total do DFD é recomputado (a soma não muda). Só age quando
 * `motivoNaoUnificar` é `null`; índice inválido ⇒ o DFD volta igual. Puro.
 */
export function unificarItensDfd<
  I extends { quantidade: number | null; valorUnitario: number | null; valorTotal: number | null },
  T extends { itens: I[]; valorTotal: number | null },
>(d: T, manter: number, outros: number[]): T {
  const alvo = d.itens[manter];
  const tira = new Set(outros.filter((j) => j !== manter && j >= 0 && j < d.itens.length));
  if (!alvo || tira.size === 0) return d;
  const grupo = [alvo, ...[...tira].map((j) => d.itens[j])];
  if (motivoNaoUnificar(grupo)) return d;
  const quantidade = Math.round(grupo.reduce((s, it) => s + (it.quantidade as number), 0) * 1e6) / 1e6;
  const totais = grupo.every((it) => it.valorTotal != null && Number.isFinite(it.valorTotal));
  const soma = totais ? grupo.reduce((s, it) => s + (it.valorTotal as number), 0) : quantidade * (alvo.valorUnitario as number);
  const valorTotal = Math.round(soma * 100) / 100;
  const itens = d.itens.flatMap((it, i) => (tira.has(i) ? [] : i === manter ? [{ ...it, quantidade, valorTotal }] : [it]));
  const total = itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
  return { ...d, itens, valorTotal: total > 0 ? Math.round(total * 100) / 100 : null };
}

/** Índice de um item depois de REMOVER outros da lista (os removidos antes dele o deslocam). Puro. */
export function indiceAposRemover(idx: number, removidos: number[]): number {
  return idx - removidos.filter((j) => j < idx).length;
}

// ---- Faltas CIRÚRGICAS + relatório em formato de DESPACHO (copiável) ----

/** Seções obrigatórias do DFD (fonte única — `faltasObrigatorias` no `dfd-validation`
 * também usa esta lista). O `rotulo` já indica a seção exata a corrigir. */
/** O que cada seção tratável precisa conter (dica do despacho quando está fora do padrão). */
const DICA_PADRAO_SECAO: Record<string, string> = {
  PRIORIDADE: "informar ALTA, MÉDIA ou BAIXA",
  "PREVISAO DE ENTREGA": "informar o MÊS/ANO ou ANUAL",
  "FUNDAMENTACAO LEGAL": "citar a norma (ex.: Lei 14.133/2021)",
};

export const SECOES_OBRIGATORIAS: { chave: ChaveAvaliacao; kw: string; rotulo: string; titulo: string; numero: number }[] = [
  { chave: "dfd.justificativa", kw: "JUSTIFICATIVA", rotulo: "Justificativa da necessidade (Seção 3)", titulo: "JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO", numero: 3 },
  { chave: "dfd.previsao", kw: "PREVISAO DE ENTREGA", rotulo: "Previsão de entrega/execução (Seção 5)", titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", numero: 5 },
  { chave: "dfd.prioridade", kw: "PRIORIDADE", rotulo: "Prioridade da compra/contratação (Seção 6)", titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", numero: 6 },
  { chave: "dfd.fundamentacao", kw: "FUNDAMENTACAO LEGAL", rotulo: "Fundamentação legal (Seção 7)", titulo: "FUNDAMENTAÇÃO LEGAL", numero: 7 },
];

function temSecaoPreenchida(secoes: { titulo: string; texto: string }[], kw: string): boolean {
  return secoes.some((s) => norm(s.titulo).includes(kw) && s.texto.trim().length > 0);
}

/** Fundamentação legal PLAUSÍVEL: cita norma (número, lei, decreto, artigo…). "BAIXA" não é. */
const RE_FUNDAMENTACAO = /\d|\bLEI\b|DECRETO|\bART|PORTARIA|RESOLUC|INSTRUC|CONSTITUIC|ESTATUTO|CODIGO/;

/**
 * Situação de uma seção obrigatória — a MESMA régua do bloco "Tratamento" (o que lá aparece como
 * "tratar" aqui é pendência): `vazia`; `invalida` = preenchida mas fora do padrão (prioridade que não
 * é ALTA/MÉDIA/BAIXA, previsão que não é MÊS/AAAA nem ANUAL, fundamentação sem norma); `ok`. Puro.
 */
export function situacaoSecao(
  secoes: { titulo: string; texto: string }[],
  kw: string,
  anoPca?: number | null,
): "ok" | "vazia" | "invalida" {
  if (!temSecaoPreenchida(secoes, kw)) return "vazia";
  const t = textoSecao(secoes as DfdSecao[], kw);
  if (kw === "PRIORIDADE") return normPrioridade(t).valor ? "ok" : "invalida";
  if (kw === "PREVISAO DE ENTREGA") return normPrevisao(t, anoPca).valor ? "ok" : "invalida";
  if (kw === "FUNDAMENTACAO LEGAL") return RE_FUNDAMENTACAO.test(norm(t)) ? "ok" : "invalida";
  return "ok";
}

/** Formata uma lista de nº de item ("3, 5, 8" — trunca se for enorme). */
function listaItens(nums: number[]): string {
  const s = nums.slice(0, 30).join(", ");
  return nums.length > 30 ? `${s} … (+${nums.length - 30})` : s;
}

/** O DFD tem nº de planejamento (não vazio)? */
export const temPlanejamento = (p: string | null | undefined): boolean => (p ?? "").trim() !== "";

/** Dados de um DFD para avaliação (subconjunto de `DfdParseado`, + tipo/refs). */
export type EntradaAvaliacaoDfd = {
  /** Nº de planejamento (identificador do Centi) — OBRIGATÓRIO no tipo: todo chamador informa (vazio = falta). */
  planejamento: string | null;
  reparticaoId?: number | null;
  /** Ano do PCA (completa a previsão só com o MÊS). */
  anoPca?: number | null;
  itens: {
    valorUnitario?: number | null;
    quantidade?: number | null;
    codigo?: string | null;
    descricao?: string | null;
    unidade?: string | null;
    item?: number | null;
  }[];
  secoes: { titulo: string; texto: string }[];
  tipo?: string | null;
  numeroContrato?: string | null;
  numeroAta?: string | null;
  numeroLicitacao?: string | null;
};

/** Os itens REPETIDOS por grupo, pelo Nº do item (na ordem da tabela) — as mensagens apontam "7 = 114". */
function gruposItensRepetidos(itens: EntradaAvaliacaoDfd["itens"]): number[][] {
  return itensDuplicados(itens).map((g) => g.map((i) => itens[i].item ?? i + 1));
}

/** "7 = 114; 12 = 151 = 160" (trunca se for enorme: grupo grande e muitos grupos). */
function listaGruposItens(grupos: number[][]): string {
  const um = (g: number[]) => (g.length > 6 ? `${g.slice(0, 6).join(" = ")} = … (${g.length} iguais)` : g.join(" = "));
  const s = grupos.slice(0, 12).map(um).join("; ");
  return grupos.length > 12 ? `${s} … (+${grupos.length - 12} grupos)` : s;
}

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
  c: ConferenciaCompacta | null | undefined,
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

/** Rótulo da célula "Catálogo" (Conforme / Fora do catálogo / Divergente / Tipo incompatível); sem veredito = "". */
export function rotuloVeredictoCatalogo(v: VeredictoLinhaCatalogo | null): string {
  return v ? (v.falta ? ROTULO_FALTA_CATALOGO[v.falta] : "Conforme") : "";
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
    // Comportamento da FALTA: o "automático" de um ponto `faltaEhErro` (Prioridade) não rebaixa a falta.
    const comp = comportamentoDaFalta(regras, chave, c);
    if (comp === "bloqueia") bloqueantes.push(rotulo);
    else if (comp === "avisa" || comp === "automatico") atencoes.push(rotulo);
    // "ignora": não entra em lugar nenhum.
  };
  // Ordem preserva a de `faltasObrigatorias` (valor unitário → repartição → seções).
  const semVU = d.itens.length === 0 || d.itens.some((i) => semValorUnitario(i.valorUnitario));
  add("item.valorUnitario", semVU, "valor unitário em todos os itens");
  // `=== null` (não `== null`): só conta quando a quantidade foi realmente informada
  // como ausente — evita falso-positivo quando o chamador nem carrega a quantidade.
  add("item.quantidade", d.itens.some((i) => i.quantidade === null), "quantidade em todos os itens");
  // Item REPETIDO nunca bloqueia (só aponta — o ponto não aceita "bloqueia"): confira e trate no detalhe do item.
  add("item.duplicado", itensDuplicados(d.itens).length > 0, "itens repetidos (mesmo código, descrição e unidade)");
  add("dfd.planejamento", !temPlanejamento(d.planejamento), "número de planejamento");
  add("dfd.reparticao", d.reparticaoId == null, "unidade vinculada");
  add("dfd.tipo", c.dfdTipo == null, "tipo do DFD (DFD-S/R/O/E)");
  // Órgão identificado + divergência órgão×unidade: flags PRÉ-COMPUTADAS pelo chamador (que tem o
  // cadastro) e passadas no ctx — mantêm `avaliarDfd` puro. Só bloqueiam se o ADM elevar a
  // "fundamental" (padrão = intermediário ⇒ atenção, não bloqueia; ctx ausente ⇒ sem efeito).
  add("dfd.orgao", ctx?.orgaoNaoIdentificado === true, "órgão identificado (Órgão/Entidade)");
  add("dfd.orgaoUnidadeDivergente", ctx?.orgaoUnidadeDivergente === true, "órgão × unidade divergentes");
  for (const s of SECOES_OBRIGATORIAS) add(s.chave, situacaoSecao(d.secoes, s.kw, d.anoPca) !== "ok", s.rotulo);
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
export type MensagemDfd = {
  chave: string;
  status: StatusMensagem;
  texto: string;
  ancora: string;
  cor?: string;
  /** Rótulo CURTO específico (célula/filtro "Estado") — sobrepõe o `ROTULO_CURTO` da chave. */
  rotulo?: string;
};

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
  assinatura?: {
    status: "ok" | "dropsigner" | "ocr" | "erro" | "sem-assinatura";
    motivo?: string | null;
    /** Só em `ok`: "auto" (o sistema conferiu) ou "equipe" (validada à mão) + o responsável. */
    origem?: "auto" | "equipe";
    responsavel?: string | null;
  } | null;
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
  const add = (chave: ChaveAvaliacao, ancora: string, ok: boolean, faltaTexto: string, okTexto: string, rotulo?: string) => {
    if (comportamentoNo(regras, chave, c) === "ignora") return;
    if (ok) {
      out.push({ chave, status: "acerto", texto: okTexto, ancora });
      return;
    }
    // A FALTA segue a importância da falta (o "automático" da Prioridade não a rebaixa — é erro).
    const id = nivelDaFalta(regras, chave, c);
    const status: StatusMensagem = comportamentoDe(regras, id) === "bloqueia" ? "erro" : "atencao";
    out.push({ chave, status, texto: faltaTexto, ancora, cor: corImportancia(regras, id), ...(rotulo ? { rotulo } : {}) });
  };
  const plural = (n: number) => (n === 1 ? "item" : "itens");

  // Nº de planejamento (identificador do Centi) — ancorado no bloco de identificação (Nº DFD/Planejamento/Ano).
  add("dfd.planejamento", "anoPca", temPlanejamento(d.planejamento),
    "DFD sem número de planejamento — corrija no Centi e reenvie o DFD.", `Nº de planejamento: ${d.planejamento ?? ""}.`);

  // Unidade / Setor (topo do banner)
  add("dfd.reparticao", "reparticao", d.reparticaoId != null,
    "Unidade/Setor requisitante não vinculado.", "Unidade/Setor requisitante vinculado.");

  // Tipo do DFD (DFD-S/R/O/E) — obrigatório conforme o nível do ADM; tratável por seleção.
  add("dfd.tipo", "tipo", c.dfdTipo != null,
    "Tipo do DFD não identificado — selecione DFD-S, DFD-R, DFD-O ou DFD-E.", `Tipo do DFD definido${c.dfdTipo ? `: ${c.dfdTipo}` : ""}.`);

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
    const sit = situacaoSecao(d.secoes, s.kw, d.anoPca);
    add(
      s.chave,
      ancora,
      sit === "ok",
      sit === "vazia"
        ? `${s.rotulo} não preenchida — destrave a seção (cadeado) para preencher.`
        : `${s.rotulo} fora do padrão — trate no bloco Tratamento ou destrave a seção.`,
      `${s.rotulo} preenchida.`,
      sit === "invalida" ? ROTULO_CURTO_INVALIDA[s.chave] : undefined,
    );
  }

  // Referência de renovação — só para DFD-R
  if (c.dfdTipo === "DFD-R") {
    add("dfd.referenciaRenovacao", "referenciaRenovacao", !dfdRSemReferencia(d),
      FALTA_REFERENCIA_RENOVACAO, "Referência de renovação informada (contrato, ARP ou licitação).");
  }

  // Itens (Seção 4)
  const total = d.itens.length;
  const semVU = d.itens.filter((i) => semValorUnitario(i.valorUnitario)).length;
  add("item.valorUnitario", "itens", total > 0 && semVU === 0,
    total === 0 ? "Nenhum item na tabela (Seção 4)." : `Falta valor unitário em ${semVU} de ${total} ${plural(total)} (Seção 4).`,
    `Valor unitário informado nos ${total} ${plural(total)} (Seção 4).`);
  const semQtd = d.itens.filter((i) => i.quantidade === null).length;
  add("item.quantidade", "itens", semQtd === 0,
    `Falta quantidade em ${semQtd} ${plural(semQtd)} (Seção 4).`, "Quantidade informada em todos os itens (Seção 4).");
  // Itens REPETIDOS (mesmo código, descrição e unidade) — só APONTA, nunca bloqueia: a tabela de itens marca cada um
  // ("Item duplicado") e o detalhe do item mostra os repetidos lado a lado para remover ou unificar.
  const repetidos = gruposItensRepetidos(d.itens);
  add("item.duplicado", "itens", repetidos.length === 0,
    `Itens repetidos (mesmo código, descrição e unidade): ${listaGruposItens(repetidos)}. Abra o item para comparar e tratar (remover ou unificar).`,
    "Sem itens repetidos (Seção 4).");

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
    const resp = d.assinatura.responsavel ? ` (${d.assinatura.responsavel})` : "";
    if (d.assinatura.status === "ok")
      out.push({
        chave: "dfd.assinatura",
        status: "acerto",
        texto: d.assinatura.origem === "equipe" ? `Assinatura validada pela equipe${resp}.` : `Assinatura validada automaticamente (auto)${resp}.`,
        ancora: "assinatura",
      });
    // Reconhecida (carimbo Dropsigner sem nome / lida por OCR) mas NÃO conferida com o responsável:
    // atenção (não bloqueia) até a equipe validar no bloco "Validação da assinatura".
    else if (d.assinatura.status === "dropsigner" || d.assinatura.status === "ocr")
      out.push({
        chave: "dfd.assinaturaValidar",
        status: "atencao",
        texto:
          d.assinatura.status === "ocr"
            ? "Assinatura lida por OCR não confere com o responsável da unidade — confira no PDF e valide pela equipe."
            : "Assinatura Dropsigner reconhecida só pelo código — confira o assinante e valide pela equipe.",
        ancora: "assinatura",
      });
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
  "dfd.planejamento": "Sem planejamento",
  "dfd.reparticao": "Sem unidade",
  "dfd.tipo": "Sem tipo",
  "dfd.orgao": "Órgão não identificado",
  "dfd.orgaoUnidadeDivergente": "Órgão × unidade",
  "dfd.anoPca": "Sem ano PCA",
  "dfd.justificativa": "Sem justificativa",
  "dfd.previsao": "Sem previsão",
  "dfd.prioridade": "Sem prioridade",
  "dfd.fundamentacao": "Sem fundamentação",
  "dfd.referenciaRenovacao": "DFD-R sem referência",
  "dfd.assinatura": "Assinatura não conferida",
  "dfd.assinaturaValidar": "Validar assinatura",
  "protocolo.dfdDuplicado": "DFD duplicado",
  "item.naoCatalogado": "Fora de catálogo",
  "item.divergenteCatalogo": "Divergente do catálogo",
  "item.tipoIncompativel": "Tipo incompatível",
  "item.duplicado": "Item duplicado",
};

/** Rótulo CURTO de uma seção obrigatória PREENCHIDA mas FORA DO PADRÃO (≠ "Sem …", que é vazia). */
export const ROTULO_CURTO_INVALIDA: Partial<Record<string, string>> = {
  "dfd.previsao": "Previsão inválida",
  "dfd.prioridade": "Prioridade inválida",
  "dfd.fundamentacao": "Fundamentação inválida",
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
  /** Rótulos curtos de TODOS os problemas (erros primeiro, sem repetir) — inclusive os ocultos no "+N":
   * alimentam o FILTRO da coluna "Estado" (filtrar por um problema acha a linha mesmo se não é o principal). */
  rotulos: string[];
};

/**
 * Monta o resumo da célula "Estado" a partir das mensagens (só erros/atenções contam). PRINCIPAL =
 * 1º erro; sem erros, 1ª atenção. Sem problema ⇒ `rotulo:""` (regular, nada muda). Puro/testável.
 */
export function resumoEstado(
  msgs: { status: StatusMensagem; chave: string; texto: string; cor?: string; rotulo?: string }[],
): ResumoEstado {
  const erros = msgs.filter((m) => m.status === "erro");
  const atencoes = msgs.filter((m) => m.status === "atencao");
  const principal = erros[0] ?? atencoes[0];
  if (!principal) return { rotulo: "", cor: "var(--ok)", extraErros: 0, extraAtencoes: 0, titulo: "", rotulos: [] };
  const ehErro = principal.status === "erro";
  const titulo = [...erros, ...atencoes].map((m) => `${m.status === "erro" ? "Erro" : "Atenção"}: ${m.texto}`).join("\n");
  const curto = (m: { chave: string; texto: string; rotulo?: string }) => m.rotulo ?? ROTULO_CURTO[m.chave] ?? m.texto;
  return {
    rotulo: curto(principal),
    rotulos: [...new Set([...erros, ...atencoes].map(curto))],
    // A cor SEGUE a importância do ponto (definida pelo ADM em `mensagensDfd`); sem `cor`
    // explícita, cai na severidade (erro=vermelho / atenção=âmbar).
    cor: principal.cor ?? (ehErro ? "var(--danger)" : "var(--warn)"),
    extraErros: ehErro ? erros.length - 1 : 0,
    extraAtencoes: ehErro ? atencoes.length : atencoes.length - 1,
    titulo,
  };
}

/** Mensagens das faltas PRÓPRIAS de um item da Seção 4 (valor unitário/quantidade = erro) e do item REPETIDO
 * (atenção) — para o resumo da célula "Estado" da tabela de itens. A conformidade com o catálogo é coluna à parte. */
export function mensagensItem(
  it: DfdItemParseado,
  /** Item REPETIDO: Nº de outros itens com o mesmo código, descrição e unidade (+ o total e a cor da importância do ADM). */
  repetido?: (RepeticaoItem & { cor?: string }) | null,
): { status: StatusMensagem; chave: string; texto: string; cor?: string }[] {
  const out: { status: StatusMensagem; chave: string; texto: string; cor?: string }[] = [];
  if (semValorUnitario(it.valorUnitario)) out.push({ status: "erro", chave: "item.valorUnitario", texto: "Item sem valor unitário." });
  if (it.quantidade == null) out.push({ status: "erro", chave: "item.quantidade", texto: "Item sem quantidade." });
  // Repetido = ATENÇÃO (nunca erro): confira no detalhe do item e remova/unifique o que for duplicado.
  if (repetido && repetido.total > 0) {
    const mais = repetido.total - repetido.iguais.length;
    out.push({
      status: "atencao",
      chave: "item.duplicado",
      texto: `Item repetido — mesmo código, descrição e unidade do item ${repetido.iguais.map((n) => n ?? "—").join(", ")}${mais > 0 ? ` (+${mais})` : ""}.`,
      ...(repetido.cor ? { cor: repetido.cor } : {}),
    });
  }
  return out;
}

// ---- Tipo da assinatura (coluna "Assinatura") ----
export type GrupoAssinatura = "centi" | "dropsigner" | "adobe" | "foxit" | "manual";

/** Grupo do tipo de assinatura pela `fonte`. Certificado/sistema = **Centi** (sistema oficial da
 * Prefeitura); dropsigner = **Dropsigner**; adobe = **Adobe**; foxit = **Foxit** (ICP-Brasil lida por
 * OCR — Formato E). */
export function grupoAssinatura(fonte: string): GrupoAssinatura {
  if (fonte === "dropsigner") return "dropsigner";
  if (fonte === "adobe") return "adobe";
  if (fonte === "foxit") return "foxit";
  if (fonte === "manual") return "manual"; // atestada pela equipe (a leitura não achou a assinatura)
  return "centi";
}

export const ASSINATURA_ROTULO: Record<GrupoAssinatura, string> = {
  centi: "Centi",
  dropsigner: "Dropsigner",
  adobe: "Adobe",
  foxit: "Foxit",
  manual: "Equipe",
};

/** Grupos DISTINTOS de assinatura presentes (ordem fixa centi→dropsigner→adobe). Vazio ⇒ sem
 * assinatura reconhecida. */
export function gruposAssinatura(assinaturas: { fonte: string }[]): GrupoAssinatura[] {
  const set = new Set(assinaturas.map((a) => grupoAssinatura(a.fonte)));
  return (["centi", "dropsigner", "adobe", "foxit", "manual"] as GrupoAssinatura[]).filter((g) => set.has(g));
}

/**
 * Nºs de PLANEJAMENTO dos DFDs selecionados, prontos para colar em outro sistema: separados por ":"
 * SEM espaço nenhum (ex.: "1525:1549:1554"), na ordem recebida, sem vazios nem repetidos. Puro.
 */
export function textoPlanejamentos(planejamentos: (string | null | undefined)[]): string {
  const vistos = new Set<string>();
  for (const p of planejamentos) {
    const v = String(p ?? "").replace(/\s+/g, "");
    if (v && v !== "—") vistos.add(v);
  }
  return [...vistos].join(":");
}

/**
 * Faltas CIRÚRGICAS e ACIONÁVEIS de um DFD: aponta EXATAMENTE onde está o erro (quais
 * itens, qual seção) e O QUE fazer para corrigir. Puro/testável. Alimenta o relatório
 * (despacho) e o relatório do DFD. Respeita os níveis do ADM: pontos em "ignorar" não
 * aparecem (config padrão ⇒ mesma saída de hoje).
 */
export function faltasCirurgicasDfd(
  d: {
    planejamento: string | null;
    itens: DfdItemParseado[];
    secoes: DfdSecao[];
    reparticaoId?: number | null;
    assinaturaMotivo?: string | null;
    tipo?: string | null;
    anoPca?: number | null;
  },
  regras: RegrasAvaliacao = regrasPadrao(),
  ctx?: { categoria?: string | null } & CtxConformidade,
): string[] {
  const c = { dfdTipo: tipoCurtoDfd(d.tipo ?? null), categoria: ctx?.categoria ?? null };
  const ativo = (chave: ChaveAvaliacao) => comportamentoNo(regras, chave, c) !== "ignora";
  const linhas: string[] = [];
  const nums = (its: DfdItemParseado[]) =>
    its.map((i) => i.item).filter((n): n is number => n != null);
  const semVU = d.itens.filter((i) => semValorUnitario(i.valorUnitario));
  const semQtd = d.itens.filter((i) => i.quantidade == null);
  if (ativo("item.valorUnitario") && semVU.length > 0)
    linhas.push(`Informar o VALOR UNITÁRIO ${semVU.length === 1 ? "do item" : "dos itens"} ${listaItens(nums(semVU))} (Seção 4).`);
  const repetidos = ativo("item.duplicado") ? gruposItensRepetidos(d.itens) : [];
  if (repetidos.length > 0)
    linhas.push(`Conferir os itens REPETIDOS ${listaGruposItens(repetidos)} (mesmo código, descrição e unidade — Seção 4): remover ou unificar o que estiver duplicado.`);
  if (ativo("item.quantidade") && semQtd.length > 0)
    linhas.push(`Informar a QUANTIDADE ${semQtd.length === 1 ? "do item" : "dos itens"} ${listaItens(nums(semQtd))} (Seção 4).`);
  if (ativo("dfd.planejamento") && !temPlanejamento(d.planejamento))
    linhas.push("Informar o NÚMERO DE PLANEJAMENTO do DFD (corrigir no Centi e reenviar o DFD).");
  if (ativo("dfd.reparticao") && d.reparticaoId == null)
    linhas.push("Vincular o DFD à repartição/Setor requisitante responsável.");
  if (ativo("dfd.tipo") && c.dfdTipo == null) linhas.push("Definir o TIPO do DFD (DFD-S, DFD-R, DFD-O ou DFD-E).");
  for (const s of SECOES_OBRIGATORIAS) {
    if (!ativo(s.chave)) continue;
    const sit = situacaoSecao(d.secoes, s.kw, d.anoPca);
    if (sit === "vazia") linhas.push(`Preencher a ${s.rotulo}.`);
    else if (sit === "invalida") linhas.push(`Corrigir a ${s.rotulo} — ${DICA_PADRAO_SECAO[s.kw] ?? "fora do padrão"}.`);
  }
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
    const refs = g.dfds.map((d) => refDfd(d.numero, d.planejamento)).join(", ");
    L.push(`${n}. ${g.dfds.length === 1 ? "DFD" : "DFDs"} ${refs}:`);
    for (const f of g.faltas) L.push(`   - ${f}`);
    n++;
  }
  if (n === 1) L.push("Nenhuma pendência encontrada.");
  L.push("");
  L.push("Sanadas as pendências, reencaminhe-se o processo para nova análise e protocolização.");
  return L;
}
