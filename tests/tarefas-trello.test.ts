import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lembreteDaTarefa } from "../src/lib/calendario-core.ts";
import {
  automacoesDoEvento,
  conclusaoAoMover,
  estadoPrazo,
  eventosDoCalendario,
  filtrarTarefas,
  FILTRO_TAREFAS_PADRAO,
  listaDeTemplates,
  mapearEtiquetas,
  mapearPorNome,
  notificacaoDePrazoItem,
  rotuloData,
  type Automacao,
} from "../src/lib/tarefas-core.ts";
import { checklistSchema, copiarTarefaSchema, criarTarefaSchema, editarChecklistSchema, editarTarefaSchema, modeloSchema } from "../src/lib/tarefas-validation.ts";

// As funcionalidades do padrão Trello (FASE 11+): concluir no lugar, prazo com hora e lembrete.
describe("tarefas — padrão Trello", () => {
  it("F1 prazo com HORA: o de hoje que passou da hora é atrasada; sem hora, vale o dia inteiro", () => {
    assert.equal(estadoPrazo("2026-03-21", "2026-03-21", false, "09:21", "09:20"), "hoje");
    assert.equal(estadoPrazo("2026-03-21", "2026-03-21", false, "09:21", "09:22"), "atrasada");
    assert.equal(estadoPrazo("2026-03-21", "2026-03-21", false, null, "23:59"), "hoje");
    assert.equal(estadoPrazo("2026-03-21", "2026-03-21", true, "09:21", "10:00"), "concluida");
    assert.equal(rotuloData("2026-03-21", "2026-01-01", "09:21"), "21/03 09:21");
    assert.equal(rotuloData("2026-03-21", "2026-01-01"), "21/03");
  });

  it("F1 concluir NO LUGAR: só a lista de concluídas conclui/reabre ao mover; entre listas comuns a conclusão fica", () => {
    const agora = "2026-03-21T12:00:00Z";
    assert.equal(conclusaoAoMover(null, false, true, agora), agora);
    assert.equal(conclusaoAoMover("2026-03-01", false, true, agora), "2026-03-01");
    assert.equal(conclusaoAoMover("2026-03-01", true, false, agora), null);
    assert.equal(conclusaoAoMover("2026-03-01", false, false, agora), "2026-03-01");
    assert.equal(conclusaoAoMover(null, false, false, agora), null);
  });

  it("F1 concluir no lugar dispara SÓ as regras 'ao concluir' (nenhuma de entrar na lista)", () => {
    const regras: Automacao[] = [
      { id: 1, gatilho: "entrar_lista", listaId: 5, acao: { tipo: "prioridade", prioridade: "alta" }, ativa: true },
      { id: 2, gatilho: "concluir", listaId: null, acao: { tipo: "notificar" }, ativa: true },
    ];
    assert.deepEqual(automacoesDoEvento(regras, { listaId: null, concluida: true }), [{ tipo: "notificar" }]);
    assert.equal(automacoesDoEvento(regras, { listaId: 5, concluida: false }).length, 1);
  });

  it("F1 lembrete do PRAZO da tarefa: devido do aviso até o fim do dia; dia inteiro às 08:00", () => {
    const t = { id: 7, quadroId: 3, ticket: 12, titulo: "Conferir", prazo: "2026-03-21", prazoHora: "09:21", lembreteMin: 60 };
    assert.equal(lembreteDaTarefa(t, "2026-03-21T08:00", "2026-03-21"), null);
    const n = lembreteDaTarefa(t, "2026-03-21T08:30", "2026-03-21");
    assert.ok(n);
    assert.equal(n.link, "/painel/tarefas/3?tarefa=7");
    assert.match(n.titulo, /às 09:21/);
    assert.equal(lembreteDaTarefa({ ...t, prazoHora: null, lembreteMin: 1440 }, "2026-03-20T08:00", "2026-03-20")?.chave, "lembrete-tarefa:7:2026-03-21T08:00:1440");
    assert.equal(lembreteDaTarefa({ ...t, lembreteMin: null }, "2026-03-21T09:00", "2026-03-21"), null);
    assert.equal(lembreteDaTarefa(t, "2026-03-22T00:01", "2026-03-22"), null);
  });

  it("F1 calendário: o prazo de UM dia com hora vira horário na grade; o de vários dias segue faixa", () => {
    const base = { ticket: 1, titulo: "T", concluidaEm: null, recorrencia: null, quadroId: 1 };
    const [um] = eventosDoCalendario([{ ...base, id: 1, inicio: null, prazo: "2026-03-21", prazoHora: "09:21" }], [], "2026-03-01", "2026-03-31");
    assert.deepEqual([um.diaInteiro, um.horaInicio], [false, "09:21"]);
    const [varios] = eventosDoCalendario([{ ...base, id: 2, inicio: "2026-03-19", prazo: "2026-03-21", prazoHora: "09:21" }], [], "2026-03-01", "2026-03-31");
    assert.equal(varios.diaInteiro, true);
  });

  it("F1 schema: concluir no lugar, hora e lembrete", () => {
    assert.ok(editarTarefaSchema.safeParse({ concluida: true, prazoHora: "09:21", lembreteMin: 60 }).success);
    assert.ok(!editarTarefaSchema.safeParse({ prazoHora: "25:00" }).success);
    assert.ok(!editarTarefaSchema.safeParse({ lembreteMin: 99999 }).success);
  });

  it("F2 aviso de prazo do ITEM (para o responsável): vence amanhã / atrasado, chave própria", () => {
    const i = { itemId: 5, texto: "Biometria", prazo: "2026-03-22", tarefaId: 7, ticket: 12, titulo: "Cadastro", quadroId: 3 };
    assert.equal(notificacaoDePrazoItem(i, "2026-03-21")?.chave, "vence-item:5:2026-03-22");
    assert.equal(notificacaoDePrazoItem(i, "2026-03-25")?.tipo, "atrasada");
    assert.equal(notificacaoDePrazoItem(i, "2026-03-10"), null);
    assert.equal(notificacaoDePrazoItem({ ...i, prazo: null }, "2026-03-21"), null);
  });

  it("F2 schemas: item no checklist dado, prazo/responsável do item, checklists nomeados na tarefa nova", () => {
    assert.ok(checklistSchema.safeParse({ texto: "x", checklistId: 3 }).success);
    assert.ok(editarChecklistSchema.safeParse({ prazo: "2026-03-22", responsavelId: 9 }).success);
    assert.ok(editarChecklistSchema.safeParse({ responsavelId: null }).success);
    assert.ok(!editarChecklistSchema.safeParse({}).success);
    assert.ok(criarTarefaSchema.safeParse({ quadroId: 1, listaId: 1, titulo: "T", checklists: [{ nome: "SERVIDORES", itens: ["a"] }] }).success);
    assert.ok(!criarTarefaSchema.safeParse({ quadroId: 1, listaId: 1, titulo: "T", checklists: [{ nome: "", itens: [] }] }).success);
  });

  it("F3 copiar entre quadros: etiquetas pelo NOME (sem caixa/acento; as que faltam são criadas, sem repetir); equipes de mesmo nome", () => {
    const origem = [
      { id: 1, nome: "Urgência", cor: "#f00" },
      { id: 2, nome: "E-mail", cor: "#0f0" },
      { id: 3, nome: " e-mail ", cor: "#00f" },
    ];
    const destino = [{ id: 10, nome: "URGENCIA", cor: "#111" }];
    assert.deepEqual(mapearEtiquetas(origem, destino), { ids: [10], criar: [{ nome: "E-mail", cor: "#0f0" }] });
    assert.deepEqual(mapearEtiquetas([], destino), { ids: [], criar: [] });
    assert.deepEqual(mapearPorNome([{ nome: "Compras" }, { nome: "Jurídico" }], [{ id: 7, nome: "compras" }]), [7]);
  });

  it("F3 TEMPLATES: nascem na lista 'Templates' (se houver); ficam fora das contagens e dos filtros ativos", () => {
    assert.equal(
      listaDeTemplates(
        [
          { id: 1, nome: "A fazer", arquivada: false },
          { id: 2, nome: "TEMPLATES", arquivada: false },
        ],
        1,
      ),
      2,
    );
    assert.equal(listaDeTemplates([{ id: 2, nome: "Templates", arquivada: true }], 1), 1);
    const base = { envolvidos: [], prioridade: "media" as const, etiquetas: [], prazo: null, concluidaEm: null, titulo: "Protocolo", ticket: 1 };
    const ts = [{ ...base, template: true }, { ...base, ticket: 2 }];
    const ctx = { usuarioId: 1, hoje: "2026-03-21" };
    assert.equal(filtrarTarefas(ts, FILTRO_TAREFAS_PADRAO, ctx).length, 2);
    assert.deepEqual(filtrarTarefas(ts, { ...FILTRO_TAREFAS_PADRAO, busca: "protocolo" }, ctx).map((t) => t.ticket), [2]);
  });

  it("F3 schemas: copiar leva tudo por padrão; o modelo agora é só de QUADRO", () => {
    const c = copiarTarefaSchema.parse({ quadroId: 1, listaId: 2 });
    assert.deepEqual([c.checklists, c.etiquetas, c.pessoas, c.datas], [true, true, true, true]);
    assert.equal(copiarTarefaSchema.safeParse({ quadroId: 1, listaId: 2, titulo: "x".repeat(201) }).success, false);
    assert.equal(modeloSchema.safeParse({ tipo: "tarefa", nome: "M", tarefaId: 1 }).success, false);
    assert.equal(modeloSchema.safeParse({ tipo: "quadro", nome: "M", quadroId: 1 }).success, true);
  });
});
