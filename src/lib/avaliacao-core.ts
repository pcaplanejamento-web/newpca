import { norm } from "./parse-dfd-comum.ts";

/**
 * Núcleo PURO das regras de avaliação (sem `getDb` → testável no Node, como
 * `theme.ts`/`password.ts`). Define QUE pontos de Protocolo/DFD/Item podem ser
 * avaliados, o nível padrão de cada um (que reproduz o comportamento atual) e como
 * o ADM pode sobrescrever por nível global, por tipo de DFD e por categoria de
 * Protocolo. O carregador com cache/D1 fica em `avaliacao.ts`.
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
  | "dfd.justificativa"
  | "dfd.previsao"
  | "dfd.prioridade"
  | "dfd.fundamentacao"
  | "dfd.anoPca"
  | "dfd.assinatura"
  | "dfd.referenciaRenovacao"
  | "dfd.valorEstimadoVsTotal"
  | "item.valorUnitario"
  | "item.quantidade";

export type PontoAvaliacao = {
  chave: ChaveAvaliacao;
  sujeito: Sujeito;
  rotulo: string;
  descricao: string;
  niveisPermitidos: Nivel[];
  nivelPadrao: Nivel;
};

// Catálogo = fonte única do levantamento: alimenta a UI, os defaults e a validação.
// Os `nivelPadrao` reproduzem EXATAMENTE o comportamento atual (config vazia ⇒ igual a hoje).
export const CATALOGO_AVALIACAO: PontoAvaliacao[] = [
  // ---- PROTOCOLO ----
  { chave: "protocolo.numero", sujeito: "protocolo", rotulo: "Número do processo", descricao: "Número do protocolo informado na capa (sempre obrigatório — é a chave do processo).", niveisPermitidos: ["fundamental"], nivelPadrao: "fundamental" },
  { chave: "protocolo.reparticao", sujeito: "protocolo", rotulo: "Repartição do protocolo", descricao: "Repartição/Setor definido para o processo.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "protocolo.anoPca", sujeito: "protocolo", rotulo: "Ano do PCA", descricao: "PCA (ano) definido para o processo.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "protocolo.valorCapa", sujeito: "protocolo", rotulo: "Valor da capa × somatória", descricao: "Valor da capa diferente de zero e igual à soma dos DFDs (a substituição pela somatória continua manual).", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "protocolo.semDfdEmErro", sujeito: "protocolo", rotulo: "Sem DFD com erro", descricao: "Nenhum DFD do processo pode estar com erro.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  // ---- DFD ----
  { chave: "dfd.reparticao", sujeito: "dfd", rotulo: "Repartição / Setor", descricao: "DFD vinculado a uma repartição.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "dfd.justificativa", sujeito: "dfd", rotulo: "§3 Justificativa", descricao: "Justificativa da necessidade preenchida.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "dfd.previsao", sujeito: "dfd", rotulo: "§5 Previsão de entrega", descricao: "Previsão de entrega/execução preenchida (normalizada automaticamente).", niveisPermitidos: ["fundamental", "intermediario", "automatico", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "dfd.prioridade", sujeito: "dfd", rotulo: "§6 Prioridade", descricao: "Prioridade da compra/contratação preenchida (normalizada automaticamente).", niveisPermitidos: ["fundamental", "intermediario", "automatico", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "dfd.fundamentacao", sujeito: "dfd", rotulo: "§7 Fundamentação legal", descricao: "Fundamentação legal preenchida (há o botão 'Preencher padrão → Lei 14.133/2021' no banner).", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "dfd.anoPca", sujeito: "dfd", rotulo: "Ano do PCA", descricao: "PCA (ano) definido no DFD.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "dfd.assinatura", sujeito: "dfd", rotulo: "Assinatura digital", descricao: "Assinatura digital válida (PDF exige assinatura; .xlsx é opcional).", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "dfd.referenciaRenovacao", sujeito: "dfd", rotulo: "Referência de renovação (DFD-R)", descricao: "DFD-R com contrato, ata (registro de preços) ou licitação.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "intermediario" },
  { chave: "dfd.valorEstimadoVsTotal", sujeito: "dfd", rotulo: "Valor estimado × somatória", descricao: "Nota quando o valor estimado do cabeçalho difere da soma dos itens.", niveisPermitidos: ["intermediario", "ignorar"], nivelPadrao: "intermediario" },
  // ---- ITEM ----
  { chave: "item.valorUnitario", sujeito: "item", rotulo: "Valor unitário", descricao: "Todo item com valor unitário maior que zero.", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "fundamental" },
  { chave: "item.quantidade", sujeito: "item", rotulo: "Quantidade", descricao: "Todo item com quantidade informada. (O item sempre marca em vermelho quando falta; o nível decide se bloqueia.)", niveisPermitidos: ["fundamental", "intermediario", "ignorar"], nivelPadrao: "intermediario" },
];

const POR_CHAVE = new Map<ChaveAvaliacao, PontoAvaliacao>(CATALOGO_AVALIACAO.map((p) => [p.chave, p]));

export function pontoAvaliacao(chave: ChaveAvaliacao): PontoAvaliacao | undefined {
  return POR_CHAVE.get(chave);
}

export function nivelPadraoDe(chave: ChaveAvaliacao): Nivel {
  return POR_CHAVE.get(chave)?.nivelPadrao ?? "ignorar";
}

// Tipos de DFD reconhecidos (código curto de `tipoCurtoDfd`) — eixo de exceção.
export const TIPOS_DFD = ["DFD-S", "DFD-R", "DFD-O", "DFD-E"] as const;
export const TIPO_DFD_ROTULO: Record<(typeof TIPOS_DFD)[number], string> = {
  "DFD-S": "DFD-S · Solução",
  "DFD-R": "DFD-R · Renovação",
  "DFD-O": "DFD-O · Ordinário",
  "DFD-E": "DFD-E",
};

export type CategoriaProtocolo = { key: string; label: string; termos: string[]; ordem: number };

// Categorias de Protocolo (semente editável pelo ADM). O `assunto` da capa é texto
// livre; o classificador casa por palavra-chave (normalizada) para aplicar exceções.
export const CATEGORIAS_PADRAO: CategoriaProtocolo[] = [
  { key: "inclusao", label: "INCLUSÃO", termos: ["INCLUS"], ordem: 1 },
  { key: "exclusao", label: "EXCLUSÃO", termos: ["EXCLUS"], ordem: 2 },
  { key: "alteracao-nao-onerosa", label: "ALTERAÇÃO NÃO ONEROSA", termos: ["ALTERA", "NAO ONEROSA"], ordem: 3 },
];

export type RegrasAvaliacao = {
  pontos: Partial<Record<ChaveAvaliacao, Nivel>>; // níveis globais (default = catálogo)
  exProtocolo: Record<string, Partial<Record<ChaveAvaliacao, Nivel>>>; // por categoria (key)
  exDfd: Record<string, Partial<Record<ChaveAvaliacao, Nivel>>>; // por tipo de DFD (DFD-S/R/O/E)
  categorias: CategoriaProtocolo[];
};

/** Regras "vazias" = tudo no padrão do catálogo (comportamento atual). */
export function regrasPadrao(): RegrasAvaliacao {
  return { pontos: {}, exProtocolo: {}, exDfd: {}, categorias: CATEGORIAS_PADRAO };
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

/**
 * Classifica o `assunto` (texto livre da capa) numa categoria pela lista de termos
 * (normalizados). Devolve a `key` da 1ª categoria (na ordem) que casa, ou `null`.
 */
export function classificarAssunto(
  assunto: string | null | undefined,
  categorias: CategoriaProtocolo[],
): string | null {
  const s = norm(assunto);
  if (!s) return null;
  const ordenadas = [...categorias].sort((a, b) => a.ordem - b.ordem);
  for (const c of ordenadas) {
    if (c.termos.some((t) => { const tt = norm(t); return tt.length > 0 && s.includes(tt); })) return c.key;
  }
  return null;
}

/** Coage um blob solto (JSON do D1) para `RegrasAvaliacao`, tolerante e com defaults. */
export function coerceRegras(bruto: unknown): RegrasAvaliacao {
  const r = (bruto && typeof bruto === "object" ? bruto : {}) as Partial<RegrasAvaliacao>;
  const categorias = Array.isArray(r.categorias) && r.categorias.length > 0 ? r.categorias : CATEGORIAS_PADRAO;
  return {
    pontos: r.pontos && typeof r.pontos === "object" ? r.pontos : {},
    exProtocolo: r.exProtocolo && typeof r.exProtocolo === "object" ? r.exProtocolo : {},
    exDfd: r.exDfd && typeof r.exDfd === "object" ? r.exDfd : {},
    categorias,
  };
}
