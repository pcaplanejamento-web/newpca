import { dataBR, dataIsoBrasilia } from "./format.ts";
import { nomeExibicao, type Pessoa } from "./pessoa.ts";
import {
  type EtiquetaTarefa,
  estadoPrazo,
  type ListaTarefas,
  ROTULO_ESTADO_PRAZO,
  ROTULO_PRIORIDADE,
  ROTULO_VINCULO,
  rotuloTicket,
  type TarefaResumo,
} from "./tarefas-core.ts";

/** As LINHAS da planilha de tarefas (cabeçalho + uma por tarefa) — puro, testável. */
export function linhasPlanilhaTarefas(
  tarefas: TarefaResumo[],
  ctx: { listas: ListaTarefas[]; etiquetas: EtiquetaTarefa[]; pessoas: Pessoa[]; hoje: string },
): (string | number)[][] {
  const lista = new Map(ctx.listas.map((l) => [l.id, l.nome]));
  const etq = new Map(ctx.etiquetas.map((e) => [e.id, e.nome]));
  const pes = new Map(ctx.pessoas.map((p) => [p.id, nomeExibicao(p)]));
  const nomes = (ids: number[], m: Map<number, string>) => ids.map((i) => m.get(i) ?? `#${i}`).join(", ");
  return [
    ["Ticket", "Título", "Lista", "Prioridade", "Situação do prazo", "Prazo", "Início", "Estimativa (h)", "Responsáveis", "Observadores", "Etiquetas", "Checklist", "Vínculo", "Criada em", "Concluída em", "Arquivada"],
    ...tarefas.map((t) => [
      rotuloTicket(t.ticket),
      t.titulo,
      lista.get(t.listaId) ?? "",
      ROTULO_PRIORIDADE[t.prioridade],
      ROTULO_ESTADO_PRAZO[estadoPrazo(t.prazo, ctx.hoje, t.concluidaEm != null)],
      t.prazo ? dataBR(t.prazo) : "",
      t.inicio ? dataBR(t.inicio) : "",
      t.estimativaH ?? "",
      nomes(t.pessoas, pes),
      nomes(t.observadores, pes),
      nomes(t.etiquetas, etq),
      t.checklist.total ? `${t.checklist.feitos}/${t.checklist.total}` : "",
      t.vinculo ? `${ROTULO_VINCULO[t.vinculo.tipo]} ${t.vinculo.rotulo ?? `#${t.vinculo.id}`}` : "",
      t.criadoEm ? dataBR(dataIsoBrasilia(t.criadoEm)) : "",
      t.concluidaEm ? dataBR(dataIsoBrasilia(t.concluidaEm)) : "",
      t.arquivada ? "Sim" : "",
    ]),
  ];
}

/** Baixa as tarefas em `.xlsx` (o SheetJS é carregado só no clique). */
export async function exportarTarefasXlsx(nome: string, linhas: (string | number)[][]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tarefas");
  XLSX.writeFile(wb, `${nome.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "tarefas"}.xlsx`);
}
