/**
 * PRESENÇA AO VIVO — núcleo PURO (sem env/DOM → testável e usado também pelo `worker.ts` e pelo Durable Object
 * `PresencaGrupo`): a configuração do ADM, a preferência da pessoa (invisível + STATUS), a lista de quem está online no
 * grupo, o "visto por último" e as mensagens do canal.
 */

/** A configuração do ADM (blob `configuracoes`, chave `presenca`). Desligada por padrão: nada é carregado. */
export type ConfigPresenca = {
  /** Mostra quem do grupo ativo está online, no cabeçalho. */
  ativo: boolean;
  /** Mostra também quem está com o sistema aberto em segundo plano ou parado ("ausente"). */
  ausente: boolean;
  /** A pessoa pode escolher aparecer invisível (vê os outros, não é vista). */
  invisivel: boolean;
  /** Minutos sem mexer no mouse/teclado até virar "ausente" (0 = só a aba em segundo plano). */
  inativoMin: number;
};

export const LIMITES_INATIVO = [0, 120] as const;
export const CONFIG_PRESENCA_PADRAO: ConfigPresenca = { ativo: false, ausente: true, invisivel: true, inativoMin: 5 };

/** Qualquer JSON → uma config válida (o que faltar = o padrão). */
export function lerConfigPresenca(v: unknown): ConfigPresenca {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const b = (k: "ativo" | "ausente" | "invisivel") => (typeof o[k] === "boolean" ? (o[k] as boolean) : CONFIG_PRESENCA_PADRAO[k]);
  const n = Number(o.inativoMin);
  const inativoMin = Number.isInteger(n) && n >= LIMITES_INATIVO[0] && n <= LIMITES_INATIVO[1] ? n : CONFIG_PRESENCA_PADRAO.inativoMin;
  return { ativo: b("ativo"), ausente: b("ausente"), invisivel: b("invisivel"), inativoMin };
}

/** O STATUS que a pessoa escolhe (o "Não perturbe" também silencia o som e o alerta do sino). */
export type StatusPresenca = "disponivel" | "ocupado" | "reuniao" | "nao-perturbe";
export const STATUS_PRESENCA: readonly StatusPresenca[] = ["disponivel", "ocupado", "reuniao", "nao-perturbe"];
export const ROTULO_STATUS: Record<StatusPresenca, string> = { disponivel: "Disponível", ocupado: "Ocupado", reuniao: "Em reunião", "nao-perturbe": "Não perturbe" };
export const MAX_RECADO = 80;

/** A preferência da pessoa (`preferencias_tabela`, chave `presenca:pessoa`). `ate` = ISO (o status volta a "Disponível"). */
export const CHAVE_PREF_PRESENCA = "presenca:pessoa";
export type PrefsPresenca = { invisivel: boolean; status: StatusPresenca; recado: string; ate: string | null };

/** O recado sem controles/invisíveis, numa linha, até 80. */
export const limparRecado = (v: unknown) =>
  typeof v === "string"
    ? v
        .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_RECADO)
    : "";

const lerStatus = (v: unknown): StatusPresenca => (STATUS_PRESENCA.includes(v as StatusPresenca) ? (v as StatusPresenca) : "disponivel");
const lerAte = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

export function lerPrefsPresenca(v: unknown): PrefsPresenca {
  let o: unknown = v;
  if (typeof v === "string") {
    try {
      o = JSON.parse(v);
    } catch {
      o = null;
    }
  }
  const r = o && typeof o === "object" ? (o as Record<string, unknown>) : {};
  return { invisivel: r.invisivel === true, status: lerStatus(r.status), recado: limparRecado(r.recado), ate: lerAte(r.ate) };
}

/** O status que VALE agora (passou do "até" = Disponível, sem recado). */
export function statusVigente(p: { status: StatusPresenca; recado?: string; ate?: string | null }, agora = Date.now()): { status: StatusPresenca; recado: string } {
  if (p.ate && Date.parse(p.ate) <= agora) return { status: "disponivel", recado: "" };
  return { status: p.status, recado: p.recado ?? "" };
}

/** Invisível de fato: a pessoa escolheu E o ADM permite. */
export const ficaInvisivel = (cfg: ConfigPresenca, prefs: { invisivel: boolean }) => cfg.invisivel && prefs.invisivel;

export type EstadoPresenca = "online" | "ausente";

/** Uma conexão (uma aba) no objeto do grupo. */
export type ConexaoPresenca = { id: number; estado: EstadoPresenca; invisivel: boolean; status?: StatusPresenca; recado?: string; ate?: string | null };

/** O que vai às abas por pessoa: [id, "o" | "a", status?, recado?] — compacto (Disponível sem recado = só os dois). */
export type ItemPresenca = [number, "o" | "a"] | [number, "o" | "a", StatusPresenca, string];
export type ListaPresenca = ItemPresenca[];

/** Abas por pessoa no grupo (a mais antiga sai) e conexões por grupo (acima, a nova é recusada). */
export const MAX_ABAS_PRESENCA = 10;
export const MAX_CONEXOES_GRUPO = 500;
/** O intervalo mínimo entre duas mensagens de estado/status de uma aba (as demais são ignoradas). */
export const INTERVALO_MSG_MS = 1_000;
/** Por quanto tempo o "visto por último" aparece. */
export const JANELA_VISTO_MS = 24 * 3600_000;

/** Quem está no grupo: UM item por pessoa, valendo o melhor estado entre as abas dela (online > ausente) e o status da aba
 * mais recente; sem os invisíveis; sem "ausente" quando o ADM não o mostra. Ordenado pelo id (estável — dá para comparar). */
