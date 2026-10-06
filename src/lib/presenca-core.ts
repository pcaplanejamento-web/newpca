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
  /** Mostra ONDE cada pessoa está (a tela) e o que está fazendo (o item aberto, editando). */
  atividade: boolean;
};

export const LIMITES_INATIVO = [0, 120] as const;
export const CONFIG_PRESENCA_PADRAO: ConfigPresenca = { ativo: false, ausente: true, invisivel: true, inativoMin: 5, atividade: true };

/** Qualquer JSON → uma config válida (o que faltar = o padrão). */
export function lerConfigPresenca(v: unknown): ConfigPresenca {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const b = (k: "ativo" | "ausente" | "invisivel" | "atividade") => (typeof o[k] === "boolean" ? (o[k] as boolean) : CONFIG_PRESENCA_PADRAO[k]);
  const n = Number(o.inativoMin);
  const inativoMin = Number.isInteger(n) && n >= LIMITES_INATIVO[0] && n <= LIMITES_INATIVO[1] ? n : CONFIG_PRESENCA_PADRAO.inativoMin;
  return { ativo: b("ativo"), ausente: b("ausente"), invisivel: b("invisivel"), inativoMin, atividade: b("atividade") };
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
  | { t: "status"; status: StatusPresenca; recado: string; ate: string | null }
  | { t: "vendo"; alvos: string[]; editando: string[]; rotulos: string[] }
  | { t: "onde"; tela: TelaOnde; rotulo: string };

/** O que a pessoa está VENDO (o banner aberto): "protocolo:12" · "dfd:5" · "tarefa:9" — até 5 ao mesmo tempo (a pilha). */
export const MAX_VENDO = 5;
export const alvoVendoValido = (v: unknown): v is string => typeof v === "string" && /^(protocolo|dfd|tarefa):\d{1,9}$/.test(v);

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
  if (o.t === "vendo") {
    const alvos = [...new Set(Array.isArray(o.alvos) ? o.alvos.filter(alvoVendoValido) : [])].slice(0, MAX_VENDO);
    const editando = Array.isArray(o.editando) ? o.editando.filter((a): a is string => alvoVendoValido(a) && alvos.includes(a)) : [];
    // O rótulo de cada alvo (na MESMA ordem — "Protocolo 144756/2026"); faltando, o próprio alvo.
    const rs = Array.isArray(o.rotulos) ? o.rotulos : [];
    const rotulos = alvos.map((a) => limparRotulo(rs[(o.alvos as unknown[]).indexOf(a)]) || rotuloDoAlvo(a));
    return { t: "vendo", alvos, editando, rotulos };
  }
  if (o.t === "onde" && telaValida(o.tela)) return { t: "onde", tela: o.tela, rotulo: limparRotulo(o.rotulo) || ROTULO_TELA[o.tela] };
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

/** Quem está VENDO cada alvo (sem os invisíveis): [alvo, [[id, 1 = editando | 0]]] — ordenado (estável — dá para comparar). */
export type ListaVendo = [string, [number, 0 | 1][]][];
export function listaVendo(conexoes: readonly { id: number; invisivel: boolean; vendo?: string[]; editando?: string[] }[]): ListaVendo {
  const m = new Map<string, Map<number, 0 | 1>>();
  for (const c of conexoes) {
    if (c.invisivel) continue;
    for (const a of c.vendo ?? []) {
      const pessoas = m.get(a) ?? new Map<number, 0 | 1>();
      m.set(a, pessoas);
      if (pessoas.get(c.id) !== 1) pessoas.set(c.id, c.editando?.includes(a) ? 1 : 0);
    }
  }
  return [...m]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([a, p]) => [a, [...p].sort((x, y) => x[0] - y[0])] as [string, [number, 0 | 1][]]);
}

/** A mensagem "vendo" que chega às abas → alvo → pessoas (com quem está editando). Inválida = `null`. */
export function lerVendoMensagem(o: Record<string, unknown>): Map<string, { id: number; editando: boolean }[]> | null {
  if (o.t !== "vendo" || !Array.isArray(o.m)) return null;
  const out = new Map<string, { id: number; editando: boolean }[]>();
  for (const it of o.m) {
    if (!Array.isArray(it) || !alvoVendoValido(it[0]) || !Array.isArray(it[1])) continue;
    out.set(
      it[0],
      (it[1] as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && Number.isInteger(p[0])).map((p) => ({ id: p[0], editando: p[1] === 1 })),
    );
  }
  return out;
}

/** ONDE a pessoa está: a TELA (módulo) — o ícone e o "Nesta tela" saem dela; o rótulo detalha ("Tarefas · Compras"). */
export const TELAS_ONDE = ["dfd", "pca", "catalogo", "orcamento", "tarefas", "calendario", "perfil", "admin", "outra"] as const;
export type TelaOnde = (typeof TELAS_ONDE)[number];
export const ROTULO_TELA: Record<TelaOnde, string> = {
  dfd: "Mesa",
  pca: "PCA",
  catalogo: "Catálogo",
  orcamento: "Orçamento",
  tarefas: "Tarefas",
  calendario: "Calendário",
  perfil: "Perfil",
  admin: "Administração",
  outra: "Sistema",
};
export const telaValida = (v: unknown): v is TelaOnde => typeof v === "string" && (TELAS_ONDE as readonly string[]).includes(v);
export const MAX_ROTULO_ONDE = 80;
/** O rótulo numa linha, sem controles/invisíveis, até 80. */
export const limparRotulo = (v: unknown) =>
  typeof v === "string"
    ? v
        .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_ROTULO_ONDE)
    : "";

