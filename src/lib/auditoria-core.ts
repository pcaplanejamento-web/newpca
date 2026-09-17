/**
 * Núcleo PURO da auditoria (sem `getDb`/JSX) — tipos, diff de campos e rótulos de
 * exibição. Testável no Node (como `reparticao-match`/`avaliacao-core`). O acesso ao
 * D1 (registrar/listar) fica em `auditoria.ts`.
 */

export type AcaoAuditoria =
  | "criar"
  | "editar"
  | "excluir"
  | "importar"
  | "protocolar"
  | "login"
  | "logout"
  | "cadastro"
  | "aprovar";

export type EntidadeAuditoria =
  | "dfd"
  | "dfd_item"
  | "protocolo"
  | "catalogo"
  | "catalogo_item"
  | "pca"
  | "grupo"
  | "permissao"
  | "orgao"
  | "reparticao"
  | "usuario"
  | "configuracao"
  | "planilha"
  | "protocolo_legado"
  | "sessao";

/** Verbo (no passado) de cada ação — para a linha do histórico. */
export const ROTULO_ACAO: Record<AcaoAuditoria, string> = {
  criar: "Criou",
  editar: "Editou",
  excluir: "Excluiu",
  importar: "Importou",
  protocolar: "Protocolou",
  login: "Entrou",
  logout: "Saiu",
  cadastro: "Cadastrou-se",
  aprovar: "Aprovou",
};

/** Nome legível de cada entidade. */
export const ROTULO_ENTIDADE: Record<EntidadeAuditoria, string> = {
  dfd: "DFD",
  dfd_item: "Item do DFD",
  protocolo: "Protocolo",
  catalogo: "Catálogo",
  catalogo_item: "Item do catálogo",
  pca: "PCA",
  grupo: "Grupo",
  permissao: "Permissão",
  orgao: "Órgão",
  reparticao: "Unidade",
  usuario: "Usuário",
  configuracao: "Configuração",
  planilha: "Planilha (PCA)",
  protocolo_legado: "Protocolo (legado)",
  sessao: "Sessão",
};

/** Ator do log — só id/nome/email (aceita `null` para sistema/anônimo). */
export type Ator = { id: number; nome: string; email: string } | null;

/** Valor formatado para o resumo do diff. */
function fmtVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Diff de `campos` entre `antes` e `depois` — devolve só os que mudaram + um `resumo`
 * legível ("Rótulo: de → para; ..."). Puro. Usado nas edições para o log.
 */
export function diffCampos<T extends Record<string, unknown>>(
  antes: Partial<T> | null | undefined,
  depois: Partial<T> | null | undefined,
  campos: readonly (keyof T)[],
  rotulos?: Partial<Record<keyof T, string>>,
): { antes: Record<string, unknown>; depois: Record<string, unknown>; resumo: string; mudou: boolean } {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  const partes: string[] = [];
  for (const c of campos) {
    const va = antes?.[c] ?? null;
    const vd = depois?.[c] ?? null;
    if (JSON.stringify(va) !== JSON.stringify(vd)) {
      a[String(c)] = va;
      d[String(c)] = vd;
      partes.push(`${rotulos?.[c] ?? String(c)}: ${fmtVal(va)} → ${fmtVal(vd)}`);
    }
  }
  return { antes: a, depois: d, resumo: partes.join("; "), mudou: partes.length > 0 };
}
