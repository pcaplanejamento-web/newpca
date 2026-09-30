/**
 * TAREFAS (quadro estilo Trello) — núcleo PURO (testável): prazo com semáforo, ordem FRACIONÁRIA dos cartões (soltar
 * entre dois sem renumerar a lista), mover um cartão, filtros, WIP e rótulos. Sem banco e sem JSX.
 */
import { dataIsoBrasilia } from "./format.ts";
import { stripAccents } from "./normalize.ts";
import { predicadoBusca } from "./tabela-filtros.ts";

export const PRIORIDADES = ["baixa", "media", "alta", "urgente"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];
export const ROTULO_PRIORIDADE: Record<Prioridade, string> = { baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" };
/** Cor (token) de cada prioridade — a mesma no cartão, na lista e nos filtros. */
export const COR_PRIORIDADE: Record<Prioridade, string> = {
  baixa: "var(--muted)",
  media: "var(--info)",
  alta: "var(--warn)",
  urgente: "var(--danger)",
};

/** Um cartão como as telas o usam (sem a descrição longa). Datas "AAAA-MM-DD". */
export type TarefaResumo = {
  id: number;
  listaId: number;
  ticket: number;
  titulo: string;
  prioridade: Prioridade;
  inicio: string | null;
  prazo: string | null;
  /** Hora do prazo "HH:MM" (`null` = o dia inteiro). */
  prazoHora: string | null;
  /** Lembrete: minutos antes do prazo (`null` = sem lembrete). */
  lembreteMin: number | null;
  /** A CAPA colorida do cartão (hex; `null`/ausente = sem capa — migração `0059`). */
  capa?: string | null;
  ordem: number;
  concluidaEm: string | null;
  arquivada: boolean;
  /** O cartão é um TEMPLATE (criar a partir dele = copiar) — fora das contagens, do painel e dos filtros ativos. */
  template: boolean;
  /** Tem DESCRIÇÃO (o ícone do cartão — o texto não vai ao quadro). */
  temDescricao?: boolean;
  /** Os valores dos CAMPOS PERSONALIZADOS (id do campo → valor normalizado). */
  campos?: Record<number, string>;
  /** O título foi editado à mão (o automático do quadro não o sobrescreve). */
  tituloManual?: boolean;
  /** Responsáveis (ids de usuário). */
  pessoas: number[];
  /** Observadores (acompanham, sem ser responsáveis). */
  observadores: number[];
  /** As EQUIPES do quadro atribuídas à tarefa (migração `0052`). */
  equipes: number[];
  /** Quem é DA tarefa: os responsáveis + os membros das equipes (sem repetir) — filtro, carga, calendário e privados. */
  envolvidos: number[];
  etiquetas: number[];
  criadoEm: string | null;
  atualizadoEm: string | null;
  estimativaH: number | null;
  /** Os VÍNCULOS da tarefa (migração `0057`): protocolos, DFDs, PCAs, orçamentos e OUTRAS TAREFAS (nos dois sentidos). */
  vinculos: VinculoTarefa[];
  /** Contagens do conteúdo (os ícones do cartão). */
  checklist: { feitos: number; total: number };
  comentarios: number;
  /** Quantas notas e links (blocos) — os ícones do cartão. */
  notas: number;
  links: number;
  /** Quantos EVENTOS a tarefa tem (bloco "Eventos", migração `0046`). */
  eventos: number;
  /** A regra de repetição (fase 3); `null` = não se repete. */
  recorrencia: Recorrencia | null;
};

/** Uma EQUIPE do quadro: um grupo de pessoas (a tarefa com a equipe envolve todos os membros). */
export type EquipeQuadro = { id: number; nome: string; cor: string; ordem: number; membros: number[] };
export const MAX_EQUIPES_TAREFA = 30;
export const MAX_MEMBROS_EQUIPE = 100;

/** Os ENVOLVIDOS de uma tarefa: os responsáveis e, depois, os membros das equipes — sem repetir, na ordem. */
export function envolvidosDe(pessoas: number[], equipes: number[], membrosPorEquipe: Map<number, number[]>): number[] {
  const out = new Set(pessoas);
  for (const e of equipes) for (const u of membrosPorEquipe.get(e) ?? []) out.add(u);
  return [...out];
}

/** As linhas (tarefa, equipe, membro | null) de uma consulta → por tarefa: as equipes e os membros de cada equipe. */
export function equipesDasLinhas(linhas: { tarefaId: number; equipeId: number; usuarioId: number | null }[]): {
  porTarefa: Map<number, number[]>;
  membros: Map<number, number[]>;
} {
  const porTarefa = new Map<number, number[]>();
  const membros = new Map<number, number[]>();
  for (const l of linhas) {
    const eq = porTarefa.get(l.tarefaId) ?? [];
    if (!eq.includes(l.equipeId)) porTarefa.set(l.tarefaId, [...eq, l.equipeId]);
    const m = membros.get(l.equipeId) ?? [];
    if (l.usuarioId != null && !m.includes(l.usuarioId)) membros.set(l.equipeId, [...m, l.usuarioId]);
    else if (!membros.has(l.equipeId)) membros.set(l.equipeId, m);
  }
  return { porTarefa, membros };
}

/** A que parte do sistema a tarefa se liga — também a OUTRA TAREFA (o vínculo entre tarefas vale nos dois sentidos). */
export const TIPOS_VINCULO = ["protocolo", "dfd", "pca", "orcamento", "tarefa"] as const;
export type TipoVinculo = (typeof TIPOS_VINCULO)[number];
export const ROTULO_VINCULO: Record<TipoVinculo, string> = { protocolo: "Protocolo", dfd: "DFD", pca: "PCA", orcamento: "Orçamento", tarefa: "Tarefa" };
/**
 * O vínculo (`rotulo` = o nº/nome do alvo, resolvido no servidor; ausente = o alvo foi excluído). Na TAREFA vinculada:
 * `quadroId` (o link), `detalhe` (quadro › lista), `prazo` e `concluida`.
 */
export type VinculoTarefa = { tipo: TipoVinculo; id: number; rotulo?: string | null; detalhe?: string | null; quadroId?: number | null; prazo?: string | null; concluida?: boolean };
/** Teto de vínculos por tarefa. */
export const MAX_VINCULOS = 20;
export const chaveVinculo = (v: { tipo: string; id: number }) => `${v.tipo}:${v.id}`;
/** O rótulo do vínculo ("Protocolo 144756/2026", "Tarefa #12 Conferir"; o alvo excluído depois = "… (excluído)"). */
export const rotuloDoVinculo = (v: Pick<VinculoTarefa, "tipo" | "id" | "rotulo">) => `${ROTULO_VINCULO[v.tipo]} ${v.rotulo ?? `#${v.id} (excluído)`}`;

/**
 * Os VÍNCULOS de cada tarefa a partir das LINHAS gravadas (`tarefa_vinculos`): a linha vale para a tarefa que a gravou e,
 * quando o alvo é outra TAREFA, também para ela (o vínculo entre tarefas é dos dois lados). Sem repetir; sem a própria.
 */
export function vinculosPorTarefa(linhas: { tarefaId: number; tipo: string; alvoId: number }[]): Map<number, { tipo: TipoVinculo; id: number }[]> {
  const m = new Map<number, Map<string, { tipo: TipoVinculo; id: number }>>();
  const por = (t: number, v: { tipo: TipoVinculo; id: number }) => {
    if (v.tipo === "tarefa" && v.id === t) return;
    const x = m.get(t) ?? new Map();
    x.set(chaveVinculo(v), v);
    m.set(t, x);
  };
  for (const l of linhas) {
    if (!ehTipoVinculo(l.tipo)) continue;
    por(l.tarefaId, { tipo: l.tipo, id: l.alvoId });
    if (l.tipo === "tarefa") por(l.alvoId, { tipo: "tarefa", id: l.tarefaId });
  }
  return new Map([...m].map(([t, x]) => [t, [...x.values()]]));
}

export const ehTipoVinculo = (v: unknown): v is TipoVinculo => typeof v === "string" && (TIPOS_VINCULO as readonly string[]).includes(v);

/** Para onde o vínculo leva: protocolo/DFD abrem o banner na Mesa (`?abrir=`); PCA e orçamento, o espaço deles; a
 * tarefa, o quadro dela com a tarefa aberta. */
export function hrefVinculo(v: { tipo: TipoVinculo; id: number; quadroId?: number | null }): string {
  if (v.tipo === "tarefa") return v.quadroId ? `/painel/tarefas/${v.quadroId}?tarefa=${v.id}` : "/painel/tarefas";
  if (v.tipo === "pca") return `/painel/pca/${v.id}`;
  if (v.tipo === "orcamento") return `/painel/orcamento/${v.id}`;
  return `/painel/mesa?abrir=${v.tipo}:${v.id}`;
}

/** Lê "protocolo:12" / "dfd:7" (o `?abrir=` da Mesa e o `?nova=` do quadro). Inválido = `null`. */
export function lerVinculo(v: string | null | undefined): { tipo: TipoVinculo; id: number } | null {
  const m = /^([a-z]+):(\d{1,12})$/.exec(v ?? "");
  if (!m || !ehTipoVinculo(m[1])) return null;
  const id = Number(m[2]);
  return id > 0 ? { tipo: m[1], id } : null;
}

/** Progresso do checklist. */
export const progressoChecklist = (itens: { feito: boolean }[]) => ({ feitos: itens.filter((i) => i.feito).length, total: itens.length });

const chaveMencao = (s: string) => stripAccents(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** O texto que se digita para citar alguém: "@" + o apelido (ou o 1º nome), sem espaços. */
export const textoMencao = (p: { nome: string; apelido?: string | null }) =>
  `@${(p.apelido?.trim() || p.nome.trim().split(/\s+/)[0] || "").replace(/\s+/g, "")}`;

/**
 * As PESSOAS citadas com "@" no texto: o termo casa (sem caixa/acento/espaço) o apelido, o 1º nome ou o nome inteiro.
 * Um termo que casa duas pessoas pelo 1º nome só vale se o apelido/nome inteiro desempatar — nunca cita a pessoa errada.
 */
export function mencoesDoTexto(texto: string, pessoas: { id: number; nome: string; apelido?: string | null }[]): number[] {
  const termos = [...texto.matchAll(/@([\p{L}\p{N}._-]{2,60})/gu)].map((m) => chaveMencao(m[1]));
  if (!termos.length) return [];
  const exato = new Map<string, number>();
  const primeiro = new Map<string, number[]>();
  for (const p of pessoas) {
    for (const c of [p.apelido ?? "", p.nome]) if (chaveMencao(c)) exato.set(chaveMencao(c), p.id);
    const pn = chaveMencao(p.nome.trim().split(/\s+/)[0] ?? "");
    if (pn) primeiro.set(pn, [...(primeiro.get(pn) ?? []), p.id]);
  }
  const ids = new Set<number>();
  for (const t of termos) {
    const id = exato.get(t) ?? ((primeiro.get(t)?.length ?? 0) === 1 ? primeiro.get(t)?.[0] : undefined);
    if (id != null) ids.add(id);
  }
  return [...ids];
}

export type ListaTarefas = { id: number; nome: string; ordem: number; limiteWip: number | null; concluida: boolean; arquivada: boolean };
export type EtiquetaTarefa = { id: number; nome: string; cor: string };

export const rotuloTicket = (n: number) => `#${n}`;

/** O prefixo das chaves das edições salvas da aba Lista de um quadro. */
export const prefixoEdicoesTarefas = (quadroId: number) => `tarefas:${quadroId}:`;

/** Vence "em breve" = até 2 dias antes do prazo. */
export const DIAS_AVISO_PRAZO = 2;

export type EstadoPrazo = "sem" | "ok" | "vence" | "hoje" | "atrasada" | "concluida";
export const ROTULO_ESTADO_PRAZO: Record<EstadoPrazo, string> = {
  sem: "Sem prazo",
  ok: "No prazo",
  vence: "Vence em breve",
  hoje: "Vence hoje",
  atrasada: "Atrasada",
  concluida: "Concluída",
};
/** Semáforo do prazo — verde (ok/concluída), âmbar (vence/hoje), vermelho (atrasada). */
export const COR_ESTADO_PRAZO: Record<EstadoPrazo, string> = {
  sem: "var(--faint)",
  ok: "var(--ok)",
  vence: "var(--warn)",
  hoje: "var(--warn)",
  atrasada: "var(--danger)",
  concluida: "var(--ok)",
};

const diaMs = 86_400_000;
export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / diaMs);
/** "AAAA-MM-DD" que EXISTE (31/02 é recusado — o `Date` "rolaria" para março). */
export const dataValida = (d: string | null | undefined): d is string => {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
};

/**
 * O estado do prazo HOJE (`hoje` = "AAAA-MM-DD" no fuso de Brasília). Com a HORA do prazo e a hora de agora ("HH:MM"),
 * o prazo de hoje que já passou da hora é "atrasada".
 */
export function estadoPrazo(prazo: string | null, hoje: string, concluida: boolean, hora?: string | null, agora?: string): EstadoPrazo {
  if (concluida) return "concluida";
  if (!dataValida(prazo)) return "sem";
  const d = diasEntre(hoje, prazo);
  if (d < 0) return "atrasada";
  if (d === 0) return hora && agora && agora > hora ? "atrasada" : "hoje";
  return d <= DIAS_AVISO_PRAZO ? "vence" : "ok";
}

/** "AAAA-MM-DD" + n dias. */
export const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * diaMs).toISOString().slice(0, 10);

/** Vão mínimo entre duas ordens antes de RENUMERAR a lista (a precisão do `real` do SQLite se esgota). */
export const VAO_MINIMO = 1e-6;

/**
 * A ORDEM de um cartão solto entre `antes` e `depois` (as ordens dos vizinhos; `null` = ponta da lista). `renumerar` =
 * o vão ficou pequeno demais: quem grava renumera a lista (1, 2, 3…) e recalcula.
 */
