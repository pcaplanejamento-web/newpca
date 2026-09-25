import { norm } from "./parse-dfd-comum.ts";

/**
 * Núcleo PURO das regras de avaliação (sem `getDb` → testável no Node, como
 * `theme.ts`/`password.ts`). Define QUE pontos de Protocolo/DFD/Item podem ser
 * avaliados, quais são editáveis na análise e quais têm ajuste automático. As
 * **importâncias** (o rigor de cada ponto) são uma LISTA gerenciável pelo ADM —
 * cada uma com nome, cor e um COMPORTAMENTO. O carregador com cache/D1 fica em `avaliacao.ts`.
 */

// Comportamento = o que a engine faz com um ponto (o enum REAL da avaliação):
// - bloqueia: trava importar/protocolar (erro);
// - avisa: só sinaliza (atenção âmbar), não bloqueia;
// - automatico: tenta corrigir sozinho e nunca bloqueia (só onde há corretor);
// - ignora: não avalia.
export type Comportamento = "bloqueia" | "avisa" | "automatico" | "ignora";

export const COMPORTAMENTO_ROTULO: Record<Comportamento, string> = {
  bloqueia: "Bloqueia",
  avisa: "Avisa",
  automatico: "Automático",
  ignora: "Ignora",
};

// Uma IMPORTÂNCIA (nível de rigor). O ADM cria/edita/exclui; cada ponto referencia uma por ID.
export type Importancia = {
  id: string;
  nome: string;
  cor: string; // hex livre (#rrggbb)
  comportamento: Comportamento;
  ordem: number;
  builtin?: boolean; // as 4 base: nome/cor editáveis, comportamento fixo, não excluíveis
};

// As 4 importâncias base. Os IDs são as strings históricas de `Nivel` → a config já
// gravada (ex.: { "dfd.previsao": "ignorar" }) continua valendo sem migração.
export const IMPORTANCIAS_PADRAO: Importancia[] = [
  { id: "fundamental", nome: "Fundamental", cor: "#dc2626", comportamento: "bloqueia", ordem: 1, builtin: true },
  { id: "intermediario", nome: "Intermediário", cor: "#ca8a04", comportamento: "avisa", ordem: 2, builtin: true },
  { id: "automatico", nome: "Automático", cor: "#2563eb", comportamento: "automatico", ordem: 3, builtin: true },
  { id: "ignorar", nome: "Ignorar", cor: "#586173", comportamento: "ignora", ordem: 4, builtin: true },
];

const BUILTIN_POR_COMPORTAMENTO: Record<Comportamento, string> = {
  bloqueia: "fundamental",
  avisa: "intermediario",
  automatico: "automatico",
  ignora: "ignorar",
};

/** `Nivel` = ID da importância gravada por ponto (mantém as assinaturas existentes). */
export type Nivel = string;

// Estados de CICLO (rótulo/cor editáveis, mas fixos em quantidade — não são importâncias).
export type EstadoCicloId = "editado" | "regularizado" | "regular" | "pendente";
export type EstadoCicloCfg = { nome: string; cor: string };
export const ESTADOS_CICLO_PADRAO: Record<EstadoCicloId, EstadoCicloCfg> = {
  editado: { nome: "Editado", cor: "#2563eb" }, // --info
  regularizado: { nome: "Regularizado", cor: "#16a34a" }, // --ok
  regular: { nome: "Regular", cor: "#16a34a" }, // --ok
  pendente: { nome: "Pendente", cor: "#586173" }, // --muted
};
export const ESTADOS_CICLO_ORDEM: EstadoCicloId[] = ["editado", "regularizado", "regular", "pendente"];

export type Sujeito = "protocolo" | "dfd" | "item";

