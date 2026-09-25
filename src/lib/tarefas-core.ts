/**
 * TAREFAS (quadro estilo Trello) — núcleo PURO (testável): prazo com semáforo, ordem FRACIONÁRIA dos cartões (soltar
 * entre dois sem renumerar a lista), mover um cartão, filtros, WIP e rótulos. Sem banco e sem JSX.
 */
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
  ordem: number;
  concluidaEm: string | null;
  arquivada: boolean;
  /** Responsáveis (ids de usuário). */
  pessoas: number[];
  etiquetas: number[];
  criadoEm: string | null;
  atualizadoEm: string | null;
};

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
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / diaMs);
const dataValida = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

/** O estado do prazo HOJE (`hoje` = "AAAA-MM-DD" no fuso de Brasília). */
export function estadoPrazo(prazo: string | null, hoje: string, concluida: boolean): EstadoPrazo {
  if (concluida) return "concluida";
  if (!dataValida(prazo)) return "sem";
  const d = diasEntre(hoje, prazo);
  if (d < 0) return "atrasada";
  if (d === 0) return "hoje";
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
 * MOVE um cartão (atualização local, otimista): vai para `listaId` na posição `indice` — a ordem sai de `ordemEntre` e
 * entrar numa lista de CONCLUÍDAS marca a conclusão (`agora`); sair dela a desmarca.
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
  const concluida = listas.find((l) => l.id === listaId)?.concluida ?? false;
  return tarefas.map((t) =>
    t.id === id ? { ...t, listaId, ordem, concluidaEm: concluida ? (t.concluidaEm ?? agora) : null } : t,
  );
}

/** A lista passou do limite de cartões (WIP)? */
export const excedeWip = (qtd: number, limite: number | null) => limite != null && limite > 0 && qtd > limite;

export type FiltroPrazo = "todos" | "atrasadas" | "hoje" | "semana" | "sem";
export type FiltroTarefas = {
  /** "todos" · "eu" (as do usuário) · "sem" (sem responsável) · id de uma pessoa. */
  responsavel: "todos" | "eu" | "sem" | number;
  prazo: FiltroPrazo;
  prioridade: "todas" | Prioridade;
  etiqueta: number | null;
  busca: string;
};
export const FILTRO_TAREFAS_PADRAO: FiltroTarefas = { responsavel: "todos", prazo: "todos", prioridade: "todas", etiqueta: null, busca: "" };
export const filtroTarefasAtivo = (f: FiltroTarefas) =>
  f.responsavel !== "todos" || f.prazo !== "todos" || f.prioridade !== "todas" || f.etiqueta != null || f.busca.trim() !== "";

/** Os cartões que passam no filtro (a busca acha título ou nº do ticket — vários termos com ":"). */
export function filtrarTarefas(tarefas: TarefaResumo[], f: FiltroTarefas, ctx: { usuarioId: number | null; hoje: string }): TarefaResumo[] {
  const casa = predicadoBusca(f.busca);
  const fimSemana = somarDias(ctx.hoje, 7);
  return tarefas.filter((t) => {
    if (f.responsavel === "eu" ? ctx.usuarioId == null || !t.pessoas.includes(ctx.usuarioId) : f.responsavel === "sem" ? t.pessoas.length > 0 : f.responsavel !== "todos" && !t.pessoas.includes(f.responsavel))
      return false;
    if (f.prioridade !== "todas" && t.prioridade !== f.prioridade) return false;
    if (f.etiqueta != null && !t.etiquetas.includes(f.etiqueta)) return false;
    if (f.prazo !== "todos") {
      const e = estadoPrazo(t.prazo, ctx.hoje, t.concluidaEm != null);
      if (f.prazo === "sem" && e !== "sem") return false;
      if (f.prazo === "atrasadas" && e !== "atrasada") return false;
      if (f.prazo === "hoje" && e !== "hoje") return false;
      if (f.prazo === "semana" && (t.concluidaEm != null || !dataValida(t.prazo) || t.prazo < ctx.hoje || t.prazo > fimSemana)) return false;
    }
    return !casa || casa([t.titulo, rotuloTicket(t.ticket), String(t.ticket)]);
  });
}

/** Resumo do quadro (cabeçalho): abertas, atrasadas, concluídas (sem as arquivadas). */
export function resumoQuadro(tarefas: TarefaResumo[], hoje: string) {
  let abertas = 0;
  let atrasadas = 0;
  let concluidas = 0;
  for (const t of tarefas) {
    if (t.arquivada) continue;
    if (t.concluidaEm) concluidas++;
    else {
      abertas++;
      if (estadoPrazo(t.prazo, hoje, false) === "atrasada") atrasadas++;
    }
  }
  return { abertas, atrasadas, concluidas };
}

/** A data "AAAA-MM-DD" curta no cartão: "25/09" (o ano só quando difere do de `hoje`). Inválida = "". */
export function rotuloData(d: string | null, hoje: string): string {
  if (!dataValida(d)) return "";
  const [a, m, dia] = d.split("-");
  return a === hoje.slice(0, 4) ? `${dia}/${m}` : `${dia}/${m}/${a}`;
}
