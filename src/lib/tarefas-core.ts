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
  ordem: number;
  concluidaEm: string | null;
  arquivada: boolean;
  /** Responsáveis (ids de usuário). */
  pessoas: number[];
  /** Observadores (acompanham, sem ser responsáveis). */
  observadores: number[];
  etiquetas: number[];
  criadoEm: string | null;
  atualizadoEm: string | null;
  estimativaH: number | null;
  vinculo: VinculoTarefa | null;
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

/** A que parte do sistema a tarefa se liga. */
export const TIPOS_VINCULO = ["protocolo", "dfd", "pca", "orcamento"] as const;
export type TipoVinculo = (typeof TIPOS_VINCULO)[number];
export const ROTULO_VINCULO: Record<TipoVinculo, string> = { protocolo: "Protocolo", dfd: "DFD", pca: "PCA", orcamento: "Orçamento" };
/** O vínculo (`rotulo` = o nº/nome do alvo, resolvido no servidor; ausente = o alvo foi excluído). */
export type VinculoTarefa = { tipo: TipoVinculo; id: number; rotulo?: string | null };

export const ehTipoVinculo = (v: unknown): v is TipoVinculo => typeof v === "string" && (TIPOS_VINCULO as readonly string[]).includes(v);

/** Para onde o vínculo leva: protocolo/DFD abrem o banner na Mesa (`?abrir=`); PCA e orçamento, o espaço deles. */
export function hrefVinculo(v: { tipo: TipoVinculo; id: number }): string {
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
export const dataValida = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

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

/** O que o filtro olha num cartão (o do quadro e o do calendário de todos os quadros). */
export type TarefaFiltravel = Pick<TarefaResumo, "pessoas" | "prioridade" | "etiquetas" | "prazo" | "concluidaEm" | "titulo" | "ticket">;

/** Os cartões que passam no filtro (a busca acha título ou nº do ticket — vários termos com ":"). */
export function filtrarTarefas<T extends TarefaFiltravel>(tarefas: T[], f: FiltroTarefas, ctx: { usuarioId: number | null; hoje: string }): T[] {
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
export type TarefaCalendario = Pick<TarefaResumo, "id" | "listaId" | "ticket" | "titulo" | "prioridade" | "inicio" | "prazo" | "concluidaEm" | "pessoas" | "etiquetas" | "recorrencia"> & {
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
export const TIPOS_BLOCO = ["nota", "checklist", "link", "prazo", "eventos", "pessoas", "etiquetas", "vinculo", "estimativa", "recorrencia"] as const;
export type TipoBloco = (typeof TIPOS_BLOCO)[number];
export const ROTULO_BLOCO: Record<TipoBloco, string> = {
  nota: "Nota",
  checklist: "Checklist",
  link: "Link",
  prazo: "Prazo",
  eventos: "Eventos",
  pessoas: "Responsáveis",
  etiquetas: "Etiquetas",
  vinculo: "Vínculo",
  estimativa: "Estimativa",
  recorrencia: "Recorrência",
};
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
export type DadosBlocos = {
  inicio: string | null;
  prazo: string | null;
  pessoas: number[];
  observadores: number[];
  etiquetas: number[];
  vinculo: unknown;
  estimativaH: number | null;
  recorrencia: unknown;
  checklist: number;
  eventos: number;
};
export function blocoTemDado(tipo: TipoBloco, d: DadosBlocos): boolean {
  switch (tipo) {
    case "prazo":
      return !!(d.inicio || d.prazo);
    case "pessoas":
      return d.pessoas.length > 0 || d.observadores.length > 0;
    case "etiquetas":
      return d.etiquetas.length > 0;
    case "vinculo":
      return d.vinculo != null;
    case "estimativa":
      return d.estimativaH != null;
    case "recorrencia":
      return d.recorrencia != null;
    case "checklist":
      return d.checklist > 0;
    case "eventos":
      return d.eventos > 0;
    default:
      return false;
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
  for (let i = 0; prazo < hoje && i < 5000; i++) prazo = passo(r, prazo, diaAlvo);
  const duracao = dataValida(atual.inicio) && dataValida(atual.prazo) ? diasEntre(atual.inicio, atual.prazo) : null;
  return { inicio: duracao != null ? somarDias(prazo, -duracao) : null, prazo };
}

// ─── Fase 3: NOTIFICAÇÕES de PRAZO (derivadas na leitura — sem cron) ─────────────────────────────────────────

export const TIPOS_NOTIFICACAO = ["atribuida", "mencionada", "comentario", "vence_amanha", "atrasada", "automacao", "lembrete"] as const;
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];

/** O link que abre a tarefa no quadro. */
export const linkTarefa = (quadroId: number, tarefaId: number) => `/painel/tarefas/${quadroId}?tarefa=${tarefaId}`;

/**
 * A notificação de PRAZO de uma tarefa ABERTA do responsável: "vence amanhã" (prazo = amanhã) ou "atrasada" (prazo já
 * passou — até 30 dias; mais antigo não volta a avisar). A `chave` é por tarefa + prazo: avisa UMA vez por prazo (mudou
 * o prazo, avisa de novo). Fora disso, `null`.
 */
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
const valida = (t: TarefaResumo) => !t.arquivada;

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
        return aberta(t) && (r.id == null ? t.pessoas.length === 0 : t.pessoas.includes(r.id));
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
    if (!t.pessoas.length) semResponsavel++;
    for (const id of t.pessoas.length ? t.pessoas : [null]) {
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
export function automacoesDoEvento(regras: Automacao[], evento: { listaId: number; concluida: boolean }): AcaoAutomacao[] {
  return regras
    .filter((r) => r.ativa && ((r.gatilho === "entrar_lista" && r.listaId === evento.listaId) || (r.gatilho === "concluir" && evento.concluida)))
    .map((r) => r.acao);
}

// ─── Fase 3: MODELOS ─────────────────────────────────────────────────────────────────────────────────────────

export type ModeloQuadro = { cor?: string; descricao?: string | null; listas: { nome: string; limiteWip: number | null; concluida: boolean }[]; etiquetas: { nome: string; cor: string }[] };
export type ModeloTarefa = {
  titulo: string;
  descricao: string | null;
  prioridade: Prioridade;
  etiquetas: number[];
  checklist: string[];
  estimativaH: number | null;
  /** Prazo RELATIVO: dias depois de criar (`null` = sem prazo). */
  prazoDias: number | null;
  recorrencia: Recorrencia | null;
  /** Os blocos da tarefa (notas, links e a ordem) — `null` = modelo antigo. */
  blocos: BlocoTarefa[] | null;
};
export type ModeloResumo = { id: number; tipo: "quadro" | "tarefa"; nome: string; grupoId: number | null; quadroId: number | null; criadoPor: number | null };

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

/** Qualquer JSON → um modelo de TAREFA válido. */
export function coerceModeloTarefa(v: unknown): ModeloTarefa {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = Number(o.prazoDias);
  const est = Number(o.estimativaH);
  return {
    titulo: texto(o.titulo, 200) || "Nova tarefa",
    descricao: texto(o.descricao, 10_000) || null,
    prioridade: (PRIORIDADES as readonly unknown[]).includes(o.prioridade) ? (o.prioridade as Prioridade) : "media",
    etiquetas: Array.isArray(o.etiquetas) ? o.etiquetas.filter((e): e is number => Number.isInteger(e) && e > 0).slice(0, 20) : [],
    checklist: Array.isArray(o.checklist) ? o.checklist.map((c) => texto(c, 300)).filter(Boolean).slice(0, 100) : [],
    estimativaH: o.estimativaH != null && Number.isFinite(est) && est >= 0 && est <= 9999 ? est : null,
    prazoDias: o.prazoDias != null && Number.isInteger(n) && n >= 0 && n <= 3650 ? n : null,
    recorrencia: lerRecorrencia(o.recorrencia),
    blocos: lerBlocos(o.blocos),
  };
}

/** O prazo de uma tarefa criada HOJE por um modelo (prazo relativo). */
export const prazoDoModelo = (m: Pick<ModeloTarefa, "prazoDias">, hoje: string) => (m.prazoDias == null ? null : somarDias(hoje, m.prazoDias));

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
};

/** Os dados de um EVENTO a gravar (sem id nem tarefa). */
export type DadosEvento = Omit<EventoTarefa, "id" | "tarefaId">;

/** De onde vem o evento do calendário: o PERÍODO da tarefa (início → prazo), uma OCORRÊNCIA futura da recorrência, um
 * EVENTO cadastrado ou a PREVISÃO DE ENTREGA de um DFD do PCA (o cronograma de contratações). */
export const TIPOS_EVENTO = ["periodo", "recorrencia", "evento", "pca"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];
export const ROTULO_TIPO_EVENTO: Record<TipoEvento, string> = { periodo: "Período da tarefa", recorrencia: "Recorrência", evento: "Eventos", pca: "Previsão do PCA" };

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
  let d = prazo;
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
  tarefas: (Pick<TarefaResumo, "id" | "ticket" | "titulo" | "inicio" | "prazo" | "concluidaEm" | "recorrencia"> & { quadroId: number })[],
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
    if (t.prazo >= de && inicio <= ate) out.push({ ...base(t), chave: `p${t.id}`, tipo: "periodo", titulo: t.titulo, inicio, fim: t.prazo });
    if (t.recorrencia && t.concluidaEm == null)
      for (const d of ocorrenciasNoIntervalo(t.recorrencia, t.prazo, de, ate))
        out.push({ ...base(t), chave: `r${t.id}:${d}`, tipo: "recorrencia", titulo: t.titulo, inicio: d, fim: d, concluida: false });
  }
  for (const e of eventos) {
    const t = porId.get(e.tarefaId);
    if (!t || !dataValida(e.data)) continue;
    const fim = fimDoEvento(e);
    if (fim < de || e.data > ate) continue;
    const comHora = !e.diaInteiro && horaValida(e.horaInicio);
    out.push({
      ...base(t),
      chave: `e${e.id}`,
      tipo: "evento",
      titulo: e.titulo,
      inicio: e.data,
      fim,
      lembreteMin: e.lembreteMin,
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
 * A POSIÇÃO dos eventos COM HORA de um dia na grade de horas: `topo`/`altura` em minutos (fim ausente ou antes do
 * início = `DURACAO_PADRAO_MIN`; mínimo 15) e as COLUNAS lado a lado dos que se cruzam (`coluna` de `colunas`, por grupo
 * de sobreposição — como o Google Agenda).
 */
export function layoutDoDia<T extends { horaInicio: string | null; horaFim: string | null }>(
  eventos: T[],
): { evento: T; topo: number; altura: number; coluna: number; colunas: number }[] {
  const itens = eventos
    .filter((e): e is T & { horaInicio: string } => horaValida(e.horaInicio))
    .map((e) => {
      const topo = minutosDe(e.horaInicio);
      const fimMin = horaValida(e.horaFim) && minutosDe(e.horaFim) > topo ? minutosDe(e.horaFim) : topo + DURACAO_PADRAO_MIN;
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
export type OcultosCalendario = { tarefas: number[]; quadros: number[]; pcas: number[]; tipos: TipoEvento[]; feriados: boolean };
export const OCULTOS_VAZIO: OcultosCalendario = { tarefas: [], quadros: [], pcas: [], tipos: [], feriados: false };
export const CHAVE_OCULTOS_CALENDARIO = "calendario:ocultos";

/** Lê a preferência gravada — tolerante (qualquer coisa inválida = nada oculto). */
export function lerOcultos(v: unknown): OcultosCalendario {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const ids = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((n): n is number => Number.isInteger(n) && n > 0))].slice(0, 2000) : []);
  return {
    tarefas: ids(o.tarefas),
    quadros: ids(o.quadros),
    pcas: ids(o.pcas),
    tipos: Array.isArray(o.tipos) ? TIPOS_EVENTO.filter((t) => (o.tipos as unknown[]).includes(t)) : [],
    feriados: o.feriados === true,
  };
}

/** Algo oculto? (o "Mostrar todos" da barra). */
export const temOculto = (o: OcultosCalendario) => o.tarefas.length + o.quadros.length + o.pcas.length + o.tipos.length > 0 || o.feriados;

/** O evento aparece com o que está oculto? (tipo, quadro/tarefa ou — na previsão do PCA — o PCA ocultos escondem). */
export const eventoVisivel = (e: Pick<EventoCalendario, "tarefaId" | "quadroId" | "tipo" | "pca">, o: OcultosCalendario) =>
  !o.tipos.includes(e.tipo) && (e.pca ? !o.pcas.includes(e.pca.pcaId) : !o.quadros.includes(e.quadroId) && !o.tarefas.includes(e.tarefaId));