export type ChaveAvaliacao =
  | "protocolo.numero"
  | "protocolo.reparticao"
  | "protocolo.anoPca"
  | "protocolo.valorCapa"
  | "protocolo.semDfdEmErro"
  | "protocolo.dfdDuplicado"
  | "dfd.planejamento"
  | "dfd.reparticao"
  | "dfd.tipo"
  | "dfd.orgao"
  | "dfd.orgaoUnidadeDivergente"
  | "dfd.justificativa"
  | "dfd.previsao"
  | "dfd.prioridade"
  | "dfd.fundamentacao"
  | "dfd.anoPca"
  | "dfd.assinatura"
  | "dfd.referenciaRenovacao"
  | "item.valorUnitario"
  | "item.quantidade"
  | "item.naoCatalogado"
  | "item.divergenteCatalogo"
  | "item.tipoIncompativel"
  | "item.duplicado";

export type PontoAvaliacao = {
  chave: ChaveAvaliacao;
  sujeito: Sujeito;
  rotulo: string;
  descricao: string;
  /** Comportamentos que este ponto ACEITA (a UI só oferece importâncias com estes comportamentos). */
  comportamentosPermitidos: Comportamento[];
  /** Comportamento padrão (reproduz o comportamento atual). */
  comportamentoPadrao: Comportamento;
  /** O usuário pode editar este campo na análise (conferência do DFD)? Só onde faz sentido. */
  suportaEdicao?: boolean;
  editavelPadrao?: boolean;
  /** Aceita ajuste automático por palavras-chave (troca o texto todo da seção)? */
  suportaAuto?: boolean;
  /** A FALTA do ponto (vazio/fora do padrão que o ajuste automático NÃO corrigiu) segue a lógica padrão
   * dos ERROS mesmo no comportamento "automático" — o automático só corrige, nunca rebaixa a falta. */
  faltaEhErro?: boolean;
};

const BASE = ["bloqueia", "avisa", "ignora"] as Comportamento[];
const BASE_AUTO = ["bloqueia", "avisa", "automatico", "ignora"] as Comportamento[];

