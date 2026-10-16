import type { BlocoDoc } from "./documento-pdf-core.ts";
import {
  type CampoTarefa,
  lerBlocos,
  numerosMesa,
  ROTULO_PRIORIDADE,
  rotuloDoVinculo,
  rotuloRecorrencia,
  rotuloTicket,
  rotuloValorCampo,
  siglasDaTarefa,
  type TarefaResumo,
} from "./tarefas-core.ts";
import { textoPlano } from "./texto-formatado.ts";

/** O CONTEÚDO de uma tarefa (o `GET /api/tarefas/[id]`) — o que o PDF da lista detalha. */
export type ConteudoPdfTarefa = {
  descricao?: string | null;
  blocos?: unknown;
  checklists: { id: number; nome: string }[];
  checklist: { checklistId: number; texto: string; feito: boolean; prazo: string | null; responsavelId: number | null }[];
  comentarios: { usuarioNome: string; texto: string; criadoEm: string | null }[];
  eventos: { titulo: string; data: string; dataFim: string | null; horaInicio: string | null; horaFim: string | null; local?: string | null }[];
};

const dataBR = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const dataHoraBR = (d: string | null | undefined) => (d ? `${dataBR(d)}${d.length >= 16 ? ` ${d.slice(11, 16)}` : ""}` : "");

/**
 * Os BLOCOS do PDF de uma lista com TODO o conteúdo de cada tarefa: os dados (membros, unidade, Mesa, datas, prioridade,
 * etiquetas, campos), a descrição, as notas, os links, os checklists com os itens, os eventos e os comentários. Puro.
 */
export function blocosPdfTarefas(
  tarefas: readonly TarefaResumo[],
  conteudos: ReadonlyMap<number, ConteudoPdfTarefa | null>,
  nomes: { pessoa: (id: number) => string; etiqueta: (id: number) => string; equipe?: (id: number) => string; campos?: readonly CampoTarefa[] },
): BlocoDoc[] {
  const out: BlocoDoc[] = [];
  for (const t of tarefas) {
    const c = conteudos.get(t.id) ?? null;
    out.push({ tipo: "secao", texto: `${rotuloTicket(t.ticket)} ${t.titulo}` });
    const dados: string[] = [];
    const add = (rot: string, v: string) => v && dados.push(`${rot}: ${v}`);
    add("Situação", t.concluidaEm ? `Concluída em ${dataBR(t.concluidaEm)}` : t.arquivada ? "Arquivada" : "Aberta");
    add("Responsáveis", t.pessoas.map(nomes.pessoa).join(", "));
    if (nomes.equipe) add("Equipes", t.equipes.map(nomes.equipe).join(", "));
    add("Observadores", t.observadores.map(nomes.pessoa).join(", "));
    add("Unidade", siglasDaTarefa(t).join(", "));
    add("Protocolo · DFD · Item", numerosMesa(t.vinculos).map((n) => n.texto).join(", "));
    const outros = t.vinculos.filter((v) => v.tipo !== "protocolo" && v.tipo !== "dfd" && v.tipo !== "item");
    add("Outros vínculos", outros.map(rotuloDoVinculo).join(", "));
    add("Início", dataBR(t.inicio));
    add("Prazo", `${dataBR(t.prazo)}${t.prazoHora ? ` ${t.prazoHora}` : ""}`);
    add("Prioridade", ROTULO_PRIORIDADE[t.prioridade]);
    add("Etiquetas", t.etiquetas.map(nomes.etiqueta).join(", "));
    if (t.estimativaH != null) add("Estimativa", `${t.estimativaH} h`);
    if (t.recorrencia) add("Recorrência", rotuloRecorrencia(t.recorrencia));
    for (const cp of nomes.campos ?? []) add(cp.nome, rotuloValorCampo(cp, t.campos?.[cp.id]));
    add("Criada em", dataBR(t.criadoEm));
    out.push({ tipo: "lista", itens: dados });
    if (!c) {
      out.push({ tipo: "paragrafo", texto: "Conteúdo não carregado.", cor: "muted" });
      continue;
    }
    const desc = textoPlano(c.descricao).trim();
    if (desc) out.push({ tipo: "subsecao", texto: "Descrição" }, { tipo: "paragrafo", texto: desc });
    const blocos = lerBlocos(c.blocos) ?? [];
    for (const b of blocos)
      if (b.tipo === "nota" && b.texto.trim()) out.push({ tipo: "subsecao", texto: "Nota" }, { tipo: "paragrafo", texto: textoPlano(b.texto).trim() });
    const links = blocos.flatMap((b) => (b.tipo === "link" && b.url.trim() ? [`${b.titulo ? `${b.titulo} — ` : ""}${b.url}`] : []));
    if (links.length) out.push({ tipo: "subsecao", texto: "Links" }, { tipo: "lista", itens: links });
    for (const cl of c.checklists) {
      const itens = c.checklist.filter((i) => i.checklistId === cl.id);
      out.push({ tipo: "subsecao", texto: cl.nome || "Checklist", detalhe: `${itens.filter((i) => i.feito).length}/${itens.length}` });
      if (itens.length)
        out.push({
          tipo: "lista",
          itens: itens.map(
            (i) => `[${i.feito ? "x" : " "}] ${i.texto}${i.prazo ? ` — prazo ${dataBR(i.prazo)}` : ""}${i.responsavelId != null ? ` — ${nomes.pessoa(i.responsavelId)}` : ""}`,
          ),
        });
    }
    if (c.eventos.length)
      out.push(
        { tipo: "subsecao", texto: "Eventos" },
        {
          tipo: "lista",
          itens: c.eventos.map(
            (e) =>
              `${e.titulo} — ${dataBR(e.data)}${e.dataFim ? ` a ${dataBR(e.dataFim)}` : ""}${e.horaInicio ? ` ${e.horaInicio}${e.horaFim ? `–${e.horaFim}` : ""}` : ""}${e.local ? ` — ${e.local}` : ""}`,
          ),
        },
      );
    if (c.comentarios.length)
      out.push(
        { tipo: "subsecao", texto: "Comentários", detalhe: String(c.comentarios.length) },
        { tipo: "lista", itens: c.comentarios.map((m) => `${m.usuarioNome}${m.criadoEm ? ` (${dataHoraBR(m.criadoEm)})` : ""}: ${textoPlano(m.texto).trim()}`) },
      );
  }
  return out;
}