export function listaPresenca(conexoes: readonly ConexaoPresenca[], mostrarAusente = true, agora = Date.now()): ListaPresenca {
  const melhor = new Map<number, ConexaoPresenca>();
  for (const c of conexoes) {
    if (c.invisivel) continue;
    const ant = melhor.get(c.id);
    melhor.set(c.id, { ...c, estado: ant?.estado === "online" ? "online" : c.estado });
  }
  const lista: ListaPresenca = [];
  for (const [id, c] of [...melhor].sort((a, b) => a[0] - b[0])) {
    if (c.estado === "ausente" && !mostrarAusente) continue;
    const e = c.estado === "online" ? "o" : "a";
    const st = statusVigente({ status: c.status ?? "disponivel", recado: c.recado, ate: c.ate }, agora);
    lista.push(st.status === "disponivel" && !st.recado ? [id, e] : [id, e, st.status, st.recado]);
  }
  return lista;
}

/** O "visto por último": quem SAIU há menos de 24 h e não está mais conectado (ordenado pelo id). */
export function vistosRecentes(vistos: ReadonlyMap<number, number>, presentes: ReadonlySet<number>, agora = Date.now()): [number, number][] {
  return [...vistos].filter(([id, ts]) => !presentes.has(id) && agora - ts < JANELA_VISTO_MS).sort((a, b) => a[0] - b[0]);
}

/** As mensagens que a ABA manda ao objeto do grupo (o "ping" é auto-resposta). O formato antigo `{estado}` vale. */
export type MensagemAba =
  | { t: "estado"; estado: EstadoPresenca }
  | { t: "status"; status: StatusPresenca; recado: string; ate: string | null };

export function lerMensagemAba(msg: unknown): MensagemAba | null {
  if (typeof msg !== "string" || msg.length > 4000) return null;
  let o: Record<string, unknown>;
  try {
    const v = JSON.parse(msg);
    if (!v || typeof v !== "object") return null;
    o = v as Record<string, unknown>;
  } catch {
    return null;
  }
  if ((o.t === "estado" || o.t === undefined) && (o.estado === "online" || o.estado === "ausente")) return { t: "estado", estado: o.estado };
  if (o.t === "status") return { t: "status", status: lerStatus(o.status), recado: limparRecado(o.recado), ate: lerAte(o.ate) };
  return null;
}

/** O que a tela sabe de cada pessoa presente. */
export type InfoPresenca = { estado: EstadoPresenca; status: StatusPresenca; recado: string };

/** A mensagem de presença que vai às abas → quem está (id → info) e quem saiu há pouco (id → quando). Inválida = `null`. */
export function lerListaMensagem(msg: unknown): { estados: Map<number, InfoPresenca>; vistos: Map<number, number> } | null {
  if (typeof msg !== "string") return null;
  try {
    const o = JSON.parse(msg) as { t?: unknown; p?: unknown; v?: unknown };
    if (o.t !== "presenca" || !Array.isArray(o.p)) return null;
    const estados = new Map<number, InfoPresenca>();
    for (const it of o.p)
      if (Array.isArray(it) && Number.isInteger(it[0]) && (it[1] === "o" || it[1] === "a"))
        estados.set(it[0], { estado: it[1] === "o" ? "online" : "ausente", status: lerStatus(it[2]), recado: limparRecado(it[3]) });
    const vistos = new Map<number, number>();
    if (Array.isArray(o.v)) for (const it of o.v) if (Array.isArray(it) && Number.isInteger(it[0]) && Number.isFinite(it[1])) vistos.set(it[0], it[1]);
    return { estados, vistos };
  } catch {
    return null;
  }
}

/** A lista da tela: você primeiro, depois quem está online e quem está ausente, cada grupo pelo nome. Só quem está no
 * diretório do grupo (o socket manda só ids). */
export function ordenarPresenca<P extends { id: number; nome: string; apelido?: string | null }>(
  pessoas: readonly P[],
  estados: ReadonlyMap<number, { estado: EstadoPresenca }>,
  voceId: number,
): { pessoa: P; estado: EstadoPresenca; voce: boolean }[] {
  const nome = (p: P) => (p.apelido || p.nome).toLocaleLowerCase("pt-BR");
  return pessoas
    .filter((p) => estados.has(p.id))
    .map((p) => ({ pessoa: p, estado: (estados.get(p.id) as { estado: EstadoPresenca }).estado, voce: p.id === voceId }))
    .sort((a, b) => Number(b.voce) - Number(a.voce) || Number(a.estado === "ausente") - Number(b.estado === "ausente") || nome(a.pessoa).localeCompare(nome(b.pessoa), "pt-BR"));
}

/** "agora há pouco" · "há 5 min" · "há 2 h" — o visto por último. */
export function vistoHa(ts: number, agora = Date.now()): string {
  const min = Math.floor((agora - ts) / 60_000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)} h`;
}

/** Os horários do "até" do status: 30 min, 1 h, 2 h, o fim do dia (18h de Brasília) — em ISO. */
export function opcoesAte(agora = Date.now()): { rotulo: string; ate: string | null }[] {
  const m = (min: number) => new Date(agora + min * 60_000).toISOString();
  // 18h de Brasília (UTC−3) do dia de hoje; já passou = sem a opção.
  const d = new Date(agora - 3 * 3600_000);
  const fim = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 21);
  const ops: { rotulo: string; ate: string | null }[] = [
    { rotulo: "Sem prazo", ate: null },
    { rotulo: "30 minutos", ate: m(30) },
    { rotulo: "1 hora", ate: m(60) },
    { rotulo: "2 horas", ate: m(120) },
  ];
  if (fim > agora + 30 * 60_000) ops.push({ rotulo: "Até as 18h", ate: new Date(fim).toISOString() });
  return ops;
}