// Catálogo = fonte única do levantamento: alimenta a UI, os defaults e a validação.
// Os `comportamentoPadrao` reproduzem EXATAMENTE o comportamento atual (config vazia ⇒ igual a hoje).
export const CATALOGO_AVALIACAO: PontoAvaliacao[] = [
  // ---- PROTOCOLO ----
  { chave: "protocolo.numero", sujeito: "protocolo", rotulo: "Número do processo", descricao: "Número do protocolo informado na capa (sempre obrigatório — é a chave do processo).", comportamentosPermitidos: ["bloqueia"], comportamentoPadrao: "bloqueia" },
  { chave: "protocolo.reparticao", sujeito: "protocolo", rotulo: "Repartição do protocolo", descricao: "Repartição/Setor definido para o processo.", comportamentosPermitidos: BASE, comportamentoPadrao: "bloqueia", suportaEdicao: true, editavelPadrao: true },
  { chave: "protocolo.anoPca", sujeito: "protocolo", rotulo: "Ano do PCA", descricao: "PCA (ano) definido para o processo.", comportamentosPermitidos: BASE, comportamentoPadrao: "bloqueia" },
  { chave: "protocolo.valorCapa", sujeito: "protocolo", rotulo: "Valor da capa × somatória", descricao: "Valor da capa diferente de zero e igual à soma dos DFDs (a substituição pela somatória continua manual).", comportamentosPermitidos: BASE, comportamentoPadrao: "bloqueia" },
  { chave: "protocolo.semDfdEmErro", sujeito: "protocolo", rotulo: "Sem DFD ou item com erro", descricao: "Nenhum DFD do envio pode estar com erro — nem por um item: o erro é o que a importância de cada ponto de DFD e de Item manda bloquear. Sempre obrigatório: a protocolação nunca deixa um DFD ou item para trás (tire do envio o que não deve ir).", comportamentosPermitidos: ["bloqueia"], comportamentoPadrao: "bloqueia" },
  { chave: "protocolo.dfdDuplicado", sujeito: "protocolo", rotulo: "DFD duplicado", descricao: "Dois ou mais DFDs do processo com o MESMO nº de DFD ou de planejamento. O usuário escolhe um para prosseguir; os demais ficam descartados (fora da somatória e da protocolação).", comportamentosPermitidos: BASE, comportamentoPadrao: "bloqueia" },
  // ---- DFD ----
  { chave: "dfd.planejamento", sujeito: "dfd", rotulo: "Nº de planejamento", descricao: "DFD com o número de planejamento (identificador do Centi, imutável). Sem ele o DFD fica com ERRO — corrija no Centi e reenvie o DFD.", comportamentosPermitidos: BASE, comportamentoPadrao: "bloqueia" },
  { chave: "dfd.reparticao", sujeito: "dfd", rotulo: "Unidade / Setor", descricao: "DFD vinculado a uma unidade.", comportamentosPermitidos: BASE, comportamentoPadrao: "bloqueia", suportaEdicao: true, editavelPadrao: true },
  { chave: "dfd.tipo", sujeito: "dfd", rotulo: "Tipo do DFD", descricao: "DFD com tipo definido (DFD-S/R/O/E). Muitos formulários não trazem o 'Tipo DFD' — o usuário escolhe na análise (seleção ou edição em massa).", comportamentosPermitidos: BASE, comportamentoPadrao: "bloqueia", suportaEdicao: true, editavelPadrao: true },
  { chave: "dfd.orgao", sujeito: "dfd", rotulo: "Órgão identificado", descricao: "Aviso quando o 'Órgão/Entidade' do DFD não corresponde a nenhum órgão cadastrado (sem órgão não dá para escopar/prever a unidade). Não bloqueia por padrão.", comportamentosPermitidos: BASE, comportamentoPadrao: "avisa" },
  { chave: "dfd.orgaoUnidadeDivergente", sujeito: "dfd", rotulo: "Órgão × Unidade (divergência)", descricao: "Aviso quando o Órgão/Entidade do DFD aponta um órgão diferente do órgão dono da unidade casada pelo Setor Requisitante. Não bloqueia por padrão.", comportamentosPermitidos: BASE, comportamentoPadrao: "avisa" },
  { chave: "dfd.justificativa", sujeito: "dfd", rotulo: "§3 Justificativa", descricao: "Justificativa da necessidade preenchida.", comportamentosPermitidos: BASE, comportamentoPadrao: "bloqueia" },
  { chave: "dfd.previsao", sujeito: "dfd", rotulo: "§5 Previsão de entrega", descricao: "Previsão de entrega/execução preenchida (normalizada automaticamente).", comportamentosPermitidos: BASE_AUTO, comportamentoPadrao: "bloqueia", suportaEdicao: true, editavelPadrao: true, suportaAuto: true },
  { chave: "dfd.prioridade", sujeito: "dfd", rotulo: "§6 Prioridade", descricao: "Prioridade da compra/contratação preenchida (normalizada automaticamente). No Automático, a FALTA (vazia ou fora de ALTA/MÉDIA/BAIXA) continua ERRO — o ajuste só corrige o que dá para corrigir.", comportamentosPermitidos: BASE_AUTO, comportamentoPadrao: "bloqueia", suportaEdicao: true, editavelPadrao: true, suportaAuto: true, faltaEhErro: true },
  { chave: "dfd.fundamentacao", sujeito: "dfd", rotulo: "§7 Fundamentação legal", descricao: "Fundamentação legal preenchida (há o botão 'Preencher padrão → Lei 14.133/2021' no banner).", comportamentosPermitidos: BASE_AUTO, comportamentoPadrao: "bloqueia", suportaEdicao: true, editavelPadrao: true, suportaAuto: true },
  { chave: "dfd.anoPca", sujeito: "dfd", rotulo: "Ano do PCA", descricao: "PCA (ano) definido no DFD.", comportamentosPermitidos: BASE, comportamentoPadrao: "bloqueia" },
  { chave: "dfd.assinatura", sujeito: "dfd", rotulo: "Assinatura digital", descricao: "Assinatura digital válida (PDF exige assinatura; .xlsx é opcional).", comportamentosPermitidos: BASE, comportamentoPadrao: "bloqueia" },
  { chave: "dfd.referenciaRenovacao", sujeito: "dfd", rotulo: "Referência de renovação (DFD-R)", descricao: "DFD-R com contrato, ARP ou licitação.", comportamentosPermitidos: BASE, comportamentoPadrao: "avisa", suportaEdicao: true, editavelPadrao: true },
  // ---- ITEM ----
  { chave: "item.valorUnitario", sujeito: "item", rotulo: "Valor unitário", descricao: "Todo item com valor unitário maior que zero.", comportamentosPermitidos: BASE, comportamentoPadrao: "bloqueia" },
  { chave: "item.quantidade", sujeito: "item", rotulo: "Quantidade", descricao: "Todo item com quantidade informada. (O item sempre marca em vermelho quando falta; o nível decide se bloqueia.)", comportamentosPermitidos: BASE, comportamentoPadrao: "avisa" },
  // Conformidade com o CATÁLOGO (referência de padronização). Só vale quando há catálogo
  // cadastrado; padrão "avisa", não bloqueia (o ADM eleva para bloquear).
  { chave: "item.naoCatalogado", sujeito: "item", rotulo: "Item não catalogado", descricao: "Item cujo código não existe no catálogo de produtos (a referência de padronização). Só vale quando há catálogo cadastrado.", comportamentosPermitidos: BASE, comportamentoPadrao: "avisa" },
  { chave: "item.divergenteCatalogo", sujeito: "item", rotulo: "Divergente do catálogo", descricao: "Código existe no catálogo, mas a descrição e/ou a unidade de medida diferem do valor canônico.", comportamentosPermitidos: BASE, comportamentoPadrao: "avisa" },
  { chave: "item.tipoIncompativel", sujeito: "item", rotulo: "Tipo de DFD incompatível", descricao: "O tipo do DFD (DFD-S/R/O/E) não está entre os tipos permitidos do item no catálogo. (Item sem tipos definidos vale para qualquer tipo.)", comportamentosPermitidos: BASE, comportamentoPadrao: "avisa" },
  // Item repetido NUNCA bloqueia (regra do usuário): só aponta — o ponto não aceita importância que bloqueia.
  { chave: "item.duplicado", sujeito: "item", rotulo: "Item duplicado", descricao: "Dois ou mais itens do MESMO DFD com o mesmo código, a mesma descrição E a mesma unidade (o mesmo código com descrição diferente — ex.: outro local — é legítimo). Nunca bloqueia: aponta (atenção) e, no detalhe do item, mostra os repetidos lado a lado para tratar — remover ou unificar as quantidades.", comportamentosPermitidos: ["avisa", "ignora"], comportamentoPadrao: "avisa" },
];

