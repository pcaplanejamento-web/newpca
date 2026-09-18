import { norm } from "./parse-dfd-comum.ts";

/**
 * Núcleo PURO das regras de avaliação (sem `getDb` → testável no Node, como
 * `theme.ts`/`password.ts`). Define QUE pontos de Protocolo/DFD/Item podem ser
 * avaliados, o nível padrão de cada um (que reproduz o comportamento atual), quais
 * são editáveis na análise e quais têm ajuste automático por palavras-chave. O ADM
 * controla tudo aqui; o carregador com cache/D1 fica em `avaliacao.ts`.
 */

// Nível de rigor de um ponto de avaliação:
// - fundamental: bloqueia importar/protocolar;
// - intermediario: só AVISA (estado de atenção, âmbar) — não bloqueia;
// - automatico: tenta corrigir sozinho e nunca bloqueia (só onde há corretor);
// - ignorar: não avalia.
export type Nivel = "fundamental" | "intermediario" | "automatico" | "ignorar";

export const NIVEL_ROTULO: Record<Nivel, string> = {
  fundamental: "Fundamental",
  intermediario: "Intermediário",
  automatico: "Automático",
  ignorar: "Ignorar",
};

export type Sujeito = "protocolo" | "dfd" | "item";

export type ChaveAvaliacao =
  | "protocolo.numero"
  | "protocolo.reparticao"
  | "protocolo.anoPca"
  | "protocolo.valorCapa"
  | "protocolo.semDfdEmErro"
  | "dfd.reparticao"
  | "dfd.orgao"
  | "dfd.orgaoUnidadeDivergente"
  | "dfd.justificativa"
  | "dfd.previsao"
  | "dfd.prioridade"
  | "dfd.fundamentacao"
  | "dfd.anoPca"
  | "dfd.assinatura"
  | "dfd.referenciaRenovacao"
  | "dfd.valorEstimadoVsTotal"
  | "item.valorUnitario"
  | "item.quantidade"
  | "item.naoCatalogado"
  | "item.divergenteCatalogo"
  | "item.tipoIncompativel";

export type PontoAvaliacao = {
  chave: ChaveAvaliacao;
  sujeito: Sujeito;
  rotulo: string;
  descricao: string;
  niveisPermitidos: Nivel[];
  nivelPadrao: Nivel;
  /** O usuário pode editar este campo na análise (conferência do DFD)? Só onde faz sentido. */
  suportaEdicao?: boolean;
  editavelPadrao?: boolean;
  /** Aceita ajuste automático por palavras-chave (troca o texto todo da seção)? */
  suportaAuto?: boolean;
};