/** "protocolo:12" → "Protocolo #12" (quando a tela não deu o rótulo). */
export function rotuloDoAlvo(alvo: string): string {
  const [tipo, id] = alvo.split(":");
  return `${tipo === "dfd" ? "DFD" : tipo === "tarefa" ? "Tarefa" : "Protocolo"} #${id}`;
}

const ABAS_ESPACO: Record<string, string> = {
  dashboard: "Dashboard",
  orcamento: "Orçamento",
  mesa: "Mesa",
  importacao: "Importação",
  configuracao: "Configuração",
  lancamentos: "Lançamentos",
  comparativo: "Comparativo",
  vinculos: "Vínculos",
  visoes: "Visões",
  quadro: "Quadro",
  lista: "Lista",
  calendario: "Calendário",
};
const ADMIN: Record<string, string> = {
  configuracoes: "Configurações",
  usuarios: "Usuários",
  grupos: "Grupos",
  permissoes: "Permissões",
  orgaos: "Órgãos e Unidades",
  armazenamento: "Armazenamento",
  auditoria: "Auditoria",
  automacao: "Automação",
  integracoes: "Integrações",
  aparencia: "Aparência",
};

/** A TELA atual pela rota (`pathname` + `?aba=`/`?pca=`) — puro. `detalhe` = o nome que a página dá (o quadro, o PCA). */
export function ondeDaRota(pathname: string, busca = "", detalhe = ""): { tela: TelaOnde; rotulo: string } {
  const p = new URLSearchParams(busca);
  const partes = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const [raiz, modulo, sub] = partes;
  const juntar = (tela: TelaOnde, ...extra: (string | undefined | null)[]) => ({
    tela,
    rotulo: limparRotulo([ROTULO_TELA[tela], ...extra.filter(Boolean)].join(" · ")),
  });
  if (raiz !== "painel" || !modulo) return juntar(raiz === "painel" ? "dfd" : "outra");
  const aba = ABAS_ESPACO[p.get("aba") ?? ""];
  const det = limparRotulo(detalhe);
  switch (modulo) {
    case "mesa":
    case "dfds":
      return juntar("dfd", p.get("pca") ? det || "Mesa do PCA" : null);
    case "pca":
      return juntar("pca", sub ? det || (sub === "dfd" ? "DFD" : null) : null, sub && sub !== "dfd" && sub !== "edicao" ? aba : null);
    case "catalogo":
      return juntar("catalogo", sub === "pasta" ? det || "Pasta" : null);
    case "orcamento":
      return juntar("orcamento", sub ? det || null : null, sub ? aba : null);
    case "tarefas":
      return juntar("tarefas", sub ? det || "Quadro" : null, sub ? aba : null);
    case "calendario":
      return juntar("calendario");
    case "perfil":
      return juntar("perfil");
    default:
      return ADMIN[modulo] ? { tela: "admin", rotulo: ADMIN[modulo] } : juntar("outra");
  }
}

/** A ATIVIDADE de cada pessoa (sem os invisíveis): a aba que mexeu por ÚLTIMO dela — [id, tela, rótulo, [o que vê], 1 =
 * editando algo]. Ordenada pelo id (estável — dá para comparar). */
export type ItemAtividade = [number, TelaOnde, string, string[], 0 | 1];
export function listaAtividade(
  conexoes: readonly { id: number; invisivel: boolean; onde?: { tela: TelaOnde; rotulo: string }; vendo?: string[]; rotulos?: string[]; editando?: string[]; mexeu?: number }[],
): ItemAtividade[] {
  const por = new Map<number, (typeof conexoes)[number]>();
  for (const c of conexoes) {
    if (c.invisivel || !c.onde) continue;
    const a = por.get(c.id);
    if (!a || (c.mexeu ?? 0) >= (a.mexeu ?? 0)) por.set(c.id, c);
  }
  return [...por.values()]
    .sort((a, b) => a.id - b.id)
    .map((c) => {
      const onde = c.onde as { tela: TelaOnde; rotulo: string };
      const vendo = (c.vendo ?? []).map((a, i) => c.rotulos?.[i] || rotuloDoAlvo(a));
      return [c.id, onde.tela, onde.rotulo, vendo, c.editando?.length ? 1 : 0] as ItemAtividade;
    });
}

/** O que a tela sabe da atividade de uma pessoa. */
export type Atividade = { tela: TelaOnde; rotulo: string; vendo: string[]; editando: boolean };
/** A atividade que chega (na mensagem "vendo", `a`) → pessoa → atividade. Sem `a` = `null` (desligada pelo ADM). */
export function lerAtividade(o: Record<string, unknown>): Map<number, Atividade> | null {
  if (!Array.isArray(o.a)) return null;
  const out = new Map<number, Atividade>();
  for (const it of o.a) {
    if (!Array.isArray(it) || !Number.isInteger(it[0]) || !telaValida(it[1])) continue;
    const vendo = Array.isArray(it[3]) ? (it[3] as unknown[]).map(limparRotulo).filter(Boolean).slice(0, MAX_VENDO) : [];
    out.set(it[0], { tela: it[1], rotulo: limparRotulo(it[2]) || ROTULO_TELA[it[1]], vendo, editando: it[4] === 1 });
  }
  return out;
}

/** "Mesa › Protocolo 144756/2026 · editando" — a linha da atividade. */
export function textoAtividade(a: Atividade): string {
  const item = a.vendo[0];
  return `${a.rotulo}${item ? ` › ${item}${a.vendo.length > 1 ? ` +${a.vendo.length - 1}` : ""}` : ""}${a.editando ? " · editando" : ""}`;
}