const POR_CHAVE = new Map<ChaveAvaliacao, PontoAvaliacao>(CATALOGO_AVALIACAO.map((p) => [p.chave, p]));

export function pontoAvaliacao(chave: ChaveAvaliacao): PontoAvaliacao | undefined {
  return POR_CHAVE.get(chave);
}

// Tipos de DFD FIXOS (código curto de `tipoCurtoDfd`) — eixo de exceção.
export const TIPOS_DFD = ["DFD-S", "DFD-R", "DFD-O", "DFD-E"] as const;
export const TIPO_DFD_ROTULO: Record<(typeof TIPOS_DFD)[number], string> = {
  "DFD-S": "DFD-S · Solução",
  "DFD-R": "DFD-R · Renovação",
  "DFD-O": "DFD-O · Ordinário",
  "DFD-E": "DFD-E",
};

// Categorias de Protocolo FIXAS (o assunto da capa é sempre uma destas palavras).
export type CategoriaProtocolo = { key: string; label: string };
export const CATEGORIAS: CategoriaProtocolo[] = [
  { key: "inclusao", label: "INCLUSÃO" },
  { key: "exclusao", label: "EXCLUSÃO" },
  { key: "alteracao-nao-onerosa", label: "ALTERAÇÃO NÃO ONEROSA" },
];

/** Uma regra de ajuste automático: se o texto casar com qualquer `termo`, vira `valor`. */
export type SinonimoRegra = { termos: string[]; valor: string };

/** Assunto CADASTRADO pelo ADM (allow-list): protocolo cujo assunto CONTÉM o `termo` é permitido. */
export type AssuntoPermitido = { id: string; termo: string };
/**
 * Trava de protocolação + liga/desliga dos botões. TUDO opcional → ausência = comportamento de
 * hoje (nada barra, botões ligados). As travas só valem quando o ADM as ATIVA (após cadastrar).
 */