// Catálogo = fonte única do levantamento: alimenta a UI, os defaults e a validação.
// Os `nivelPadrao` reproduzem EXATAMENTE o comportamento atual (config vazia ⇒ igual a hoje).
export const CATALOGO_AVALIACAO: PontoAvaliacao[] = [
  // ---- PROTOCOLO ----
  { chave: "protocolo.numero", sujeito: "protocolo", rotulo: "Número do processo", descricao: "Número do protocolo informado na capa (sempre obrigatório — é a chave do processo).", niveisPermitidos: ["fundamental"], nivelPadrao: "fundamental" },
  { chave: "protocolo.reparticao", sujeito: "protocolo", rotulo: "Repartição do protocolo", descricao: "Repartição/Setor definido para o processo.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental", suportaEdicao: true, editavelPadrao: true },
  { chave: "protocolo.anoPca", sujeito: "protocolo", rotulo: "Ano do PCA", descricao: "PCA (ano) definido para o processo.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "protocolo.valorCapa", sujeito: "protocolo", rotulo: "Valor da capa × somatória", descricao: "Valor da capa diferente de zero e igual à soma dos DFDs (a substituição pela somatória continua manual).", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "protocolo.semDfdEmErro", sujeito: "protocolo", rotulo: "Sem DFD com erro", descricao: "Nenhum DFD do processo pode estar com erro.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  // ---- DFD ----
  { chave: "dfd.reparticao", sujeito: "dfd", rotulo: "Unidade / Setor", descricao: "DFD vinculado a uma unidade.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental", suportaEdicao: true, editavelPadrao: true },
  { chave: "dfd.orgao", sujeito: "dfd", rotulo: "Órgão identificado", descricao: "Aviso quando o 'Órgão/Entidade' do DFD não corresponde a nenhum órgão cadastrado (sem órgão não dá para escopar/prever a unidade). Não bloqueia por padrão.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "intermediario" },
  { chave: "dfd.orgaoUnidadeDivergente", sujeito: "dfd", rotulo: "Órgão × Unidade (divergência)", descricao: "Aviso quando o Órgão/Entidade do DFD aponta um órgão diferente do órgão dono da unidade casada pelo Setor Requisitante. Não bloqueia por padrão.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "intermediario" },
  { chave: "dfd.justificativa", sujeito: "dfd", rotulo: "§3 Justificativa", descricao: "Justificativa da necessidade preenchida.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "dfd.previsao", sujeito: "dfd", rotulo: "§5 Previsão de entrega", descricao: "Previsão de entrega/execução preenchida (normalizada automaticamente).", niveisPermitidos: ["fundamental", "intermediario", "automatico", "ignorar"], nivelPadrao: "fundamental", suportaEdicao: true, editavelPadrao: true, suportaAuto: true },
  { chave: "dfd.prioridade", sujeito: "dfd", rotulo: "§6 Prioridade", descricao: "Prioridade da compra/contratação preenchida (normalizada automaticamente).", niveisPermitidos: ["fundamental", "intermediario", "automatico", "ignorar"], nivelPadrao: "fundamental", suportaEdicao: true, editavelPadrao: true, suportaAuto: true },
  { chave: "dfd.fundamentacao", sujeito: "dfd", rotulo: "§7 Fundamentação legal", descricao: "Fundamentação legal preenchida (há o botão 'Preencher padrão → Lei 14.133/2021' no banner).", niveisPermitidos: ["fundamental", "intermediario", "automatico", "ignorar"], nivelPadrao: "fundamental", suportaEdicao: true, editavelPadrao: true, suportaAuto: true },
  { chave: "dfd.anoPca", sujeito: "dfd", rotulo: "Ano do PCA", descricao: "PCA (ano) definido no DFD.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "dfd.assinatura", sujeito: "dfd", rotulo: "Assinatura digital", descricao: "Assinatura digital válida (PDF exige assinatura; .xlsx é opcional).", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "dfd.referenciaRenovacao", sujeito: "dfd", rotulo: "Referência de renovação (DFD-R)", descricao: "DFD-R com contrato, ata (registro de preços) ou licitação.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "intermediario", suportaEdicao: true, editavelPadrao: true },
  { chave: "dfd.valorEstimadoVsTotal", sujeito: "dfd", rotulo: "Valor estimado × somatória", descricao: "Nota quando o valor estimado do cabeçalho difere da soma dos itens.", niveisPermitidos: ["intermediario", "ignorar"], nivelPadrao: "intermediario" },
  // ---- ITEM ----
  { chave: "item.valorUnitario", sujeito: "item", rotulo: "Valor unitário", descricao: "Todo item com valor unitário maior que zero.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "item.quantidade", sujeito: "item", rotulo: "Quantidade", descricao: "Todo item com quantidade informada. (O item sempre marca em vermelho quando falta; o nível decide se bloqueia.)", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "intermediario" },
  // Conformidade com o CATÁLOGO (referência de padronização). Só vale quando há catálogo
  // cadastrado; padrão "intermediario" = avisa, não bloqueia (o ADM eleva a "fundamental").
  { chave: "item.naoCatalogado", sujeito: "item", rotulo: "Item não catalogado", descricao: "Item cujo código não existe no catálogo de produtos (a referência de padronização). Só vale quando há catálogo cadastrado.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "intermediario" },
  { chave: "item.divergenteCatalogo", sujeito: "item", rotulo: "Divergente do catálogo", descricao: "Código existe no catálogo, mas a descrição e/ou a unidade de medida diferem do valor canônico.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "intermediario" },
  { chave: "item.tipoIncompativel", sujeito: "item", rotulo: "Tipo de DFD incompatível", descricao: "O tipo do DFD (DFD-S/R/O/E) não está entre os tipos permitidos do item no catálogo. (Item sem tipos definidos vale para qualquer tipo.)", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "intermediario" },
];

const POR_CHAVE = new Map<ChaveAvaliacao, PontoAvaliacao>(CATALOGO_AVALIACAO.map((p) => [p.chave, p]));

export function pontoAvaliacao(chave: ChaveAvaliacao): PontoAvaliacao | undefined {
  return POR_CHAVE.get(chave);
}

export function nivelPadraoDe(chave: ChaveAvaliacao): Nivel {
  return POR_CHAVE.get(chave)?.nivelPadrao ?? "ignorar";
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

export type RegrasAvaliacao = {
  pontos: Partial<Record<ChaveAvaliacao, Nivel>>; // níveis globais (default = catálogo)
  exProtocolo: Record<string, Partial<Record<ChaveAvaliacao, Nivel>>>; // por categoria (key)
  exDfd: Record<string, Partial<Record<ChaveAvaliacao, Nivel>>>; // por tipo de DFD (DFD-S/R/O/E)
  /** Campo editável (true) ou travado (false) na análise; só para pontos com `suportaEdicao`. */
  editaveis: Partial<Record<ChaveAvaliacao, boolean>>;
  /** Palavras-chave de ajuste automático por ponto (só para pontos com `suportaAuto`). */
  sinonimos: Partial<Record<ChaveAvaliacao, SinonimoRegra[]>>;
};

/** Regras "vazias" = tudo no padrão do catálogo (comportamento atual). */
export function regrasPadrao(): RegrasAvaliacao {
  return { pontos: {}, exProtocolo: {}, exDfd: {}, editaveis: {}, sinonimos: {} };
}

/**
 * Nível efetivo de um ponto: exceção por categoria (protocolo) ou por tipo de DFD
 * vence o nível global, que vence o padrão do catálogo. Uma exceção só é considerada
 * se for um nível permitido para o ponto (defensivo).
 */
export function nivelDe(
  regras: RegrasAvaliacao,
  chave: ChaveAvaliacao,
  ctx?: { dfdTipo?: string | null; categoria?: string | null },
): Nivel {
  const permitido = (n: Nivel | undefined): n is Nivel =>
    n != null && (POR_CHAVE.get(chave)?.niveisPermitidos.includes(n) ?? false);
  const exCat = ctx?.categoria ? regras.exProtocolo?.[ctx.categoria]?.[chave] : undefined;
  const exTipo = ctx?.dfdTipo ? regras.exDfd?.[ctx.dfdTipo]?.[chave] : undefined;
  if (permitido(exCat)) return exCat;
  if (permitido(exTipo)) return exTipo;
  const global = regras.pontos?.[chave];
  if (permitido(global)) return global;
  return nivelPadraoDe(chave);
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

/** Coage um blob solto (JSON do D1) para `RegrasAvaliacao`, tolerante e com defaults. */
export function coerceRegras(bruto: unknown): RegrasAvaliacao {
  const obj = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  return {
    pontos: rec(obj.pontos) as RegrasAvaliacao["pontos"],
    exProtocolo: rec(obj.exProtocolo) as RegrasAvaliacao["exProtocolo"],
    exDfd: rec(obj.exDfd) as RegrasAvaliacao["exDfd"],
    editaveis: rec(obj.editaveis) as RegrasAvaliacao["editaveis"],
    sinonimos: rec(obj.sinonimos) as RegrasAvaliacao["sinonimos"],
  };
}