export function ordemEntre(antes: number | null, depois: number | null): { ordem: number; renumerar: boolean } {
  if (antes == null && depois == null) return { ordem: 1, renumerar: false };
  if (antes == null) return { ordem: (depois as number) - 1, renumerar: false };
  if (depois == null) return { ordem: antes + 1, renumerar: false };
  const ordem = (antes + depois) / 2;
  return { ordem, renumerar: depois - antes < VAO_MINIMO * 2 };
}

/** Os cartões de UMA lista, na ordem (sem os arquivados). */
export const cartoesDaLista = (tarefas: TarefaResumo[], listaId: number) =>
  tarefas.filter((t) => t.listaId === listaId && !t.arquivada).sort((a, b) => a.ordem - b.ordem || a.ticket - b.ticket);

/** Os vizinhos (ids) do cartão `id` solto na posição `indice` da lista `listaId` (sem ele mesmo). */
export function vizinhos(tarefas: TarefaResumo[], id: number, listaId: number, indice: number): { anteriorId: number | null; proximoId: number | null } {
  const lista = cartoesDaLista(tarefas, listaId).filter((t) => t.id !== id);
  const i = Math.max(0, Math.min(indice, lista.length));
  return { anteriorId: lista[i - 1]?.id ?? null, proximoId: lista[i]?.id ?? null };
}

/**
 * A posição na lista COMPLETA de um cartão solto na posição `indice` entre os cartões VISÍVEIS (com filtro, o quadro
 * mostra só parte da lista): no meio, logo antes do cartão visível que ficou embaixo; no topo, o topo da lista; depois do
 * último visível (ou lista sem visíveis), o fim. Sem filtro, é o próprio índice.
 */
export function indiceReal(todas: TarefaResumo[], visiveis: TarefaResumo[], id: number, listaId: number, indice: number): number {
  const cheia = cartoesDaLista(todas, listaId).filter((t) => t.id !== id);
  const vis = cartoesDaLista(visiveis, listaId).filter((t) => t.id !== id);
  if (vis.length === cheia.length) return indice;
  const i = Math.max(0, Math.min(indice, vis.length));
  if (i >= vis.length) return cheia.length;
  if (i === 0) return 0;
  return cheia.findIndex((t) => t.id === vis[i].id);
}

/**
 * MOVE um cartão (atualização local, otimista): vai para `listaId` na posição `indice` — a ordem sai de `ordemEntre` e a
 * conclusão segue `conclusaoAoMover`.
 */
export function moverCartao(
  tarefas: TarefaResumo[],
  listas: ListaTarefas[],
  id: number,
  listaId: number,
  indice: number,
  agora: string,
): TarefaResumo[] {
  const { anteriorId, proximoId } = vizinhos(tarefas, id, listaId, indice);
  const ordemDe = (x: number | null) => (x == null ? null : (tarefas.find((t) => t.id === x)?.ordem ?? null));
  const { ordem } = ordemEntre(ordemDe(anteriorId), ordemDe(proximoId));
  const concluida = (lid: number) => listas.find((l) => l.id === lid)?.concluida ?? false;
  return tarefas.map((t) =>
    t.id === id ? { ...t, listaId, ordem, concluidaEm: conclusaoAoMover(t.concluidaEm, concluida(t.listaId), concluida(listaId), agora) } : t,
  );
}

/**
 * A CONCLUSÃO depois de mudar de lista (a conclusão vale NO LUGAR): entrar numa lista de CONCLUÍDAS conclui; sair DELA
 * reabre; entre listas comuns, fica como estava. A mesma régua do servidor (`comandosMover`/`comandosMassa`).
 */
export function conclusaoAoMover(atual: string | null, deConcluidas: boolean, paraConcluidas: boolean, agora: string): string | null {
  if (paraConcluidas) return atual ?? agora;
  return deConcluidas ? null : atual;
}

/** A lista passou do limite de cartões (WIP)? */
export const excedeWip = (qtd: number, limite: number | null) => limite != null && limite > 0 && qtd > limite;

/** Os recortes de PRAZO do filtro (como o "Vencimento" do Trello) — vários juntos = qualquer um. */
export const FILTROS_PRAZO = ["atrasadas", "hoje", "dia", "semana", "mes", "sem"] as const;
export type FiltroPrazo = (typeof FILTROS_PRAZO)[number];
export const ROTULO_FILTRO_PRAZO: Record<FiltroPrazo, string> = {
  atrasadas: "Atrasadas",
  hoje: "Vencem hoje",
  dia: "Vencem até amanhã",
  semana: "Vencem nos próximos 7 dias",
  mes: "Vencem nos próximos 30 dias",
  sem: "Sem prazo",
};
/** Uma escolha de pessoa no filtro: "eu" (as minhas), "sem" (sem responsável) ou o id de uma pessoa. */
export type FiltroPessoa = "eu" | "sem" | number;
export type StatusFiltro = "todas" | "abertas" | "concluidas";
export const ROTULO_STATUS_FILTRO: Record<StatusFiltro, string> = { todas: "Todas", abertas: "Não concluídas", concluidas: "Concluídas" };
/**
 * O FILTRO das tarefas (o painel "Filtrar" — o do Trello): em cada dimensão, VÁRIOS valores = QUALQUER um; lista vazia =
 * sem filtro. As dimensões se combinam (E).
 */
export type FiltroTarefas = {
  responsaveis: FiltroPessoa[];
  prazos: FiltroPrazo[];
  prioridades: Prioridade[];
  /** Etiquetas (ids) e/ou "sem" (sem etiqueta). */
  etiquetas: (number | "sem")[];
  status: StatusFiltro;
  /** Os campos personalizados do tipo LISTA: id do campo → as opções escolhidas. */
  campos: Record<number, string[]>;
  busca: string;
};
export const FILTRO_TAREFAS_PADRAO: FiltroTarefas = { responsaveis: [], prazos: [], prioridades: [], etiquetas: [], status: "todas", campos: {}, busca: "" };
/** Quantos filtros estão ligados (cada valor conta; a busca conta 1) — o número do botão "Filtrar". */
export const contarFiltros = (f: FiltroTarefas) =>
  f.responsaveis.length +
  f.prazos.length +
  f.prioridades.length +
  f.etiquetas.length +
  Object.values(f.campos).reduce((n, v) => n + v.length, 0) +
  (f.status !== "todas" ? 1 : 0) +
  (f.busca.trim() ? 1 : 0);
export const filtroTarefasAtivo = (f: FiltroTarefas) => contarFiltros(f) > 0;
/** O filtro de TAREFA está ligado (fora a busca) — o Calendário esconde a previsão do PCA/agendas externas. */
export const filtroDeTarefaAtivo = (f: FiltroTarefas) => filtroTarefasAtivo({ ...f, busca: "" });
/** Liga/desliga UM valor numa lista do filtro. */
/**
 * A PALETA de ETIQUETAS (a do Trello): 10 cores × 3 tons — suave, normal e forte — em ordem de tom (as 10 suaves, as 10
 * normais, as 10 fortes). Sugestões ao criar/editar uma etiqueta; a cor livre continua valendo.
 */
export const PALETA_ETIQUETAS: readonly string[] = [
  "#baf3db", "#f8e6a0", "#fedec8", "#ffd5d2", "#dfd8fd", "#cce0ff", "#c6edfb", "#d3f1a7", "#fdd0ec", "#dcdfe4",
  "#4bce97", "#f5cd47", "#fea362", "#f87168", "#9f8fef", "#579dff", "#6cc3e0", "#94c748", "#e774bb", "#8590a2",
  "#1f845a", "#946f00", "#c25100", "#c9372c", "#6e5dc6", "#0c66e4", "#227d9b", "#5b7f24", "#ae4787", "#626f86",
];
/** A cor SUGERIDA para a n-ésima etiqueta nova (os tons normais, em ciclo). */
export const corEtiquetaSugerida = (n: number) => PALETA_ETIQUETAS[10 + (((n % 10) + 10) % 10)];

export const alternarValor = <V>(lista: V[], v: V): V[] => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

/** O que o filtro olha num cartão (o do quadro e o do calendário de todos os quadros). */
export type TarefaFiltravel = Pick<TarefaResumo, "envolvidos" | "prioridade" | "etiquetas" | "prazo" | "concluidaEm" | "titulo" | "ticket"> & {
  template?: boolean;
  campos?: Record<number, string>;
};

/** O cartão cai no recorte de prazo? (atrasadas/hoje pelo semáforo; os "vencem em" contam só as abertas, de hoje em diante). */
function casaPrazo(t: TarefaFiltravel, p: FiltroPrazo, hoje: string): boolean {
  if (p === "sem") return !dataValida(t.prazo);
  if (!dataValida(t.prazo)) return false;
  const e = estadoPrazo(t.prazo, hoje, t.concluidaEm != null);
  if (p === "atrasadas") return e === "atrasada";
  if (p === "hoje") return e === "hoje";
  const dias = p === "dia" ? 1 : p === "semana" ? 6 : 29;
  return t.concluidaEm == null && t.prazo >= hoje && t.prazo <= somarDias(hoje, dias);
}

/**
 * Os cartões que passam no filtro (a busca acha título ou nº do ticket — vários termos com ":"). Pessoas pelos ENVOLVIDOS
 * (responsáveis + equipes).
 */
export function filtrarTarefas<T extends TarefaFiltravel>(tarefas: T[], f: FiltroTarefas, ctx: { usuarioId: number | null; hoje: string }): T[] {
  const casa = predicadoBusca(f.busca);
  const ativo = filtroTarefasAtivo(f);
  return tarefas.filter((t) => {
    // O TEMPLATE só aparece sem filtro (não é trabalho de ninguém).
    if (t.template && ativo) return false;
    const quem = t.envolvidos;
    if (f.responsaveis.length && !f.responsaveis.some((r) => (r === "eu" ? ctx.usuarioId != null && quem.includes(ctx.usuarioId) : r === "sem" ? quem.length === 0 : quem.includes(r))))
      return false;
    if (f.prioridades.length && !f.prioridades.includes(t.prioridade)) return false;
    if (f.etiquetas.length && !f.etiquetas.some((e) => (e === "sem" ? t.etiquetas.length === 0 : t.etiquetas.includes(e)))) return false;
    if (f.status === "abertas" && t.concluidaEm != null) return false;
    if (f.status === "concluidas" && t.concluidaEm == null) return false;
    if (f.prazos.length && !f.prazos.some((p) => casaPrazo(t, p, ctx.hoje))) return false;
    for (const [id, vals] of Object.entries(f.campos)) if (vals.length && !vals.includes(t.campos?.[Number(id)] ?? "")) return false;
    return !casa || casa([t.titulo, rotuloTicket(t.ticket), String(t.ticket)]);
  });
}

/** Resumo do quadro (cabeçalho): abertas, atrasadas, concluídas (sem as arquivadas). */
export function resumoQuadro(tarefas: TarefaResumo[], hoje: string) {
  let abertas = 0;
  let atrasadas = 0;
  let concluidas = 0;
  for (const t of tarefas) {
    if (t.arquivada || t.template) continue;
    if (t.concluidaEm) concluidas++;
    else {
      abertas++;
      if (estadoPrazo(t.prazo, hoje, false) === "atrasada") atrasadas++;
    }
  }
  return { abertas, atrasadas, concluidas };
}

/** A data "AAAA-MM-DD" curta no cartão: "25/09" (o ano só quando difere do de `hoje`; com a hora, "25/09 09:21"). Inválida = "". */
export function rotuloData(d: string | null, hoje: string, hora?: string | null): string {
  if (!dataValida(d)) return "";
  const [a, m, dia] = d.split("-");
  const data = a === hoje.slice(0, 4) ? `${dia}/${m}` : `${dia}/${m}/${a}`;
  return hora ? `${data} ${hora}` : data;
}