export type GateProtocolacao = {
  exigirAssunto?: boolean; // trava: o assunto do protocolo tem de estar cadastrado
  exigirTipo?: boolean; // trava: TODO DFD tem de ter um tipo permitido
  protocolarHabilitado?: boolean; // botão Protocolar (default: ligado)
  importarDfdHabilitado?: boolean; // botão Importar DFD avulso (default: ligado)
};

export type RegrasAvaliacao = {
  pontos: Partial<Record<ChaveAvaliacao, Nivel>>; // id de importância global por ponto
  exProtocolo: Record<string, Partial<Record<ChaveAvaliacao, Nivel>>>; // por categoria (key)
  exDfd: Record<string, Partial<Record<ChaveAvaliacao, Nivel>>>; // por tipo de DFD (DFD-S/R/O/E)
  /** Campo editável (true) ou travado (false) na análise; só para pontos com `suportaEdicao`. */
  editaveis: Partial<Record<ChaveAvaliacao, boolean>>;
  /** Palavras-chave de ajuste automático por ponto (só para pontos com `suportaAuto`). */
  sinonimos: Partial<Record<ChaveAvaliacao, SinonimoRegra[]>>;
  /** Importâncias gerenciáveis pelo ADM (undefined = as 4 base). */
  importancias?: Importancia[];
  /** Rótulo/cor dos estados de ciclo (undefined = padrão). */
  estadosCiclo?: Partial<Record<EstadoCicloId, EstadoCicloCfg>>;
  /** Assuntos permitidos a protocolar (allow-list; vazio/ausente = nenhum cadastrado). */
  assuntos?: AssuntoPermitido[];
  /** Tipos de DFD permitidos a protocolar (subset de `TIPOS_DFD`; vazio/ausente = todos). */
  tiposProtocolo?: string[];
  /** Trava de protocolação + botões (ausente = sem trava, botões ligados). */
  gate?: GateProtocolacao;
};

/** Regras "vazias" = tudo no padrão do catálogo (comportamento atual). */
export function regrasPadrao(): RegrasAvaliacao {
  return { pontos: {}, exProtocolo: {}, exDfd: {}, editaveis: {}, sinonimos: {} };
}

// Memo por IDENTIDADE do objeto `regras` (imutável por request/render — loaders cacheiam, o
// coerce cria um objeto novo, o ADM monta um body novo ao salvar). Colapsa os N rebuilds do
// hot path (import em lote: milhares de `nivelDe`/`comportamentoNo`) num único cálculo.
const _cacheImportancias = new WeakMap<RegrasAvaliacao, Importancia[]>();

/**
 * Lista efetiva de importâncias: garante SEMPRE as 4 base (comportamento fixo; nome/cor do
 * gravado, se editado) + as customizadas válidas, ordenadas. Fonte única de resolução.
 */
export function importanciasDe(regras: RegrasAvaliacao): Importancia[] {
  const cached = _cacheImportancias.get(regras);
  if (cached) return cached;
  const stored = Array.isArray(regras.importancias) ? regras.importancias : [];
  const porId = new Map(stored.map((i) => [i.id, i]));
  const base = IMPORTANCIAS_PADRAO.map((b) => {
    const s = porId.get(b.id);
    return s ? { ...b, nome: s.nome?.trim() || b.nome, cor: s.cor?.trim() || b.cor, ordem: s.ordem ?? b.ordem } : b;
  });
  const baseIds = new Set(IMPORTANCIAS_PADRAO.map((b) => b.id));
  const custom = stored.filter(
    (i) => i && typeof i.id === "string" && !baseIds.has(i.id) && i.comportamento && i.nome,
  );
  const out = [...base, ...custom].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  _cacheImportancias.set(regras, out);
  return out;
}

