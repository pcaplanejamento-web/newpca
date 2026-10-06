/**
 * PRESENÇA AO VIVO — núcleo PURO (sem env/DOM → testável e usado também pelo `worker.ts` e pelo Durable Object
 * `PresencaGrupo`): a configuração do ADM, a preferência da pessoa e a lista de quem está online no grupo.
 */

/** A configuração do ADM (blob `configuracoes`, chave `presenca`). Desligada por padrão: nada é carregado. */
export type ConfigPresenca = {
  /** Mostra quem do grupo ativo está online, no cabeçalho. */
  ativo: boolean;
  /** Mostra também quem está com o sistema aberto em segundo plano ("ausente"). */
  ausente: boolean;
  /** A pessoa pode escolher aparecer invisível (vê os outros, não é vista). */
  invisivel: boolean;
};

export const CONFIG_PRESENCA_PADRAO: ConfigPresenca = { ativo: false, ausente: true, invisivel: true };

/** Qualquer JSON → uma config válida (o que faltar = o padrão). */
export function lerConfigPresenca(v: unknown): ConfigPresenca {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const b = (k: keyof ConfigPresenca) => (typeof o[k] === "boolean" ? (o[k] as boolean) : CONFIG_PRESENCA_PADRAO[k]);
  return { ativo: b("ativo"), ausente: b("ausente"), invisivel: b("invisivel") };
}

/** A preferência da pessoa (`preferencias_tabela`, chave `presenca:pessoa`). */
export const CHAVE_PREF_PRESENCA = "presenca:pessoa";
export type PrefsPresenca = { invisivel: boolean };

export function lerPrefsPresenca(v: unknown): PrefsPresenca {
  let o: unknown = v;
  if (typeof v === "string") {
    try {
      o = JSON.parse(v);
    } catch {
      o = null;
    }
  }
  return { invisivel: !!(o && typeof o === "object" && (o as Record<string, unknown>).invisivel === true) };
}

/** Invisível de fato: a pessoa escolheu E o ADM permite. */
export const ficaInvisivel = (cfg: ConfigPresenca, prefs: PrefsPresenca) => cfg.invisivel && prefs.invisivel;

export type EstadoPresenca = "online" | "ausente";

/** Uma conexão (uma aba) no objeto do grupo. */
export type ConexaoPresenca = { id: number; estado: EstadoPresenca; invisivel: boolean };

/** O que vai às abas: [id, "o" = online | "a" = ausente] — compacto. */
export type ListaPresenca = [number, "o" | "a"][];

/** Abas por pessoa no grupo (a mais antiga sai) e conexões por grupo (acima, a nova é recusada). */
export const MAX_ABAS_PRESENCA = 10;
export const MAX_CONEXOES_GRUPO = 500;
/** O intervalo mínimo entre duas mensagens de uma aba (as demais são ignoradas). */
export const INTERVALO_MSG_MS = 1_000;

/** Quem está no grupo: UM item por pessoa, valendo o melhor estado entre as abas dela (online > ausente); sem os
 * invisíveis; sem "ausente" quando o ADM não o mostra. Ordenado pelo id (a mensagem é estável — dá para comparar). */
export function listaPresenca(conexoes: readonly ConexaoPresenca[], mostrarAusente = true): ListaPresenca {
  const melhor = new Map<number, EstadoPresenca>();
  for (const c of conexoes) {
    if (c.invisivel) continue;
    if (c.estado === "online" || !melhor.has(c.id)) melhor.set(c.id, melhor.get(c.id) === "online" ? "online" : c.estado);
  }
  const lista: ListaPresenca = [];
  for (const [id, estado] of [...melhor].sort((a, b) => a[0] - b[0])) {
    if (estado === "ausente" && !mostrarAusente) continue;
    lista.push([id, estado === "online" ? "o" : "a"]);
  }
  return lista;
}

/** A mensagem que vem da aba: `{"estado":"online"|"ausente"}` (qualquer outra coisa = `null`). */
export function lerEstadoMensagem(msg: unknown): EstadoPresenca | null {
  if (typeof msg !== "string" || msg.length > 100) return null;
  try {
    const e = (JSON.parse(msg) as { estado?: unknown }).estado;
    return e === "online" || e === "ausente" ? e : null;
  } catch {
    return null;
  }
}

/** A mensagem que vai às abas → o mapa id → estado (inválida = `null`). */
export function lerListaMensagem(msg: unknown): Map<number, EstadoPresenca> | null {
  if (typeof msg !== "string") return null;
  try {
    const o = JSON.parse(msg) as { t?: unknown; p?: unknown };
    if (o.t !== "presenca" || !Array.isArray(o.p)) return null;
    const m = new Map<number, EstadoPresenca>();
    for (const it of o.p) if (Array.isArray(it) && Number.isInteger(it[0]) && (it[1] === "o" || it[1] === "a")) m.set(it[0], it[1] === "o" ? "online" : "ausente");
    return m;
  } catch {
    return null;
  }
}

/** A lista da tela: você primeiro, depois quem está online e quem está ausente, cada grupo pelo nome. Só quem está no
 * diretório do grupo (o socket manda só ids). */
export function ordenarPresenca<P extends { id: number; nome: string; apelido?: string | null }>(
  pessoas: readonly P[],
  estados: ReadonlyMap<number, EstadoPresenca>,
  voceId: number,
): { pessoa: P; estado: EstadoPresenca; voce: boolean }[] {
  const nome = (p: P) => (p.apelido || p.nome).toLocaleLowerCase("pt-BR");
  return pessoas
    .filter((p) => estados.has(p.id))
    .map((p) => ({ pessoa: p, estado: estados.get(p.id) as EstadoPresenca, voce: p.id === voceId }))
    .sort((a, b) => Number(b.voce) - Number(a.voce) || Number(a.estado === "ausente") - Number(b.estado === "ausente") || nome(a.pessoa).localeCompare(nome(b.pessoa), "pt-BR"));
}