/** A hora de AGORA em Brasília ("HH:MM") — compara com a hora do prazo (`estadoPrazo`). */
export function horaAgoraBrasilia(agora = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(agora).map((x) => [x.type, x.value]),
  );
  return `${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/**
 * A GRADE do mês no calendário: as semanas (domingo → sábado; `inicioSemana` 1 = segunda → domingo) que cobrem o mês `mes` (1–12) de `ano`, como datas
 * "AAAA-MM-DD" — os dias de fora do mês completam a 1ª e a última semana.
 */
export function gradeMes(ano: number, mes: number, inicioSemana: 0 | 1 = 0): string[][] {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1));
  const inicio = somarDias(primeiro.toISOString().slice(0, 10), -((primeiro.getUTCDay() - inicioSemana + 7) % 7));
  const ultimo = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  const semanas: string[][] = [];
  for (let d = inicio; d <= ultimo; ) {
    const semana: string[] = [];
    for (let i = 0; i < 7; i++, d = somarDias(d, 1)) semana.push(d);
    semanas.push(semana);
  }
  return semanas;
}

/**
 * Uma tarefa como o CALENDÁRIO a usa (o do quadro e o de todos os quadros do grupo — `quadroId` = de qual quadro).
 */
export type TarefaCalendario = Pick<TarefaResumo, "id" | "listaId" | "ticket" | "titulo" | "prioridade" | "inicio" | "prazo" | "prazoHora" | "concluidaEm" | "pessoas" | "equipes" | "envolvidos" | "etiquetas" | "recorrencia"> & {
  quadroId?: number;
};

/** As tarefas agrupadas pelo PRAZO ("AAAA-MM-DD" → cartões, na ordem do prazo e do ticket); sem prazo ficam de fora. */
export function tarefasPorPrazo<T extends { ticket: number; prazo: string | null }>(tarefas: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const t of [...tarefas].sort((a, b) => a.ticket - b.ticket)) if (dataValida(t.prazo)) m.set(t.prazo, [...(m.get(t.prazo) ?? []), t]);
  return m;
}

export const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Os nomes curtos dos dias (domingo primeiro) — cabeçalho das grades. */
export const DIAS_SEMANA_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Os nomes curtos dos dias na ordem da semana escolhida (domingo ou segunda primeiro). */
export const diasSemanaCurtos = (inicioSemana: 0 | 1 = 0) => [...DIAS_SEMANA_CURTOS.slice(inicioSemana), ...DIAS_SEMANA_CURTOS.slice(0, inicioSemana)];

/** A semana (domingo → sábado; `inicioSemana` 1 = segunda → domingo) que contém `dia`. */
export function semanaDe(dia: string, inicioSemana: 0 | 1 = 0): string[] {
  const d = new Date(Date.parse(`${dia}T00:00:00Z`));
  const inicio = somarDias(dia, -((d.getUTCDay() - inicioSemana + 7) % 7));
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
}

/** Sábado ou domingo? */
export const fimDeSemana = (dia: string) => {
  const w = new Date(Date.parse(`${dia}T00:00:00Z`)).getUTCDay();
  return w === 0 || w === 6;
};

/**
 * REAGENDAR (arrastar a tarefa para outro dia no calendário): o PRAZO vai para `dia` e o INÍCIO anda junto, mantendo a
 * mesma duração; sem prazo, o início (se houver) só não pode passar do novo prazo.
 */
export function reagendar(t: { inicio: string | null; prazo: string | null }, dia: string): { inicio: string | null; prazo: string } {
  if (dataValida(t.prazo) && dataValida(t.inicio)) return { inicio: somarDias(t.inicio, diasEntre(t.prazo, dia)), prazo: dia };
  return { inicio: dataValida(t.inicio) && t.inicio > dia ? dia : (t.inicio ?? null), prazo: dia };
}

/**
 * As FAIXAS de uma semana (visão Mês): cada item ocupa de max(início, 1º dia) a min(fim, último dia) — sem início, só o
 * dia do fim. `semana` = os dias EXIBIDOS em ordem (sem o fim de semana, se ele estiver oculto): `coluna`/`span` são
 * POSIÇÕES nela (o que cai só em dia oculto some) e `linha` = a faixa livre mais alta (empilhamento guloso, sem sobrepor; os
 * mais longos primeiro, depois a ordem recebida). `antes`/`depois` = as pontas cortadas pela semana (a faixa continua).
 */
export type FaixaSemana<T> = { item: T; coluna: number; span: number; linha: number; antes: boolean; depois: boolean };
export function faixasDaSemana<T extends { inicio: string | null; fim: string | null }>(itens: T[], semana: string[]): FaixaSemana<T>[] {
  const ini = semana[0];
  const fim = semana[semana.length - 1];
  const lista = itens
    .map((t, ordem) => ({ t, ordem, final: t.fim }))
    .filter((x): x is { t: T; ordem: number; final: string } => dataValida(x.final))
    .map((x) => ({ ...x, comeco: dataValida(x.t.inicio) && x.t.inicio < x.final ? x.t.inicio : x.final }))
    .filter((x) => x.final >= ini && x.comeco <= fim)
    .sort((a, b) => (a.comeco < b.comeco ? -1 : a.comeco > b.comeco ? 1 : diasEntre(b.comeco, b.final) - diasEntre(a.comeco, a.final) || a.ordem - b.ordem));
  const ocupadas: number[][] = []; // por linha, as colunas ocupadas
  const out: FaixaSemana<T>[] = [];
  for (const { t, comeco, final } of lista) {
    const coluna = semana.findIndex((d) => d >= comeco);
    let ultima = -1;
    for (let i = semana.length - 1; i >= 0; i--)
      if (semana[i] <= final) {
        ultima = i;
        break;
      }
    if (coluna < 0 || ultima < coluna) continue; // só em dias ocultos
    const span = ultima - coluna + 1;
    let linha = ocupadas.findIndex((l) => l.every((c) => c < coluna || c >= coluna + span));
    if (linha < 0) linha = ocupadas.push([]) - 1;
    for (let c = coluna; c < coluna + span; c++) ocupadas[linha].push(c);
    out.push({ item: t, coluna, span, linha, antes: comeco < ini, depois: final > fim });
  }
  return out;
}

/** Os NÚMEROS do cabeçalho do calendário (tarefas abertas): atrasadas, vencem hoje, vencem nesta semana e sem prazo. */
export function contadoresCalendario(tarefas: { prazo: string | null; concluidaEm: string | null }[], hoje: string, inicioSemana: 0 | 1 = 0) {
  const semana = semanaDe(hoje, inicioSemana);
  let atrasadas = 0;
  let hojeN = 0;
  let naSemana = 0;
  let semPrazo = 0;
  for (const t of tarefas) {
    if (t.concluidaEm != null) continue;
    if (!dataValida(t.prazo)) semPrazo++;
    else if (t.prazo < hoje) atrasadas++;
    else {
      if (t.prazo === hoje) hojeN++;
      if (t.prazo <= semana[6]) naSemana++;
    }
  }
  return { atrasadas, hoje: hojeN, naSemana, semPrazo };
}

/** "AAAA-MM" do mês de `dia` e os meses vizinhos (`?mes=` da tela Calendário). */
export const mesDe = (dia: string) => dia.slice(0, 7);
export function lerMes(v: string | null | undefined, hoje: string): { ano: number; mes: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? "");
  const [a, mm] = m ? [Number(m[1]), Number(m[2])] : [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))];
  return mm >= 1 && mm <= 12 && a >= 1970 && a <= 9999 ? { ano: a, mes: mm } : { ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) };
}
export const somarMes = (ano: number, mes: number, n: number) => {
  const t = ano * 12 + (mes - 1) + n;
  return { ano: Math.floor(t / 12), mes: (t % 12) + 1 };
};
export const textoMes = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;

// ─── BLOCOS da tarefa (migração `0045`) ──────────────────────────────────────────────────────────────────────

/**
 * Os BLOCOS com que se monta uma tarefa (a paleta do detalhe): NOTA e LINK guardam o conteúdo no próprio bloco (repetem);
 * os demais só marcam a POSIÇÃO de um campo que já existe (prazo, pessoas…) — são únicos. Título, lista, prioridade e
 * descrição ficam fixos no topo.
 */
/**
 * Os BLOCOS do CORPO da tarefa (a ordem é da pessoa — arrastáveis): nota e link (repetíveis), checklists, eventos e
 * vínculo. Responsáveis, etiquetas, datas, prioridade, estimativa e recorrência são METADADOS (a faixa do topo do
 * detalhe, como no Trello) — os blocos antigos desses tipos são ignorados na leitura (o dado mora nas colunas).
 */
export const TIPOS_BLOCO = ["nota", "checklist", "link", "eventos", "vinculo"] as const;
export type TipoBloco = (typeof TIPOS_BLOCO)[number];
export const ROTULO_BLOCO: Record<TipoBloco, string> = {
  nota: "Nota",
  checklist: "Checklist",
  link: "Link",
  eventos: "Eventos",
  vinculo: "Vínculos",
};
/** Os METADADOS da tarefa (a faixa do topo do detalhe — aparecem quando têm dado ou foram acrescentados). */
export const TIPOS_METADADO = ["membros", "etiquetas", "datas", "prioridade", "estimativa"] as const;
export type TipoMetadado = (typeof TIPOS_METADADO)[number];
export const ROTULO_METADADO: Record<TipoMetadado, string> = { membros: "Membros", etiquetas: "Etiquetas", datas: "Datas", prioridade: "Prioridade", estimativa: "Estimativa" };
export const BLOCOS_REPETIVEIS: readonly TipoBloco[] = ["nota", "link"];
export const MAX_BLOCOS = 30;
export const MAX_NOTA = 5000;
export const MAX_URL = 1000;
export const MAX_TITULO_LINK = 200;

export type BlocoTarefa =
  | { id: string; tipo: "nota"; texto: string }
  | { id: string; tipo: "link"; url: string; titulo: string }
  | { id: string; tipo: Exclude<TipoBloco, "nota" | "link"> };

export const urlValida = (u: string) => u.length <= MAX_URL && /^https?:\/\/[^\s]+$/i.test(u.trim());

/** Lê os blocos gravados (JSON ou array) — tolerante: descarta o inválido, repetição de bloco único e o excesso. `null` = nunca gravou. */
export function lerBlocos(v: unknown): BlocoTarefa[] | null {
  let bruto = v;
  if (typeof v === "string") {
    try {
      bruto = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(bruto)) return null;
  const vistos = new Set<string>();
  const out: BlocoTarefa[] = [];
  for (const b of bruto as Record<string, unknown>[]) {
    if (out.length >= MAX_BLOCOS) break;
    const tipo = b?.tipo;
    if (!(TIPOS_BLOCO as readonly unknown[]).includes(tipo)) continue;
    const id = typeof b.id === "string" && b.id && b.id.length <= 20 ? b.id : `b${out.length + 1}`;
    if (vistos.has(id)) continue;
    const t = tipo as TipoBloco;
    if (!BLOCOS_REPETIVEIS.includes(t) && out.some((x) => x.tipo === t)) continue;
    vistos.add(id);
    if (t === "nota") out.push({ id, tipo: t, texto: texto(b.texto, MAX_NOTA) });
    else if (t === "link") {
      const url = typeof b.url === "string" ? b.url.trim() : "";
      out.push({ id, tipo: t, url: urlValida(url) ? url : "", titulo: texto(b.titulo, MAX_TITULO_LINK) });
    } else out.push({ id, tipo: t });
  }
  return out;
}

/** O que diz se um bloco de CAMPO tem dado (um bloco com dado nunca some da tarefa). */
export type DadosBlocos = { vinculos: number; checklist: number; eventos: number };
export function blocoTemDado(tipo: TipoBloco, d: DadosBlocos): boolean {
  if (tipo === "vinculo") return d.vinculos > 0;
  if (tipo === "checklist") return d.checklist > 0;
  if (tipo === "eventos") return d.eventos > 0;
  return false;
}

/** O que diz se um METADADO tem dado (aparece na faixa). A prioridade "média" é o padrão — só aparece quando outra. */
export type DadosMetadados = {
  pessoas: number[];
  observadores: number[];
  equipes: number[];
  etiquetas: number[];
  inicio: string | null;
  prazo: string | null;
  recorrencia: unknown;
  prioridade: Prioridade;
  estimativaH: number | null;
};
export function metadadoTemDado(tipo: TipoMetadado, d: DadosMetadados): boolean {
  switch (tipo) {
    case "membros":
      return d.pessoas.length + d.observadores.length + d.equipes.length > 0;
    case "etiquetas":
      return d.etiquetas.length > 0;
    case "datas":
      return !!(d.inicio || d.prazo || d.recorrencia);
    case "prioridade":
      return d.prioridade !== "media";
    case "estimativa":
      return d.estimativaH != null;
  }
}

/**
 * Os blocos que a tarefa MOSTRA, na ordem: os gravados + os de campo que têm dado e ainda não estão (no fim, na ordem da
 * paleta). Sem gravação (tarefa antiga), só os de campo com dado.
 */
export function blocosDaTarefa(gravados: BlocoTarefa[] | null, d: DadosBlocos): BlocoTarefa[] {
  const lista = [...(gravados ?? [])];
  for (const tipo of TIPOS_BLOCO) {
    if (BLOCOS_REPETIVEIS.includes(tipo) || lista.some((b) => b.tipo === tipo) || !blocoTemDado(tipo, d)) continue;
    lista.push({ id: novoIdBloco(lista), tipo } as BlocoTarefa);
  }
  return lista;
}

/** Um id que ainda não está na lista ("b1", "b2"…). */
export function novoIdBloco(lista: { id: string }[]): string {
  let n = lista.length + 1;
  const ids = new Set(lista.map((b) => b.id));
  while (ids.has(`b${n}`)) n++;
  return `b${n}`;
}

/** Os tipos que ainda podem entrar (a paleta): os repetíveis sempre, os únicos se ausentes; nada além do teto. */
export const blocosDisponiveis = (lista: BlocoTarefa[]): TipoBloco[] =>
  lista.length >= MAX_BLOCOS ? [] : TIPOS_BLOCO.filter((t) => BLOCOS_REPETIVEIS.includes(t) || !lista.some((b) => b.tipo === t));

/** ADICIONA um bloco na posição `pos` (fim quando ausente). Único repetido ou teto atingido = a lista igual. */
export function adicionarBloco(lista: BlocoTarefa[], tipo: TipoBloco, pos?: number): BlocoTarefa[] {
  if (!blocosDisponiveis(lista).includes(tipo)) return lista;
  const id = novoIdBloco(lista);
  const b: BlocoTarefa = tipo === "nota" ? { id, tipo, texto: "" } : tipo === "link" ? { id, tipo, url: "", titulo: "" } : ({ id, tipo } as BlocoTarefa);
  const i = pos == null ? lista.length : Math.max(0, Math.min(lista.length, pos));
  return [...lista.slice(0, i), b, ...lista.slice(i)];
}

/** MOVE o bloco para a posição `destino` (índice na lista SEM ele). */
export function moverBloco(lista: BlocoTarefa[], id: string, destino: number): BlocoTarefa[] {
  const b = lista.find((x) => x.id === id);
  if (!b) return lista;
  const sem = lista.filter((x) => x.id !== id);
  const i = Math.max(0, Math.min(sem.length, destino));
  return [...sem.slice(0, i), b, ...sem.slice(i)];
}

export const removerBloco = (lista: BlocoTarefa[], id: string) => lista.filter((b) => b.id !== id);

/** O que se GRAVA: sem nota vazia e sem link sem endereço (rascunhos que ficaram em branco). */
export const blocosParaGravar = (lista: BlocoTarefa[]): BlocoTarefa[] =>
  lista.filter((b) => (b.tipo === "nota" ? b.texto.trim() !== "" : b.tipo === "link" ? urlValida(b.url) : true)).map((b) => (b.tipo === "nota" ? { ...b, texto: b.texto.trim() } : b));

/** Quantas NOTAS e LINKS (os ícones do cartão). */
export const contagemBlocos = (lista: BlocoTarefa[] | null) => ({
  notas: (lista ?? []).filter((b) => b.tipo === "nota").length,
  links: (lista ?? []).filter((b) => b.tipo === "link").length,
});

// ─── Fase 3: RECORRÊNCIA ─────────────────────────────────────────────────────────────────────────────────────

export const FREQUENCIAS = ["diaria", "semanal", "mensal", "anual"] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];
export const ROTULO_FREQUENCIA: Record<Frequencia, string> = { diaria: "Diária", semanal: "Semanal", mensal: "Mensal", anual: "Anual" };
const UNIDADE_FREQ: Record<Frequencia, [string, string]> = { diaria: ["dia", "dias"], semanal: ["semana", "semanas"], mensal: ["mês", "meses"], anual: ["ano", "anos"] };
/** "dia"/"dias"… — a unidade do intervalo (o campo "a cada N"). */
export const unidadeFrequencia = (f: Frequencia, n: number) => UNIDADE_FREQ[f][n === 1 ? 0 : 1];
export const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * A regra de REPETIÇÃO de uma tarefa: a cada `intervalo` dias/semanas/meses/anos (`dias` = os dias da semana, 0 = domingo,
 * só na semanal). `base` = a próxima conta a partir do PRAZO da atual (agenda fixa) ou da data da CONCLUSÃO.
 */
export type Recorrencia = { freq: Frequencia; intervalo: number; dias?: number[]; base: "prazo" | "conclusao" };

/** Lê a regra gravada (JSON ou objeto) — qualquer coisa inválida = `null` (não se repete). */
export function lerRecorrencia(v: unknown): Recorrencia | null {
  let o: unknown = v;
  if (typeof v === "string") {
    try {
      o = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (!(FREQUENCIAS as readonly unknown[]).includes(r.freq)) return null;
  const intervalo = Number(r.intervalo);
  if (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 365) return null;
  const dias = Array.isArray(r.dias) ? [...new Set(r.dias.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b) : [];
  return { freq: r.freq as Frequencia, intervalo, ...(r.freq === "semanal" && dias.length ? { dias } : {}), base: r.base === "conclusao" ? "conclusao" : "prazo" };
}

/** "Semanal — a cada 2 semanas (seg, qua)" / "Diária". */
export function rotuloRecorrencia(r: Recorrencia): string {
  const cada = r.intervalo === 1 ? ROTULO_FREQUENCIA[r.freq] : `A cada ${r.intervalo} ${UNIDADE_FREQ[r.freq][1]}`;
  const dias = r.freq === "semanal" && r.dias?.length ? ` (${r.dias.map((d) => DIAS_CURTOS[d]).join(", ")})` : "";
  return `${cada}${dias}${r.base === "conclusao" ? " após concluir" : ""}`;
}

const diaNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / diaMs);
const isoNum = (n: number) => new Date(n * diaMs).toISOString().slice(0, 10);
/** Domingo da semana do dia (1970-01-01 foi uma quinta). */
const domingoDe = (n: number) => n - ((n + 4) % 7);

/** "AAAA-MM-DD" + n meses, com o dia PRESO ao último do mês (31/jan + 1 mês = 28 ou 29/fev). */
function somarMeses(iso: string, n: number, diaAlvo: number): string {
  const [a, m] = iso.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  const ano = Math.floor(total / 12);
  const mes = total % 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(diaAlvo, ultimo))).toISOString().slice(0, 10);
}

/** A data seguinte à `base` pela regra (um passo). */
function passo(r: Recorrencia, base: string, diaAlvo: number): string {
  if (r.freq === "diaria") return somarDias(base, r.intervalo);
  if (r.freq === "mensal") return somarMeses(base, r.intervalo, diaAlvo);
  if (r.freq === "anual") return somarMeses(base, 12 * r.intervalo, diaAlvo);
  if (!r.dias?.length) return somarDias(base, 7 * r.intervalo);
  // Semanal com dias: o próximo dia marcado, só nas semanas "da vez" (a cada `intervalo` semanas contando da base).
  const b = diaNum(base);
  const semanaBase = domingoDe(b);
  for (let d = b + 1; d <= b + 7 * r.intervalo + 7; d++) {
    const semanas = (domingoDe(d) - semanaBase) / 7;
    if (semanas % r.intervalo === 0 && r.dias.includes((d + 4) % 7)) return isoNum(d);
  }
  return somarDias(base, 7 * r.intervalo);
}

/**
 * SALTA a série para perto de `alvo` sem andar passo a passo (uma série de 2010 vista em 2026 teria milhares de passos):
 * devolve uma data DA SÉRIE (a base + N períodos inteiros) pelo menos um período ANTES de `alvo` — seguir com `passo` a
 * partir dela dá as mesmas datas que andar desde a base.
 */
function saltar(r: Recorrencia, base: string, diaAlvo: number, alvo: string): string {
  if (alvo <= base) return base;
  if (r.freq === "diaria" || r.freq === "semanal") {
    const periodo = r.freq === "diaria" ? r.intervalo : 7 * r.intervalo;
    const k = Math.floor(diasEntre(base, alvo) / periodo) - 1;
    return k > 0 ? somarDias(base, k * periodo) : base;
  }
  const meses = (r.freq === "anual" ? 12 : 1) * r.intervalo;
  const [a0, m0] = base.split("-").map(Number);
  const [a1, m1] = alvo.split("-").map(Number);
  const k = Math.floor(((a1 - a0) * 12 + (m1 - m0)) / meses) - 1;
  return k > 0 ? somarMeses(base, k * meses, diaAlvo) : base;
}

/**
 * A PRÓXIMA ocorrência de uma tarefa recorrente concluída: o novo prazo (e o início, mantendo a duração início → prazo).
 * Conta do PRAZO atual (base "prazo"; sem prazo, da conclusão) ou da CONCLUSÃO (`concluidaEm` = "AAAA-MM-DD"); um prazo que
 * ficou para trás avança até cair em `hoje` ou depois (nunca nasce atrasada). Sem prazo na atual, conta da conclusão —
 * a próxima sempre nasce com prazo (a série precisa de uma agenda).
 */
export function proximaOcorrencia(
  r: Recorrencia,
  atual: { inicio: string | null; prazo: string | null },
  concluidaEm: string,
  hoje: string,
): { inicio: string | null; prazo: string } {
  const base = r.base === "prazo" && dataValida(atual.prazo) ? atual.prazo : concluidaEm;
  const diaAlvo = Number(base.slice(8, 10));
  let prazo = passo(r, base, diaAlvo);
  if (prazo < hoje) prazo = passo(r, saltar(r, base, diaAlvo, hoje), diaAlvo);
  for (let i = 0; prazo < hoje && i < 5000; i++) prazo = passo(r, prazo, diaAlvo);
  const duracao = dataValida(atual.inicio) && dataValida(atual.prazo) ? diasEntre(atual.inicio, atual.prazo) : null;
  return { inicio: duracao != null ? somarDias(prazo, -duracao) : null, prazo };
}

// ─── Fase 3: NOTIFICAÇÕES de PRAZO (derivadas na leitura — sem cron) ─────────────────────────────────────────

export const TIPOS_NOTIFICACAO = ["atribuida", "mencionada", "comentario", "vence_amanha", "atrasada", "automacao", "lembrete", "convite", "resposta"] as const;
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];

/** O link que abre a tarefa no quadro. */
export const linkTarefa = (quadroId: number, tarefaId: number) => `/painel/tarefas/${quadroId}?tarefa=${tarefaId}`;

/**
 * A notificação de PRAZO de uma tarefa ABERTA do responsável: "vence amanhã" (prazo = amanhã) ou "atrasada" (prazo já
 * passou — até 30 dias; mais antigo não volta a avisar). A `chave` é por tarefa + prazo: avisa UMA vez por prazo (mudou
 * o prazo, avisa de novo). Fora disso, `null`.
 */
/**
 * O aviso de PRAZO de um ITEM de checklist (o responsável do item): vence amanhã | atrasado até 30 dias — a MESMA régua
 * da tarefa, com chave própria (item + prazo).
 */
export function notificacaoDePrazoItem(
  i: { itemId: number; texto: string; prazo: string | null; tarefaId: number; ticket: number; titulo: string; quadroId: number },
  hoje: string,
): { tipo: TipoNotificacao; chave: string; titulo: string; texto: string; link: string } | null {
  if (!dataValida(i.prazo)) return null;
  const d = diasEntre(hoje, i.prazo);
  const base = { link: linkTarefa(i.quadroId, i.tarefaId), texto: `${rotuloTicket(i.ticket)} ${i.titulo}` };
  if (d === 1) return { ...base, tipo: "vence_amanha", chave: `vence-item:${i.itemId}:${i.prazo}`, titulo: `Item vence amanhã: ${i.texto}` };
  if (d < 0 && d >= -30) return { ...base, tipo: "atrasada", chave: `atrasado-item:${i.itemId}:${i.prazo}`, titulo: `Item atrasado (prazo ${rotuloData(i.prazo, hoje)}): ${i.texto}` };
  return null;
}

export function notificacaoDePrazo(
  t: { id: number; ticket: number; titulo: string; prazo: string | null; quadroId: number; quadroNome: string },
  hoje: string,
): { tipo: TipoNotificacao; chave: string; titulo: string; texto: string; link: string } | null {
  if (!dataValida(t.prazo)) return null;
  const d = diasEntre(hoje, t.prazo);
  const base = { link: linkTarefa(t.quadroId, t.id), texto: `${rotuloTicket(t.ticket)} ${t.titulo} · ${t.quadroNome}` };
  if (d === 1) return { ...base, tipo: "vence_amanha", chave: `vence:${t.id}:${t.prazo}`, titulo: "Tarefa vence amanhã" };
  if (d < 0 && d >= -30) return { ...base, tipo: "atrasada", chave: `atrasada:${t.id}:${t.prazo}`, titulo: `Tarefa atrasada (prazo ${rotuloData(t.prazo, hoje)})` };
  return null;
}

// ─── Fase 3: DASHBOARD do quadro ─────────────────────────────────────────────────────────────────────────────

/** Semanas da série criadas × concluídas (a atual incluída — parcial). */
export const SEMANAS_TAREFAS = 12;
/** A classe do prazo de uma tarefa ABERTA (as 3 faixas do Dashboard). */
export type FaixaPrazo = "atrasada" | "vence" | "ok";
export const FAIXAS_PRAZO: FaixaPrazo[] = ["atrasada", "vence", "ok"];
export const ROTULO_FAIXA: Record<FaixaPrazo, string> = { atrasada: "Atrasadas", vence: "Vencem em até 2 dias", ok: "No prazo / sem prazo" };
export const COR_FAIXA: Record<FaixaPrazo, string> = { atrasada: "var(--danger)", vence: "var(--warn)", ok: "var(--ok)" };

export const faixaPrazo = (t: TarefaResumo, hoje: string): FaixaPrazo => {
  const e = estadoPrazo(t.prazo, hoje, false);
  return e === "atrasada" ? "atrasada" : e === "vence" || e === "hoje" ? "vence" : "ok";
};
/** Segunda-feira (AAAA-MM-DD) da semana do dia. */
const segundaDe = (iso: string) => {
  const n = diaNum(iso);
  return isoNum(n - ((n + 3) % 7));
};
const aberta = (t: TarefaResumo) => !t.arquivada && !t.concluidaEm;
const valida = (t: TarefaResumo) => !t.arquivada && !t.template;

/** Um recorte do Dashboard (o que foi tocado) — `tarefasDoRecorte` usa a MESMA regra da agregação. */
export type RecorteTarefas =
  | { dim: "abertas" }
  | { dim: "faixa"; faixa: FaixaPrazo }
  | { dim: "concluidasMes" }
  | { dim: "pessoa"; id: number | null }
  | { dim: "lista"; id: number }
  | { dim: "prioridade"; prioridade: Prioridade }
  | { dim: "semana"; inicio: string; serie: "criadas" | "concluidas" };

/** As tarefas (não arquivadas) de um recorte — a soma do detalhe = o número clicado. */
export function tarefasDoRecorte(tarefas: TarefaResumo[], r: RecorteTarefas, hoje: string): TarefaResumo[] {
  const mes = hoje.slice(0, 7);
  return tarefas.filter((t) => {
    if (!valida(t)) return false;
    switch (r.dim) {
      case "abertas":
        return aberta(t);
      case "faixa":
        return aberta(t) && faixaPrazo(t, hoje) === r.faixa;
      case "concluidasMes":
        return !!t.concluidaEm && dataIsoBrasilia(t.concluidaEm).startsWith(mes);
      case "pessoa":
        return aberta(t) && (r.id == null ? t.envolvidos.length === 0 : t.envolvidos.includes(r.id));
      case "lista":
        return t.listaId === r.id;
      case "prioridade":
        return aberta(t) && t.prioridade === r.prioridade;
      case "semana": {
        const ts = r.serie === "criadas" ? t.criadoEm : t.concluidaEm;
        const dia = dataIsoBrasilia(ts);
        return !!dia && segundaDe(dia) === r.inicio;
      }
      default:
        return false;
    }
  });
}

type PorFaixa = Record<FaixaPrazo, number>;
const zeroFaixa = (): PorFaixa => ({ atrasada: 0, vence: 0, ok: 0 });

export type PainelTarefas = {
  abertas: number;
  faixas: PorFaixa;
  concluidasMes: number;
  /** Dias médios da criação à conclusão (as concluídas); `null` sem nenhuma. */
  leadTime: number | null;
  /** % das concluídas COM prazo que terminaram até o prazo; `null` sem nenhuma. */
  noPrazo: number | null;
  semResponsavel: number;
  /** Carga (abertas) por pessoa por faixa — "Sem responsável" (id `null`) por último. */
  carga: { id: number | null; total: number; faixas: PorFaixa }[];
  /** Cartões por lista (não arquivados), na ordem das listas ativas. */
  porLista: { id: number; nome: string; n: number; limiteWip: number | null; concluida: boolean }[];
  porPrioridade: { prioridade: Prioridade; n: number }[];
  /** As últimas `SEMANAS_TAREFAS` semanas (segunda a domingo), a mais antiga primeiro. */
  semanas: { inicio: string; rotulo: string; atual: boolean; criadas: number; concluidas: number }[];
};

/** Agrega o DASHBOARD do quadro sobre as tarefas já carregadas (arquivadas fora). `hoje` = "AAAA-MM-DD" (Brasília). */
export function painelTarefas(tarefas: TarefaResumo[], listas: ListaTarefas[], hoje: string): PainelTarefas {
  const faixas = zeroFaixa();
  const porPessoa = new Map<number | null, { total: number; faixas: PorFaixa }>();
  const porPrio = new Map<Prioridade, number>(PRIORIDADES.map((p) => [p, 0]));
  const porLista = new Map<number, number>();
  const segAtual = segundaDe(hoje);
  const semanas = Array.from({ length: SEMANAS_TAREFAS }, (_, i) => {
    const inicio = somarDias(segAtual, -7 * (SEMANAS_TAREFAS - 1 - i));
    return { inicio, rotulo: `${inicio.slice(8)}/${inicio.slice(5, 7)}`, atual: i === SEMANAS_TAREFAS - 1, criadas: 0, concluidas: 0 };
  });
  const semana = new Map(semanas.map((s) => [s.inicio, s]));
  let abertas = 0;
  let concluidasMes = 0;
  let somaLead = 0;
  let nLead = 0;
  let comPrazo = 0;
  let dentro = 0;
  let semResponsavel = 0;
  for (const t of tarefas) {
    if (!valida(t)) continue;
    porLista.set(t.listaId, (porLista.get(t.listaId) ?? 0) + 1);
    const criada = dataIsoBrasilia(t.criadoEm);
    const sc = criada ? semana.get(segundaDe(criada)) : undefined;
    if (sc) sc.criadas++;
    if (t.concluidaEm) {
      const fim = dataIsoBrasilia(t.concluidaEm);
      if (fim) {
        const sf = semana.get(segundaDe(fim));
        if (sf) sf.concluidas++;
        if (fim.startsWith(hoje.slice(0, 7))) concluidasMes++;
        if (criada) {
          somaLead += Math.max(0, diasEntre(criada, fim));
          nLead++;
        }
        if (dataValida(t.prazo)) {
          comPrazo++;
          if (fim <= t.prazo) dentro++;
        }
      }
      continue;
    }
    abertas++;
    const f = faixaPrazo(t, hoje);
    faixas[f]++;
    porPrio.set(t.prioridade, (porPrio.get(t.prioridade) ?? 0) + 1);
    if (!t.envolvidos.length) semResponsavel++;
    for (const id of t.envolvidos.length ? t.envolvidos : [null]) {
      const c = porPessoa.get(id) ?? { total: 0, faixas: zeroFaixa() };
      c.total++;
      c.faixas[f]++;
      porPessoa.set(id, c);
    }
  }
  const carga = [...porPessoa.entries()]
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => (a.id == null ? 1 : b.id == null ? -1 : b.total - a.total || a.id - b.id));
  return {
    abertas,
    faixas,
    concluidasMes,
    leadTime: nLead ? somaLead / nLead : null,
    noPrazo: comPrazo ? (dentro / comPrazo) * 100 : null,
    semResponsavel,
    carga,
    porLista: listas.filter((l) => !l.arquivada).map((l) => ({ id: l.id, nome: l.nome, n: porLista.get(l.id) ?? 0, limiteWip: l.limiteWip, concluida: l.concluida })),
    porPrioridade: [...PRIORIDADES].reverse().map((p) => ({ prioridade: p, n: porPrio.get(p) ?? 0 })),
    semanas,
  };
}

// ─── Fase 3: AUTOMAÇÕES ──────────────────────────────────────────────────────────────────────────────────────

export const GATILHOS = ["entrar_lista", "concluir"] as const;
export type GatilhoAutomacao = (typeof GATILHOS)[number];
export const ROTULO_GATILHO: Record<GatilhoAutomacao, string> = { entrar_lista: "Quando entrar na lista", concluir: "Quando for concluída" };
export const TIPOS_ACAO = ["mover_lista", "atribuir", "etiquetar", "prioridade", "notificar"] as const;
export type TipoAcao = (typeof TIPOS_ACAO)[number];
export const ROTULO_ACAO: Record<TipoAcao, string> = {
  mover_lista: "mover para a lista",
  atribuir: "atribuir a",
  etiquetar: "etiquetar com",
  prioridade: "mudar a prioridade para",
  notificar: "notificar os responsáveis e observadores",
};
export type AcaoAutomacao =
  | { tipo: "mover_lista"; listaId: number }
  | { tipo: "atribuir"; usuarioId: number }
  | { tipo: "etiquetar"; etiquetaId: number }
  | { tipo: "prioridade"; prioridade: Prioridade }
  | { tipo: "notificar" };
export type Automacao = { id: number; gatilho: GatilhoAutomacao; listaId: number | null; acao: AcaoAutomacao; ativa: boolean };
/** Teto de regras por quadro. */
export const MAX_AUTOMACOES = 20;

/** Lê a ação gravada (JSON) — inválida = `null` (a regra é ignorada). */
export function lerAcaoAutomacao(v: unknown): AcaoAutomacao | null {
  let o: unknown = v;
  if (typeof v === "string") {
    try {
      o = JSON.parse(v);
    } catch {
      return null;
    }
  }
  const a = (o ?? {}) as Record<string, unknown>;
  const n = (k: string) => (Number.isInteger(a[k]) && (a[k] as number) > 0 ? (a[k] as number) : null);
  switch (a.tipo) {
    case "mover_lista":
      return n("listaId") ? { tipo: "mover_lista", listaId: n("listaId") as number } : null;
    case "atribuir":
      return n("usuarioId") ? { tipo: "atribuir", usuarioId: n("usuarioId") as number } : null;
    case "etiquetar":
      return n("etiquetaId") ? { tipo: "etiquetar", etiquetaId: n("etiquetaId") as number } : null;
    case "prioridade":
      return (PRIORIDADES as readonly unknown[]).includes(a.prioridade) ? { tipo: "prioridade", prioridade: a.prioridade as Prioridade } : null;
    case "notificar":
      return { tipo: "notificar" };
    default:
      return null;
  }
}

/**
 * As AÇÕES que um evento dispara: a tarefa ENTROU na lista `listaId` (e, se a lista é de concluídas, também "concluir").
 * Só as regras ATIVAS; "entrar na lista" casa a lista da regra. Profundidade 1: quem executa NÃO reavalia as regras
 * depois das ações (mover por automação não dispara outra automação — nunca entra em laço).
 */
export function automacoesDoEvento(regras: Automacao[], evento: { listaId: number | null; concluida: boolean }): AcaoAutomacao[] {
  // `listaId` null = a tarefa foi concluída NO LUGAR (sem entrar em lista): só as regras "ao concluir".
  return regras
    .filter((r) => r.ativa && ((r.gatilho === "entrar_lista" && evento.listaId != null && r.listaId === evento.listaId) || (r.gatilho === "concluir" && evento.concluida)))
    .map((r) => r.acao);
}

// ─── Fase 3: MODELOS ─────────────────────────────────────────────────────────────────────────────────────────

export type ModeloQuadro = { cor?: string; descricao?: string | null; listas: { nome: string; limiteWip: number | null; concluida: boolean }[]; etiquetas: { nome: string; cor: string }[] };
export type ModeloResumo = { id: number; tipo: "quadro"; nome: string; grupoId: number | null; quadroId: number | null; criadoPor: number | null };

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const corHex = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);

/** Qualquer JSON → um modelo de QUADRO válido (ao menos uma lista; listas/etiquetas com nome). */
export function coerceModeloQuadro(v: unknown): ModeloQuadro {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const listas = (Array.isArray(o.listas) ? o.listas : [])
    .map((l: Record<string, unknown>) => ({
      nome: texto(l?.nome, 60),
      limiteWip: Number.isInteger(l?.limiteWip) && (l.limiteWip as number) > 0 ? (l.limiteWip as number) : null,
      concluida: l?.concluida === true,
    }))
    .filter((l) => l.nome)
    .slice(0, 30);
  const etiquetas = (Array.isArray(o.etiquetas) ? o.etiquetas : [])
    .map((e: Record<string, unknown>) => ({ nome: texto(e?.nome, 30), cor: corHex(e?.cor) ?? "#6366f1" }))
    .filter((e) => e.nome)
    .slice(0, 50);
  return {
    cor: corHex(o.cor) ?? undefined,
    descricao: texto(o.descricao, 500) || null,
    listas: listas.length ? listas : [{ nome: "A fazer", limiteWip: null, concluida: false }],
    etiquetas,
  };
}

// ─── LISTAS: ordenar, favoritos (F4) ─────────────────────────────────────────────────────────────────────────

export const ORDENACOES_LISTA = ["prazo", "criacao", "titulo", "prioridade"] as const;
export type OrdenacaoLista = (typeof ORDENACOES_LISTA)[number];
export const ROTULO_ORDENACAO: Record<OrdenacaoLista, string> = {
  prazo: "Prazo (mais próximo primeiro)",
  criacao: "Criação (mais antiga primeiro)",
  titulo: "Título (A → Z)",
  prioridade: "Prioridade (urgente primeiro)",
};
const collTitulo = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/**
 * A NOVA ORDEM dos cartões de uma lista pelo critério (os ids, do topo ao fim): prazo — os sem prazo no fim, a hora
 * desempata (sem hora = fim do dia); criação; título (natural, "2." antes de "10."); prioridade (urgente → baixa). O
 * empate mantém a ordem atual (estável).
 */
export function ordenarCartoes(tarefas: Pick<TarefaResumo, "id" | "ordem" | "prazo" | "prazoHora" | "criadoEm" | "titulo" | "prioridade">[], por: OrdenacaoLista): number[] {
  const peso = (p: Prioridade) => PRIORIDADES.indexOf(p);
  const cmp = (a: (typeof tarefas)[number], b: (typeof tarefas)[number]) => {
    if (por === "prazo") {
      if (!a.prazo || !b.prazo) return a.prazo ? -1 : b.prazo ? 1 : 0;
      return `${a.prazo} ${a.prazoHora ?? "99:99"}`.localeCompare(`${b.prazo} ${b.prazoHora ?? "99:99"}`);
    }
    if (por === "criacao") return (a.criadoEm ?? "").localeCompare(b.criadoEm ?? "") || a.id - b.id;
    if (por === "titulo") return collTitulo.compare(a.titulo, b.titulo);
    return peso(b.prioridade) - peso(a.prioridade);
  };
  return [...tarefas].sort((a, b) => cmp(a, b) || a.ordem - b.ordem || a.id - b.id).map((t) => t.id);
}

/** A preferência dos QUADROS FAVORITOS da pessoa (`preferencias_tabela`). */
export const CHAVE_FAVORITOS_TAREFAS = "tarefas:favoritos";
/** Qualquer JSON → os ids favoritos (inteiros positivos, sem repetir, até 200). */
export function lerFavoritos(v: unknown): number[] {
  const l = Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as { ids?: unknown }).ids) ? (v as { ids: unknown[] }).ids : [];
  return [...new Set(l.filter((x): x is number => Number.isInteger(x) && (x as number) > 0))].slice(0, 200);
}
/** Os quadros com os FAVORITOS primeiro (a ordem de cada grupo se mantém). */
export function favoritosPrimeiro<Q extends { id: number }>(quadros: Q[], favoritos: number[]): Q[] {
  const f = new Set(favoritos);
  return [...quadros.filter((q) => f.has(q.id)), ...quadros.filter((q) => !f.has(q.id))];
}

/**
 * PASTAS de quadros (migração `0061` — no banco): a PÚBLICA é do GRUPO (todos os membros a veem; só EDITORES a organizam)
 * e a PRIVADA é do DONO (só ele a vê; TUDO dentro dela é privado — só entram quadros criados por ele, que viram privados).
 * Um quadro fica em UMA pasta só (`tarefa_quadros.pasta_id`). A ORDEM da RAIZ (pastas e quadros soltos) é pessoal —
 * preferência `tarefas:conjuntos` (`{ ordem }`).
 */
export const CHAVE_CONJUNTOS_TAREFAS = "tarefas:conjuntos";
/** Uma pasta: `id` = o nº dela (texto — a chave da grade), os quadros NA ORDEM de dentro. */
export type ConjuntoQuadros = { id: string; nome: string; cor: string; quadros: number[]; privado: boolean; criadoPor: number | null; grupoId: number };
export const MAX_CONJUNTOS = 30;
export const MAX_QUADROS_CONJUNTO = 100;
export const MAX_NOME_CONJUNTO = 40;

/** Os quadros de um conjunto, NA ORDEM do conjunto — só os que existem (o quadro excluído/arquivado/sem acesso some). */
export function quadrosDoConjunto<Q extends { id: number }>(c: ConjuntoQuadros, quadros: Q[]): Q[] {
  const porId = new Map(quadros.map((q) => [q.id, q]));
  return c.quadros.map((id) => porId.get(id)).filter((q): q is Q => !!q);
}

/** Uma pasta como vem do banco. */
export type PastaGravada = { id: number; nome: string; cor: string; privado: boolean; criadoPor: number | null; grupoId: number };
/**
 * As pastas com os quadros de cada uma (pela `pastaOrdem`, empate pelo id) — só os quadros recebidos (os visíveis). Na
 * ordem das pastas recebida.
 */
export function pastasDosQuadros(pastas: PastaGravada[], quadros: { id: number; pastaId: number | null; pastaOrdem: number }[]): ConjuntoQuadros[] {
  const porPasta = new Map<number, { id: number; pastaOrdem: number }[]>();
  for (const q of quadros) if (q.pastaId != null) porPasta.set(q.pastaId, [...(porPasta.get(q.pastaId) ?? []), q]);
  return pastas.map((p) => ({
    id: String(p.id),
    nome: p.nome,
    cor: p.cor,
    privado: p.privado,
    criadoPor: p.criadoPor,
    grupoId: p.grupoId,
    quadros: (porPasta.get(p.id) ?? []).sort((a, b) => a.pastaOrdem - b.pastaOrdem || a.id - b.id).map((q) => q.id),
  }));
}

/**
 * Quem mexe nas pastas: o id, os GRUPOS em que o papel CONFIGURA Tarefas (organiza a pasta PÚBLICA do grupo) e os em que
 * MANIPULA (a pasta PRIVADA é do dono, que precisa manipular no grupo dela) — `null` = todos (o ADM, que também entra na
 * pasta privada órfã).
 */
export type AtorPasta = { id: number; configuraEm: number[] | null; manipulaEm: number[] | null; admin?: boolean };
const noGrupoDoAtor = (lista: number[] | null, grupoId: number) => lista == null || lista.includes(grupoId);
/** Pode criar uma pasta PÚBLICA — no grupo dela (`grupoId`) ou, sem ele, em algum grupo (o servidor confere o grupo). */
export const podePastaPublica = (ator: AtorPasta, grupoId?: number | null): boolean =>
  grupoId ? noGrupoDoAtor(ator.configuraEm, grupoId) : ator.configuraEm == null || ator.configuraEm.length > 0;
/** O quadro que entra/sai de uma pasta. */
export type QuadroPasta = { grupoId: number; privado: boolean; criadoPor: number | null };

/** Pode ORGANIZAR a pasta (nome, cor, quadros, excluir)? A pública: quem CONFIGURA Tarefas no grupo dela; a privada: o dono
 * (que manipula no grupo — a órfã: o ADM). */
export function podeEditarPasta(p: Pick<ConjuntoQuadros, "privado" | "criadoPor" | "grupoId">, ator: AtorPasta): boolean {
  if (p.privado) return (p.criadoPor === ator.id && noGrupoDoAtor(ator.manipulaEm, p.grupoId)) || (p.criadoPor == null && !!ator.admin);
  return noGrupoDoAtor(ator.configuraEm, p.grupoId);
}

/**
 * Por que o quadro NÃO pode sair de `origem` e ir para `destino` (`null` = a raiz)? `null` = pode. Pública: quem configura,
 * só quadro NÃO privado, do MESMO grupo. Privada: só o dono, só quadro criado por ELE, do mesmo grupo. Tirar: quem pode
 * organizar a pasta de origem. `tornarPublico` = o dono tira o quadro da privada deixando-o visível ao grupo.
 */
export function motivoNaoMoverParaPasta(
  q: QuadroPasta,
  origem: Pick<ConjuntoQuadros, "id" | "privado" | "criadoPor" | "grupoId"> | null,
  destino: Pick<ConjuntoQuadros, "id" | "privado" | "criadoPor" | "grupoId"> | null,
  ator: AtorPasta,
  tornarPublico = false,
): string | null {
  const falta = (p: Pick<ConjuntoQuadros, "privado">) =>
    p.privado ? "Só o dono organiza a pasta privada." : "Só quem configura Tarefas neste grupo organiza a pasta pública.";
  if (origem && !podeEditarPasta(origem, ator)) return falta(origem);
  if (!destino) return null;
  if (!podeEditarPasta(destino, ator)) return falta(destino);
  if (q.grupoId !== destino.grupoId) return "A pasta é de outro grupo.";
  if (destino.privado) return q.criadoPor === destino.criadoPor ? null : "Só quadros criados por você entram na sua pasta privada.";
  const privado = q.privado && !(tornarPublico && origem?.privado && origem.id !== destino.id);
  return privado ? "Quadro privado só entra em pasta privada." : null;
}

/** O estado das PASTAS visto pela pessoa: as pastas (do banco) + a ORDEM pessoal da grade (`p:<pasta>` e `q:<quadro solto>`). */
export type PastasQuadros = { lista: ConjuntoQuadros[]; ordem: string[] };
export const MAX_ORDEM_GRADE = 2000;
export const chavePasta = (id: string) => `p:${id}`;
export const chaveQuadro = (id: number) => `q:${id}`;
const CHAVE_GRADE = /^(p:[^\s]{1,40}|q:[1-9]\d{0,9})$/;

/** Qualquer JSON → a ORDEM pessoal da raiz (só chaves válidas, sem repetir) — as pastas vêm do banco. */
export function lerOrdemGrade(v: unknown): string[] {
  const bruta = v && typeof v === "object" && Array.isArray((v as { ordem?: unknown }).ordem) ? (v as { ordem: unknown[] }).ordem : [];
  return [...new Set(bruta.filter((x): x is string => typeof x === "string" && CHAVE_GRADE.test(x)))].slice(0, MAX_ORDEM_GRADE);
}

/** Um item da GRADE: uma pasta (com os quadros dela, na ordem) ou um quadro solto. */
export type ItemGrade<Q> = { tipo: "pasta"; chave: string; pasta: ConjuntoQuadros; quadros: Q[] } | { tipo: "quadro"; chave: string; quadro: Q };

/**
 * A GRADE na ordem da pessoa: as pastas e os quadros SOLTOS (os que não estão em pasta). O que não está na ordem entra no
 * fim (as pastas novas, depois os quadros na ordem recebida); quadro sumido/sem acesso não aparece. `ocultarVazias` = sem
 * as pastas que não têm quadro na lista recebida (com filtro/busca ligados).
 */
export function itensDaGrade<Q extends { id: number }>(quadros: Q[], estado: PastasQuadros, ocultarVazias = false): ItemGrade<Q>[] {
  const porId = new Map(quadros.map((q) => [q.id, q]));
  const emPasta = new Set(estado.lista.flatMap((c) => c.quadros));
  const pastas = new Map(estado.lista.map((c) => [chavePasta(c.id), c]));
  const itens: ItemGrade<Q>[] = [];
  const vistos = new Set<string>();
  const porNaGrade = (chave: string) => {
    if (vistos.has(chave)) return;
    const c = pastas.get(chave);
    if (c) {
      vistos.add(chave);
      const qs = quadrosDoConjunto(c, quadros);
      if (!ocultarVazias || qs.length) itens.push({ tipo: "pasta", chave, pasta: c, quadros: qs });
      return;
    }
    const q = chave.startsWith("q:") ? porId.get(Number(chave.slice(2))) : undefined;
    if (q && !emPasta.has(q.id)) {
      vistos.add(chave);
      itens.push({ tipo: "quadro", chave, quadro: q });
    }
  };
  for (const k of estado.ordem) porNaGrade(k);
  for (const c of estado.lista) porNaGrade(chavePasta(c.id));
  for (const q of quadros) porNaGrade(chaveQuadro(q.id));
  return itens;
}

/** A ordem gravada + as chaves da tela que ainda não estão nela (no fim — é onde `itensDaGrade` as mostra). */
function ordemCompleta(estado: PastasQuadros, raiz: string[]): string[] {
  const tem = new Set(estado.ordem);
  return [...estado.ordem, ...raiz.filter((k) => !tem.has(k))];
}

/** Para onde um item vai: dentro de uma pasta (`pasta`) ou na raiz (`null`), antes/depois de um item VISÍVEL (ou no fim). */
export type DestinoGrade = { pasta: string | null; antesDe?: string | null; depoisDe?: string | null };

/**
 * MOVE um item da grade (a pasta ou o quadro) — reordena na raiz ou dentro de uma pasta, põe o quadro numa pasta ou o tira
 * dela. `raiz` = as chaves da raiz como estão (as de `itensDaGrade` com TODOS os quadros — a ordem gravada pode estar
 * incompleta). O destino é relativo a um vizinho VISÍVEL (com filtro, o resto da ordem fica). Uma pasta nunca entra em outra;
 * pasta cheia não recebe. Devolve o MESMO estado quando nada muda.
 */
export function moverNaGrade(estado: PastasQuadros, raiz: string[], chave: string, destino: DestinoGrade): PastasQuadros {
  const ehPasta = chave.startsWith("p:");
  if (ehPasta && destino.pasta != null) return estado;
  const alvo = destino.pasta != null ? estado.lista.find((c) => c.id === destino.pasta) : null;
  if (destino.pasta != null && !alvo) return estado;
  const qid = ehPasta ? 0 : Number(chave.slice(2));
  if (!ehPasta && !(qid > 0)) return estado;
  if (alvo && !alvo.quadros.includes(qid) && alvo.quadros.length >= MAX_QUADROS_CONJUNTO) return estado;
  const inserir = <T>(lista: T[], item: T, antes: T | null | undefined, depois: T | null | undefined) => {
    const i = antes != null ? lista.indexOf(antes) : -1;
    if (i >= 0) return [...lista.slice(0, i), item, ...lista.slice(i)];
    const j = depois != null ? lista.indexOf(depois) : -1;
    if (j >= 0) return [...lista.slice(0, j + 1), item, ...lista.slice(j + 1)];
    return [...lista, item];
  };
  // Tira o item de onde está (a raiz e qualquer pasta). A base é a ordem COMPLETA (a gravada + a da tela) — a tela pode
  // mostrar só parte dos quadros (o grupo ativo): os lugares dos outros ficam.
  const semNaRaiz = ordemCompleta(estado, raiz).filter((k) => k !== chave);
  const lista = ehPasta ? estado.lista : estado.lista.map((c) => (c.quadros.includes(qid) ? { ...c, quadros: c.quadros.filter((q) => q !== qid) } : c));
  if (alvo) {
    const id = (k: string | null | undefined) => (k?.startsWith("q:") ? Number(k.slice(2)) : null);
    return {
      lista: lista.map((c) => (c.id === alvo.id ? { ...c, quadros: inserir(c.quadros, qid, id(destino.antesDe), id(destino.depoisDe)) } : c)),
      ordem: semNaRaiz.slice(0, MAX_ORDEM_GRADE),
    };
  }
  return { lista, ordem: inserir(semNaRaiz, chave, destino.antesDe, destino.depoisDe).slice(0, MAX_ORDEM_GRADE) };
}

/** EXCLUI a pasta: os quadros dela voltam à RAIZ, no lugar dela e na ordem que tinham (nenhum quadro é tocado). */
export function excluirPasta(estado: PastasQuadros, raiz: string[], id: string): PastasQuadros {
  const c = estado.lista.find((x) => x.id === id);
  if (!c) return estado;
  const k = chavePasta(id);
  const base = ordemCompleta(estado, raiz);
  const i = base.indexOf(k);
  const dela = c.quadros.map(chaveQuadro);
  const ordem = i >= 0 ? [...base.slice(0, i), ...dela, ...base.slice(i + 1)] : [...base, ...dela];
  return { lista: estado.lista.filter((x) => x.id !== id), ordem: ordem.slice(0, MAX_ORDEM_GRADE) };
}

// ─── CAMPOS PERSONALIZADOS e TÍTULO AUTOMÁTICO (migração `0056`) ────────────────────────────────────────────

export const TIPOS_CAMPO = ["texto", "numero", "data", "lista", "checkbox"] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];
export const ROTULO_TIPO_CAMPO: Record<TipoCampo, string> = { texto: "Texto", numero: "Número", data: "Data", lista: "Lista de opções", checkbox: "Caixa de marcar" };
/** Um CAMPO personalizado do quadro (`opcoes` = as da lista). */
export type CampoTarefa = { id: number; nome: string; tipo: TipoCampo; opcoes: string[]; ordem: number; noCartao: boolean };
export const MAX_CAMPOS = 20;
export const MAX_OPCOES_CAMPO = 50;
export const MAX_VALOR_CAMPO = 200;
export const coerceTipoCampo = (v: unknown): TipoCampo => ((TIPOS_CAMPO as readonly unknown[]).includes(v) ? (v as TipoCampo) : "texto");

/** As opções de uma lista gravadas (JSON ou array) — sem vazias, sem repetir, até 50. */
export function lerOpcoesCampo(v: unknown): string[] {
  let l: unknown = v;
  if (typeof v === "string") {
    try {
      l = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(l)) return [];
  return [...new Set(l.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 60)).filter(Boolean))].slice(0, MAX_OPCOES_CAMPO);
}

/**
 * O VALOR de um campo NORMALIZADO para gravar (texto aparado; número com ponto; data AAAA-MM-DD válida; opção da lista;
 * caixa "1") — `null` = vazio ou inválido (o valor sai da tarefa).
 */
export function valorCampo(c: Pick<CampoTarefa, "tipo" | "opcoes">, v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  switch (c.tipo) {
    case "texto":
      return s.slice(0, MAX_VALOR_CAMPO);
    case "numero": {
      const n = Number(s.replace(/\./g, "").replace(",", "."));
      const direto = Number(s);
      const x = Number.isFinite(direto) ? direto : n;
      return Number.isFinite(x) ? String(x) : null;
    }
    case "data":
      return /^\d{4}-\d{2}-\d{2}$/.test(s) && dataValida(s) ? s : null;
    case "lista":
      return c.opcoes.includes(s) ? s : null;
    case "checkbox":
      return s === "1" || s === "true" ? "1" : null;
  }
}

/** O valor para MOSTRAR (a data em dd/mm/aaaa, o número em pt-BR, a caixa marcada = o nome do campo — `nome`). */
export function rotuloValorCampo(c: Pick<CampoTarefa, "tipo" | "nome">, v: string | undefined | null): string {
  if (!v) return "";
  if (c.tipo === "data") return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  if (c.tipo === "numero") return Number(v).toLocaleString("pt-BR");
  if (c.tipo === "checkbox") return v === "1" ? c.nome : "";
  return v;
}

const chaveCampo = (s: string) => stripAccents(s.trim().toLocaleLowerCase("pt-BR"));
/** Os nomes de campo citados no formato ("{Tipo} - {Nº}" → ["Tipo", "Nº"]). */
export const camposDoFormato = (formato: string) => [...formato.matchAll(/\{([^{}]{1,60})\}/g)].map((m) => m[1].trim());

/**
 * O TÍTULO AUTOMÁTICO: o formato com os campos trocados pelos VALORES ("{Categoria} - {Tipo} - {Nº protocolo}"). Campo
 * vazio SOME junto do separador que o liga ao anterior (ou ao seguinte, se for o primeiro) — nunca sobra " - - ". Nome de
 * campo sem acento/caixa; um nome que não existe fica vazio. Até 200 caracteres.
 */
export function montarTitulo(formato: string, campos: Pick<CampoTarefa, "id" | "nome" | "tipo">[], valores: Record<number, string>): string {
  const porNome = new Map(campos.map((c) => [chaveCampo(c.nome), c]));
  const partes = formato.split(/(\{[^{}]{1,60}\})/g).filter((p) => p !== "");
  type Parte = { campo: boolean; v: string };
  const res: Parte[] = partes.map((p) => {
    const m = /^\{([^{}]{1,60})\}$/.exec(p);
    if (!m) return { campo: false, v: p };
    const c = porNome.get(chaveCampo(m[1]));
    return { campo: true, v: c ? rotuloValorCampo({ tipo: c.tipo, nome: c.nome }, valores[c.id]) : "" };
  });
  const separador = (s: string) => /^[\s\-–—|/·,:;]*$/.test(s);
  const out: Parte[] = [];
  for (let i = 0; i < res.length; i++) {
    const p = res[i];
    if (p.campo && !p.v) {
      // Tira o separador ANTES (se houver um campo cheio antes dele); senão, o separador DEPOIS.
      const ant = out[out.length - 1];
      if (ant && !ant.campo && separador(ant.v) && out.length > 1) out.pop();
      else if (res[i + 1] && !res[i + 1].campo && separador(res[i + 1].v)) i++;
      continue;
    }
    out.push(p);
  }
  return out
    .map((p) => p.v)
    .join("")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—|/·,:;]+|[\s\-–—|/·,:;]+$/g, "")
    .slice(0, 200);
}

/** Um valor de campo a GRAVAR (`null` = tira o valor da tarefa). */
export type ValorCampoNovo = { campoId: number; valor: string | null };

/**
 * Os VALORES de uma tarefa num quadro de DESTINO (copiar/mover): no mesmo quadro, os mesmos; em outro, pelo NOME do campo
 * (sem acento/caixa) e o MESMO tipo — e o valor tem de valer lá (a opção da lista existir). O que não casa fica de fora.
 */
export function mapearCampos(
  origem: Pick<CampoTarefa, "id" | "nome" | "tipo">[],
  destino: Pick<CampoTarefa, "id" | "nome" | "tipo" | "opcoes">[],
  valores: Record<number, string>,
): { campoId: number; valor: string }[] {
  const porNome = new Map(destino.map((c) => [`${chaveCampo(c.nome)}|${c.tipo}`, c]));
  const out: { campoId: number; valor: string }[] = [];
  for (const c of origem) {
    const v = valores[c.id];
    if (v == null) continue;
    const d = porNome.get(`${chaveCampo(c.nome)}|${c.tipo}`);
    const val = d ? valorCampo(d, v) : null;
    if (d && val != null) out.push({ campoId: d.id, valor: val });
  }
  return out;
}

/** Os valores da tarefa depois das MUDANÇAS (`null` tira) — a base do título automático. */
export function valoresAposMudar(atuais: Record<number, string>, mudancas: ValorCampoNovo[]): Record<number, string> {
  const r = { ...atuais };
  for (const m of mudancas) {
    if (m.valor == null) delete r[m.campoId];
    else r[m.campoId] = m.valor;
  }
  return r;
}

// ─── COPIAR / MOVER entre quadros e TEMPLATES (migração `0055`) ───────────────────────────────────────────────

/** O que vai junto na CÓPIA de uma tarefa (o título, a descrição, a prioridade, os blocos e o vínculo vão sempre). */
export type OpcoesCopia = { checklists: boolean; etiquetas: boolean; pessoas: boolean; datas: boolean };
export const OPCOES_COPIA_PADRAO: OpcoesCopia = { checklists: true, etiquetas: true, pessoas: true, datas: true };

const chaveNome = (s: string) => stripAccents(s.trim().toLocaleLowerCase("pt-BR")).replace(/\s+/g, " ");

/**
 * As etiquetas da ORIGEM no quadro de DESTINO, casadas pelo NOME (sem caixa/acento/espaços extras): as que existem viram
 * os ids do destino; as que faltam vão em `criar` (nome + cor da origem), sem repetir.
 */
export function mapearEtiquetas<E extends { id: number; nome: string; cor: string }>(origem: E[], destino: E[]): { ids: number[]; criar: { nome: string; cor: string }[] } {
  const porNome = new Map(destino.map((e) => [chaveNome(e.nome), e.id]));
  const ids = new Set<number>();
  const criar = new Map<string, { nome: string; cor: string }>();
  for (const e of origem) {
    const k = chaveNome(e.nome);
    if (!k) continue;
    const alvo = porNome.get(k);
    if (alvo != null) ids.add(alvo);
    else if (!criar.has(k)) criar.set(k, { nome: e.nome.trim(), cor: e.cor });
  }
  return { ids: [...ids], criar: [...criar.values()] };
}

/** Os ids da origem que têm um de MESMO NOME no destino (as equipes ao trocar de quadro) — os demais caem. */
export function mapearPorNome(origem: { nome: string }[], destino: { id: number; nome: string }[]): number[] {
  const porNome = new Map(destino.map((e) => [chaveNome(e.nome), e.id]));
  return [...new Set(origem.map((e) => porNome.get(chaveNome(e.nome))).filter((x): x is number => x != null))];
}

/** A lista onde nasce um TEMPLATE: a lista chamada "Templates" (ativa), senão a dada. */
export function listaDeTemplates(listas: { id: number; nome: string; arquivada: boolean }[], padrao: number): number {
  return listas.find((l) => !l.arquivada && chaveNome(l.nome) === "templates")?.id ?? padrao;
}

// ─── CALENDÁRIO por EVENTOS (migração `0046`) ────────────────────────────────────────────────────────────────

/** Um EVENTO cadastrado numa tarefa (o bloco "Eventos"). Hora "HH:MM"; sem hora = dia inteiro. */
export type EventoTarefa = {
  id: number;
  tarefaId: number;
  titulo: string;
  data: string;
  /** Último dia do evento de VÁRIOS dias (migração `0047`); `null` = um dia só. */
  dataFim: string | null;
  diaInteiro: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  local: string | null;
  descricao: string | null;
  cor: string | null;
  /** Minutos ANTES do início para o lembrete no sino; `null` = sem lembrete. */
  lembreteMin: number | null;
  /** A REPETIÇÃO própria do evento (migração `0048`); `null` = não se repete. */
  recorrencia: RecorrenciaEvento | null;
  /** Link da reunião (Meet/Teams/Zoom). */
  linkReuniao: string | null;
  /** Ocupado (padrão) ou livre. */
  ocupado: boolean;
  /** Privado: quem não participa vê só "Ocupado". */
  privado: boolean;
  /** Quem criou (participa sempre). */
  criadoPor: number | null;
  /** Os CONVIDADOS e a resposta de cada um. */
  convidados: ConvidadoEvento[];
};

/** A resposta de um convidado. */
export const RESPOSTAS_CONVITE = ["pendente", "sim", "nao", "talvez"] as const;
export type RespostaConvite = (typeof RESPOSTAS_CONVITE)[number];
export const ROTULO_RESPOSTA: Record<RespostaConvite, string> = { pendente: "Sem resposta", sim: "Vai", nao: "Não vai", talvez: "Talvez" };
export type ConvidadoEvento = { usuarioId: number; resposta: RespostaConvite };
export const coerceResposta = (v: unknown): RespostaConvite => ((RESPOSTAS_CONVITE as readonly unknown[]).includes(v) ? (v as RespostaConvite) : "pendente");

/** A REPETIÇÃO de um evento (como a do Google: diária/semanal com os dias/mensal/anual, a cada N, até uma data opcional). */
export type RecorrenciaEvento = { freq: Frequencia; intervalo: number; dias: number[]; ate: string | null };
export function lerRecorrenciaEvento(v: unknown): RecorrenciaEvento | null {
  const r = lerRecorrencia(v);
  if (!r) return null;
  let o: Record<string, unknown> = {};
  try {
    o = (typeof v === "string" ? JSON.parse(v) : v) as Record<string, unknown>;
  } catch {
    o = {};
  }
  const ate = typeof o?.ate === "string" && dataValida(o.ate) ? o.ate : null;
  return { freq: r.freq, intervalo: r.intervalo, dias: r.dias ?? [], ate };
}
export const rotuloRecorrenciaEvento = (r: RecorrenciaEvento) =>
  `${rotuloRecorrencia({ ...r, base: "prazo" })}${r.ate ? ` até ${r.ate.slice(8)}/${r.ate.slice(5, 7)}/${r.ate.slice(0, 4)}` : ""}`;

/**
 * As datas de INÍCIO das ocorrências de um evento que CRUZAM `de`–`ate` (a 1ª é a própria data; a repetição para na data
 * final dela; o evento de vários dias conta pela duração). Teto `max`.
 */
export function ocorrenciasDoEvento(e: Pick<EventoTarefa, "data" | "dataFim" | "recorrencia">, de: string, ate: string, max = 400): string[] {
  const dur = dataValida(e.dataFim) && e.dataFim > e.data ? diasEntre(e.data, e.dataFim) : 0;
  const cruza = (d: string) => somarDias(d, dur) >= de && d <= ate;
  if (!e.recorrencia) return cruza(e.data) ? [e.data] : [];
  const r: Recorrencia = { freq: e.recorrencia.freq, intervalo: e.recorrencia.intervalo, dias: e.recorrencia.dias, base: "prazo" };
  const fimSerie = e.recorrencia.ate && e.recorrencia.ate < ate ? e.recorrencia.ate : ate;
  const out = cruza(e.data) ? [e.data] : [];
  const diaAlvo = Number(e.data.slice(8, 10));
  let d = saltar(r, e.data, diaAlvo, somarDias(de, -dur));
  for (let i = 0; i < 5000 && out.length < max; i++) {
    d = passo(r, d, diaAlvo);
    if (d > fimSerie) break;
    if (cruza(d)) out.push(d);
  }
  return out;
}

/** Os dados a GRAVAR de um evento (sem id/tarefa/autor; convidados = os ids). */
export type DadosEvento = Omit<EventoTarefa, "id" | "tarefaId" | "criadoPor" | "convidados"> & { convidados: number[] };
export const dadosDoEventoGravado = (e: EventoTarefa): DadosEvento => {
  const { id: _i, tarefaId: _t, criadoPor: _c, convidados, ...d } = e;
  return { ...d, convidados: convidados.map((c) => c.usuarioId) };
};

/** Quem PARTICIPA do evento (vê o privado): quem criou, os convidados e os responsáveis da tarefa. */
export const participaDoEvento = (e: Pick<EventoTarefa, "criadoPor" | "convidados">, usuarioId: number, responsaveis: number[] = []) =>
  e.criadoPor === usuarioId || e.convidados.some((c) => c.usuarioId === usuarioId) || responsaveis.includes(usuarioId);

/** O PRIVADO para quem não participa: só "Ocupado" (sem local, descrição, link nem convidados). */
export function mascararPrivados(eventos: EventoTarefa[], usuarioId: number, responsaveisPorTarefa: Map<number, number[]>): EventoTarefa[] {
  return eventos.map((e) =>
    e.privado && !participaDoEvento(e, usuarioId, responsaveisPorTarefa.get(e.tarefaId))
      ? { ...e, titulo: "Ocupado", local: null, descricao: null, linkReuniao: null, convidados: [], lembreteMin: null, criadoPor: null }
      : e,
  );
}

/**
 * O evento como vai ao HISTÓRICO (auditoria): o PRIVADO nunca grava título, local, descrição, link nem convidados — o
 * histórico da tarefa é visto por todo o grupo. `titulo` = o que o resumo pode citar.
 */
export function eventoParaAuditoria<T extends { titulo: string; data: string; privado?: boolean }>(d: T): { titulo: string; dados: Record<string, unknown> } {
  if (!d.privado) return { titulo: d.titulo, dados: d as Record<string, unknown> };
  return { titulo: "evento privado", dados: { titulo: "Evento privado", data: d.data, privado: true } };
}

/**
 * O HISTÓRICO da tarefa SEM o conteúdo dos eventos privados — vale também para as linhas gravadas antes da máscara na
 * gravação: se o diff (antes/depois, ou um evento da tarefa criada) é privado, ele vira "Evento privado" e o título some
 * do resumo.
 */
export function historicoSemPrivados<T extends { resumo: string | null; antes: string | null; depois: string | null }>(linhas: T[]): T[] {
  const ler = (v: string | null): unknown => {
    if (!v) return null;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  };
  const objeto = (o: unknown): o is Record<string, unknown> => !!o && typeof o === "object" && !Array.isArray(o);
  const ehPrivado = (o: unknown) => objeto(o) && o.privado === true;
  const soData = (o: Record<string, unknown>) => ({ titulo: "Evento privado", data: o.data ?? null, privado: true });
  return linhas.map((l) => {
    const a = ler(l.antes);
    const d = ler(l.depois);
    // O EVENTO privado (antes ou depois): os dois lados viram só a data — o título não aparece nem no resumo.
    if (ehPrivado(a) || ehPrivado(d))
      return {
        ...l,
        antes: objeto(a) ? JSON.stringify(soData(a)) : l.antes,
        depois: objeto(d) ? JSON.stringify(soData(d)) : l.depois,
        resumo: l.resumo ? l.resumo.replace(/evento "[^"]*"/, 'evento "evento privado"') : l.resumo,
      };
    // A TAREFA criada com eventos: só os privados são mascarados.
    if (objeto(d) && Array.isArray(d.eventos) && d.eventos.some(ehPrivado))
      return { ...l, depois: JSON.stringify({ ...d, eventos: d.eventos.map((e) => (ehPrivado(e) ? soData(e as Record<string, unknown>) : e)) }) };
    return l;
  });
}

/** De onde vem o evento do calendário: o PERÍODO da tarefa (início → prazo), uma OCORRÊNCIA futura da recorrência, um
 * EVENTO cadastrado ou a PREVISÃO DE ENTREGA de um DFD do PCA (o cronograma de contratações). */
export const TIPOS_EVENTO = ["periodo", "recorrencia", "evento", "pca", "externo"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];
/** Os tipos que se ocultam na seção "Tipos" (o PCA e as agendas externas têm a própria seção). */
export const TIPOS_COM_CONTROLE = ["periodo", "recorrencia", "evento"] as const satisfies readonly TipoEvento[];
export const ROTULO_TIPO_EVENTO: Record<TipoEvento, string> = { periodo: "Período da tarefa", recorrencia: "Recorrência", evento: "Eventos", pca: "Previsão do PCA", externo: "Agendas externas" };

/** O DFD de um evento de PREVISÃO do PCA (o banner mostra; `anual` = previsão ANUAL, repetida em todo mês). */
export type EventoPca = {
  pcaId: number;
  pcaNome: string;
  dfdId: number;
  numero: string;
  planejamento: string | null;
  objeto: string | null;
  sigla: string | null;
  valor: number;
  anual: boolean;
};

/** Um evento como o CALENDÁRIO desenha (a mesma forma para os três tipos). `chave` é única na tela. */
export type EventoCalendario = {
  chave: string;
  tipo: TipoEvento;
  tarefaId: number;
  quadroId: number;
  ticket: number;
  titulo: string;
  /** O título e o prazo da TAREFA de origem (o banner do evento). */
  tarefaTitulo: string;
  tarefaPrazo: string | null;
  /** Datas "AAAA-MM-DD" (o período pode durar vários dias; os demais começam e terminam no mesmo dia). */
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  local: string | null;
  descricao: string | null;
  /** A cor do evento (a própria, se cadastrada); `null` = a do quadro. */
  cor: string | null;
  concluida: boolean;
  recorrente: boolean;
  /** Do evento cadastrado. */
  eventoId: number | null;
  /** Minutos do lembrete (evento cadastrado); `null` = sem lembrete. */
  lembreteMin: number | null;
  /** Ocorrência PREVISTA da recorrência que conta da CONCLUSÃO (a data real depende de quando for concluída). */
  prevista: boolean;
  /** O DFD (tipo `pca`); nos demais, `null`. */
  pca: EventoPca | null;
  /** De uma AGENDA EXTERNA (.ics assinado — somente leitura). */
  externo?: { agendaId: number; agendaNome: string } | null;
  /** Do evento cadastrado (os demais: livre/sem convidados). */
  linkReuniao?: string | null;
  ocupado?: boolean;
  privado?: boolean;
  criadoPor?: number | null;
  convidados?: ConvidadoEvento[];
  /** A regra, quando o evento cadastrado se repete (o banner diz qual). */
  repeticao?: RecorrenciaEvento | null;
};

export const horaValida = (h: string | null | undefined): h is string => !!h && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
/** "HH:MM" → minutos do dia. */
export const minutosDe = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
/** Minutos do dia → "HH:MM" (preso entre 00:00 e 23:59). */
export const horaDeMinutos = (m: number) => {
  const v = Math.max(0, Math.min(23 * 60 + 59, Math.round(m)));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

/**
 * As próximas OCORRÊNCIAS de uma tarefa recorrente (depois do prazo atual) que caem entre `de` e `ate` — só a regra que
 * conta do PRAZO tem agenda fixa (a que conta da conclusão é PREVISTA à parte — `ocorrenciaPrevista`). Teto de 60.
 */
export function ocorrenciasNoIntervalo(r: Recorrencia, prazo: string | null, de: string, ate: string, max = 60): string[] {
  if (r.base !== "prazo" || !dataValida(prazo)) return [];
  const diaAlvo = Number(prazo.slice(8, 10));
  const out: string[] = [];
  let d = saltar(r, prazo, diaAlvo, de);
  for (let i = 0; i < 5000 && out.length < max; i++) {
    d = passo(r, d, diaAlvo);
    if (d > ate) break;
    if (d >= de) out.push(d);
  }
  return out;
}

/**
 * Os EVENTOS do calendário entre `de` e `ate`: o PERÍODO de cada tarefa com prazo (início → prazo; sem início, só o
 * prazo), as OCORRÊNCIAS futuras das recorrentes ainda abertas e os EVENTOS cadastrados. Ordem: data, dia inteiro antes,
 * hora, ticket.
 */
/**
 * A próxima ocorrência PREVISTA da recorrência que conta da CONCLUSÃO: a data que ela teria se a tarefa (aberta) fosse
 * concluída HOJE — ou no prazo, se ele ainda não chegou. `null` = outra base, sem regra ou já concluída.
 */
export function ocorrenciaPrevista(t: { inicio: string | null; prazo: string | null; concluidaEm: string | null; recorrencia: Recorrencia | null }, hoje: string): string | null {
  if (t.recorrencia?.base !== "conclusao" || t.concluidaEm != null) return null;
  const conclusao = dataValida(t.prazo) && t.prazo > hoje ? t.prazo : hoje;
  return proximaOcorrencia(t.recorrencia, t, conclusao, hoje).prazo;
}

export function eventosDoCalendario(
  tarefas: (Pick<TarefaResumo, "id" | "ticket" | "titulo" | "inicio" | "prazo" | "concluidaEm" | "recorrencia"> & { quadroId: number; prazoHora?: string | null })[],
  eventos: EventoTarefa[],
  de: string,
  ate: string,
  hoje?: string,
): EventoCalendario[] {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const out: EventoCalendario[] = [];
  const base = (t: (typeof tarefas)[number]) => ({
    tarefaId: t.id,
    quadroId: t.quadroId,
    ticket: t.ticket,
    tarefaTitulo: t.titulo,
    tarefaPrazo: t.prazo,
    concluida: t.concluidaEm != null,
    recorrente: t.recorrencia != null,
    diaInteiro: true,
    horaInicio: null,
    horaFim: null,
    local: null,
    descricao: null,
    cor: null,
    eventoId: null,
    lembreteMin: null,
    prevista: false,
    pca: null,
  });
  for (const t of tarefas) {
    if (t.recorrencia && t.concluidaEm == null && hoje) {
      const d = ocorrenciaPrevista(t, hoje);
      if (d && d >= de && d <= ate) out.push({ ...base(t), chave: `r${t.id}:prev`, tipo: "recorrencia", titulo: t.titulo, inicio: d, fim: d, concluida: false, prevista: true });
    }
    if (!dataValida(t.prazo)) continue;
    const inicio = dataValida(t.inicio) && t.inicio < t.prazo ? t.inicio : t.prazo;
    // O prazo de UM dia com hora vira um horário na grade (o de vários dias segue como faixa).
    const comHora = inicio === t.prazo && horaValida(t.prazoHora) ? { diaInteiro: false, horaInicio: t.prazoHora } : {};
    if (t.prazo >= de && inicio <= ate) out.push({ ...base(t), chave: `p${t.id}`, tipo: "periodo", titulo: t.titulo, inicio, fim: t.prazo, ...comHora });
    // As ocorrências de hoje em diante: uma recorrente atrasada, ao ser concluída, pula as que ficaram para trás
    // (`proximaOcorrencia`) — elas nunca vão existir.
    if (t.recorrencia && t.concluidaEm == null)
      for (const d of ocorrenciasNoIntervalo(t.recorrencia, t.prazo, hoje && hoje > de ? hoje : de, ate))
        out.push({ ...base(t), chave: `r${t.id}:${d}`, tipo: "recorrencia", titulo: t.titulo, inicio: d, fim: d, concluida: false });
  }
  for (const e of eventos) {
    const t = porId.get(e.tarefaId);
    if (!t || !dataValida(e.data)) continue;
    const dur = diasEntre(e.data, fimDoEvento(e));
    const comHora = !e.diaInteiro && horaValida(e.horaInicio);
    for (const inicio of ocorrenciasDoEvento(e, de, ate))
      out.push({
        ...base(t),
        chave: inicio === e.data ? `e${e.id}` : `e${e.id}:${inicio}`,
        tipo: "evento",
        titulo: e.titulo,
        inicio,
        fim: somarDias(inicio, dur),
        lembreteMin: e.lembreteMin,
        recorrente: e.recorrencia != null,
        repeticao: e.recorrencia,
        linkReuniao: e.linkReuniao,
        ocupado: e.ocupado,
        privado: e.privado,
        criadoPor: e.criadoPor,
        convidados: e.convidados,
        diaInteiro: !comHora,
        horaInicio: comHora ? e.horaInicio : null,
        horaFim: comHora && horaValida(e.horaFim) ? e.horaFim : null,
        local: e.local,
        descricao: e.descricao,
        cor: e.cor,
        eventoId: e.id,
      });
  }
  return out.sort(
    (a, b) =>
      (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0) ||
      Number(!a.diaInteiro) - Number(!b.diaInteiro) ||
      (a.horaInicio ?? "").localeCompare(b.horaInicio ?? "") ||
      a.ticket - b.ticket,
  );
}

/** O último dia de um evento cadastrado (a data final válida e posterior; senão, a própria data). */
export const fimDoEvento = (e: Pick<EventoTarefa, "data" | "dataFim">) => (dataValida(e.dataFim) && e.dataFim > e.data ? e.dataFim : e.data);

/** Os eventos que acontecem no DIA (o período cobre o dia). */
export const eventosDoDia = (eventos: EventoCalendario[], dia: string) => eventos.filter((e) => e.inicio <= dia && e.fim >= dia);

/** Duração padrão de um evento com início e sem fim (a caixa na grade de horas). */
export const DURACAO_PADRAO_MIN = 60;

/**
 * A POSIÇÃO dos eventos COM HORA de um dia na grade de horas: `topo`/`altura` em minutos (fim ausente =
 * `DURACAO_PADRAO_MIN`; mínimo 15) e as COLUNAS lado a lado dos que se cruzam (`coluna` de `colunas`, por grupo
 * de sobreposição — como o Google Agenda). Fim antes do início = atravessa a meia-noite (até 24:00).
 */
export function layoutDoDia<T extends { horaInicio: string | null; horaFim: string | null }>(
  eventos: T[],
): { evento: T; topo: number; altura: number; coluna: number; colunas: number }[] {
  const itens = eventos
    .filter((e): e is T & { horaInicio: string } => horaValida(e.horaInicio))
    .map((e) => {
      const topo = minutosDe(e.horaInicio);
      // Fim antes do início = atravessa a meia-noite (vai até o fim do dia); sem fim = a duração padrão.
      const fimMin = !horaValida(e.horaFim) ? topo + DURACAO_PADRAO_MIN : minutosDe(e.horaFim) > topo ? minutosDe(e.horaFim) : 24 * 60;
      return { evento: e as T, topo, fim: Math.min(24 * 60, Math.max(fimMin, topo + 15)) };
    })
    .sort((a, b) => a.topo - b.topo || b.fim - a.fim);
  const out: { evento: T; topo: number; altura: number; coluna: number; colunas: number }[] = [];
  let grupo: { evento: T; topo: number; fim: number; coluna: number }[] = [];
  let fimGrupo = -1;
  const fechar = () => {
    const n = grupo.reduce((m, g) => Math.max(m, g.coluna + 1), 0);
    for (const g of grupo) out.push({ evento: g.evento, topo: g.topo, altura: g.fim - g.topo, coluna: g.coluna, colunas: n });
    grupo = [];
  };
  for (const it of itens) {
    if (it.topo >= fimGrupo) {
      fechar();
      fimGrupo = -1;
    }
    const usadas = new Set(grupo.filter((g) => g.fim > it.topo).map((g) => g.coluna));
    let coluna = 0;
    while (usadas.has(coluna)) coluna++;
    grupo.push({ ...it, coluna });
    fimGrupo = Math.max(fimGrupo, it.fim);
  }
  fechar();
  return out;
}

/** O que fica OCULTO no calendário (preferência da pessoa — `calendario:ocultos`): tarefas, quadros, PCAs, tipos e os
 * feriados. */
export type OcultosCalendario = { tarefas: number[]; quadros: number[]; pcas: number[]; externos: number[]; tipos: TipoEvento[]; feriados: boolean };
export const OCULTOS_VAZIO: OcultosCalendario = { tarefas: [], quadros: [], pcas: [], externos: [], tipos: [], feriados: false };
export const CHAVE_OCULTOS_CALENDARIO = "calendario:ocultos";

/** Lê a preferência gravada — tolerante (qualquer coisa inválida = nada oculto). */
export function lerOcultos(v: unknown): OcultosCalendario {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const ids = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((n): n is number => Number.isInteger(n) && n > 0))].slice(0, 2000) : []);
  return {
    tarefas: ids(o.tarefas),
    quadros: ids(o.quadros),
    pcas: ids(o.pcas),
    externos: ids(o.externos),
    // Só os tipos com controle na tela (um "pca"/"externo" antigo não fica oculto sem como reexibir).
    tipos: Array.isArray(o.tipos) ? TIPOS_COM_CONTROLE.filter((t) => (o.tipos as unknown[]).includes(t)) : [],
    feriados: o.feriados === true,
  };
}

/** Algo oculto? (o "Mostrar todos" da barra). */
export const temOculto = (o: OcultosCalendario) => o.tarefas.length + o.quadros.length + o.pcas.length + o.externos.length + o.tipos.length > 0 || o.feriados;

/** O evento aparece com o que está oculto? (tipo, quadro/tarefa ou — na previsão do PCA — o PCA ocultos escondem). */
export const eventoVisivel = (e: Pick<EventoCalendario, "tarefaId" | "quadroId" | "tipo" | "pca" | "externo">, o: OcultosCalendario) =>
  !o.tipos.includes(e.tipo) &&
  (e.pca ? !o.pcas.includes(e.pca.pcaId) : e.externo ? !o.externos.includes(e.externo.agendaId) : !o.quadros.includes(e.quadroId) && !o.tarefas.includes(e.tarefaId));