/** Importância por ID (fallback seguro: "ignora" — nunca bloqueia). */
export function importanciaDe(regras: RegrasAvaliacao, id: string): Importancia {
  const todas = importanciasDe(regras); // sempre inclui as 4 base (garantido)
  return todas.find((i) => i.id === id) ?? todas.find((i) => i.id === "ignorar") ?? todas[todas.length - 1];
}

export function comportamentoDe(regras: RegrasAvaliacao, id: string): Comportamento {
  return importanciaDe(regras, id).comportamento;
}
export function corImportancia(regras: RegrasAvaliacao, id: string): string {
  return importanciaDe(regras, id).cor;
}
export function nomeImportancia(regras: RegrasAvaliacao, id: string): string {
  return importanciaDe(regras, id).nome;
}

/** ID da importância PADRÃO de um ponto (a base do seu `comportamentoPadrao`). */
export function importanciaPadraoDe(chave: ChaveAvaliacao): string {
  const comp = POR_CHAVE.get(chave)?.comportamentoPadrao ?? "ignora";
  return BUILTIN_POR_COMPORTAMENTO[comp];
}

/** Cor da importância BASE de um comportamento (para estados de severidade sem contexto). */
export function corComportamentoPadrao(regras: RegrasAvaliacao, comp: Comportamento): string {
  return corImportancia(regras, BUILTIN_POR_COMPORTAMENTO[comp]);
}

/** Config de um estado de ciclo (rótulo/cor), com fallback ao padrão. */
export function estadoCicloCfg(regras: RegrasAvaliacao, id: EstadoCicloId): EstadoCicloCfg {
  return regras.estadosCiclo?.[id] ?? ESTADOS_CICLO_PADRAO[id];
}

/**
 * Importância efetiva (ID) de um ponto: exceção por categoria (protocolo) ou por tipo de
 * DFD vence a global, que vence o padrão do catálogo. Um ID gravado só vale se resolver a
 * um comportamento PERMITIDO para o ponto (defensivo: IDs órfãos caem no padrão).
 */
export function nivelDe(
  regras: RegrasAvaliacao,
  chave: ChaveAvaliacao,
  ctx?: { dfdTipo?: string | null; categoria?: string | null },
): Nivel {
  const ponto = POR_CHAVE.get(chave);
  const compById = new Map(importanciasDe(regras).map((i) => [i.id, i.comportamento]));
  const permitido = (id: string | undefined): id is string => {
    if (id == null) return false;
    const comp = compById.get(id);
    return comp != null && (ponto?.comportamentosPermitidos.includes(comp) ?? false);
  };
  const exCat = ctx?.categoria ? regras.exProtocolo?.[ctx.categoria]?.[chave] : undefined;
  const exTipo = ctx?.dfdTipo ? regras.exDfd?.[ctx.dfdTipo]?.[chave] : undefined;
  if (permitido(exCat)) return exCat;
  if (permitido(exTipo)) return exTipo;
  const global = regras.pontos?.[chave];
  if (permitido(global)) return global;
  return importanciaPadraoDe(chave);
}

/** Comportamento efetivo de um ponto (atalho `comportamentoDe(regras, nivelDe(...))`). */
export function comportamentoNo(
  regras: RegrasAvaliacao,
  chave: ChaveAvaliacao,
  ctx?: { dfdTipo?: string | null; categoria?: string | null },
): Comportamento {
  return comportamentoDe(regras, nivelDe(regras, chave, ctx));
}

/**
 * Importância (ID) aplicada à FALTA de um ponto — a efetiva (`nivelDe`), exceto no "automático" de um
 * ponto `faltaEhErro` (ex.: §6 Prioridade): o ajuste automático só CORRIGE; o que ele não corrigiu é
 * ERRO (importância base "fundamental" — lógica padrão dos erros). Os demais pontos: igual a `nivelDe`.
 */
export function nivelDaFalta(
  regras: RegrasAvaliacao,
  chave: ChaveAvaliacao,
  ctx?: { dfdTipo?: string | null; categoria?: string | null },
): Nivel {
  const id = nivelDe(regras, chave, ctx);
  return POR_CHAVE.get(chave)?.faltaEhErro && comportamentoDe(regras, id) === "automatico" ? BUILTIN_POR_COMPORTAMENTO.bloqueia : id;
}

/** Comportamento aplicado à FALTA de um ponto (atalho `comportamentoDe(regras, nivelDaFalta(...))`). */
export function comportamentoDaFalta(
  regras: RegrasAvaliacao,
  chave: ChaveAvaliacao,
  ctx?: { dfdTipo?: string | null; categoria?: string | null },
): Comportamento {
  return comportamentoDe(regras, nivelDaFalta(regras, chave, ctx));
}

/** O campo pode ser editado pelo usuário na análise? (default: sim, onde há suporte). */
export function editavelDe(regras: RegrasAvaliacao, chave: ChaveAvaliacao): boolean {
  const p = POR_CHAVE.get(chave);
  if (!p?.suportaEdicao) return true; // campos sem suporte a travar seguem o fluxo normal
  return regras.editaveis?.[chave] ?? p.editavelPadrao ?? true;
}

/** Palavras-chave de ajuste automático definidas pelo ADM para o ponto. */
export function sinonimosDe(regras: RegrasAvaliacao, chave: ChaveAvaliacao): SinonimoRegra[] {
  const s = regras.sinonimos?.[chave];
  return Array.isArray(s) ? s : [];
}

/**
 * Aplica os sinônimos do ADM a um texto: se algum `termo` (normalizado) casar, devolve
 * o `valor` canônico (troca o texto todo). `null` se nada casar. Puro.
 */
export function aplicarSinonimos(texto: string | null | undefined, sinonimos: SinonimoRegra[]): string | null {
  const s = norm(texto);
  if (!s) return null;
  for (const regra of sinonimos) {
    if ((regra.termos ?? []).some((t) => { const tt = norm(t); return tt.length > 0 && s.includes(tt); }))
      return regra.valor;
  }
  return null;
}

/**
 * Opções do SELETOR de assunto do protocolo: as categorias FIXAS (INCLUSÃO/EXCLUSÃO/ALTERAÇÃO NÃO
 * ONEROSA) + os assuntos CADASTRADOS pelo ADM, sem repetição (por `norm`), e o assunto ATUAL (lido da
 * capa) quando não é uma das opções — nunca some o valor existente. Puro.
 */
export function opcoesAssunto(regras: RegrasAvaliacao, atual?: string | null): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  const add = (v: string | null | undefined) => {
    const t = String(v ?? "").trim();
    const k = norm(t);
    if (!k || vistos.has(k)) return;
    vistos.add(k);
    out.push(t);
  };
  add(atual);
  for (const c of CATEGORIAS) add(c.label);
  for (const a of regras.assuntos ?? []) add(a?.termo);
  return out;
}

/** Classifica o `assunto` (texto da capa) numa categoria FIXA — casa pela palavra. `null` se nenhuma. */
export function classificarAssunto(assunto: string | null | undefined): string | null {
  const s = norm(assunto);
  if (!s) return null;
  for (const c of CATEGORIAS) {
    const alvo = norm(c.label);
    if (alvo.length > 0 && s.includes(alvo)) return c.key;
  }
  return null;
}

/** Coage um blob solto (JSON do D1) para `RegrasAvaliacao`, tolerante e com defaults. Os níveis gravados que não
 * valem mais (importância inexistente, ou com um comportamento que o ponto deixou de aceitar — ex.: `item.duplicado`
 * não bloqueia mais) SAEM: o ponto volta ao padrão e o ADM salva a configuração sem erro. */
export function coerceRegras(bruto: unknown): RegrasAvaliacao {
  const obj = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const out: RegrasAvaliacao = {
    pontos: {},
    exProtocolo: {},
    exDfd: {},
    editaveis: rec(obj.editaveis) as RegrasAvaliacao["editaveis"],
    sinonimos: rec(obj.sinonimos) as RegrasAvaliacao["sinonimos"],
  };
  if (Array.isArray(obj.importancias)) out.importancias = obj.importancias as Importancia[];
  if (obj.estadosCiclo && typeof obj.estadosCiclo === "object")
    out.estadosCiclo = obj.estadosCiclo as RegrasAvaliacao["estadosCiclo"];
  if (Array.isArray(obj.assuntos)) out.assuntos = obj.assuntos as AssuntoPermitido[];
  if (Array.isArray(obj.tiposProtocolo)) out.tiposProtocolo = obj.tiposProtocolo as string[];
  if (obj.gate && typeof obj.gate === "object") out.gate = obj.gate as GateProtocolacao;
  const comp = new Map(importanciasDe(out).map((i) => [i.id, i.comportamento]));
  const validos = (m: unknown): Partial<Record<ChaveAvaliacao, Nivel>> => {
    const r: Partial<Record<ChaveAvaliacao, Nivel>> = {};
    for (const [k, id] of Object.entries(rec(m))) {
      const c = typeof id === "string" ? comp.get(id) : undefined;
      if (c && POR_CHAVE.get(k as ChaveAvaliacao)?.comportamentosPermitidos.includes(c)) r[k as ChaveAvaliacao] = id as string;
    }
    return r;
  };
  const porContexto = (m: unknown): Record<string, Partial<Record<ChaveAvaliacao, Nivel>>> =>
    Object.fromEntries(
      Object.entries(rec(m))
        .map(([ctx, v]) => [ctx, validos(v)] as const)
        .filter(([, v]) => Object.keys(v).length > 0),
    );
  out.pontos = validos(obj.pontos);
  out.exProtocolo = porContexto(obj.exProtocolo);
  out.exDfd = porContexto(obj.exDfd);
  return out;
}

// ---- Trava de protocolação (assuntos + tipos permitidos) — puro/testável ----

/** O `assunto` do protocolo casa algum assunto cadastrado? (norm-contains, como as categorias). */
export function assuntoCadastrado(assunto: string | null | undefined, regras: RegrasAvaliacao): boolean {
  const s = norm(assunto);
  if (!s) return false;
  return (regras.assuntos ?? []).some((a) => {
    const t = norm(a?.termo);
    return t.length > 0 && s.includes(t);
  });
}

/** O tipo (curto, ex.: "DFD-S") está permitido a protocolar? Lista vazia/ausente = TODOS permitidos. */
export function tipoPermitido(tipoCurto: string | null | undefined, regras: RegrasAvaliacao): boolean {
  const permitidos = regras.tiposProtocolo;
  if (!permitidos || permitidos.length === 0) return true;
  return tipoCurto != null && permitidos.includes(tipoCurto);
}

/** Botão Protocolar habilitado? (default: sim). */
export function protocolarHabilitado(regras: RegrasAvaliacao): boolean {
  return regras.gate?.protocolarHabilitado ?? true;
}
/** Botão Importar DFD avulso habilitado? (default: sim). */
export function importarDfdHabilitado(regras: RegrasAvaliacao): boolean {
  return regras.gate?.importarDfdHabilitado ?? true;
}

export type ResultadoGate = { ok: boolean; motivos: string[] };

/**
 * Trava do protocolo INTEIRO: assunto cadastrado (se `exigirAssunto`) + TODO DFD com tipo
 * permitido (se `exigirTipo`). `tiposCurtos` = tipo curto de cada DFD do protocolo. Puro.
 * SEM configuração (gate ausente ou travas desligadas) ⇒ `ok:true` (comportamento de hoje).
 */
export function gateProtocolo(
  assunto: string | null | undefined,
  tiposCurtos: (string | null | undefined)[],
  regras: RegrasAvaliacao,
): ResultadoGate {
  const g = regras.gate ?? {};
  const motivos: string[] = [];
  if (g.exigirAssunto && !assuntoCadastrado(assunto, regras)) {
    motivos.push("Assunto do protocolo não cadastrado nas Configurações.");
  }
  if (g.exigirTipo) {
    const fora = tiposCurtos.filter((t) => !tipoPermitido(t, regras));
    if (fora.length > 0) {
      const nomes = [...new Set(fora.map((t) => t || "sem tipo"))].join(", ");
      motivos.push(`DFD(s) com tipo não permitido: ${nomes}.`);
    }
  }
  return { ok: motivos.length === 0, motivos };
}
