import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lembreteDaTarefa, listasDoPeriodo, mesSeguinte, nomeListaDoDia } from "../src/lib/calendario-core.ts";
import {
  rotuloDoVinculo,
  vinculosPorTarefa,
  camposDoFormato,
  lerOpcoesCampo,
  mapearCampos,
  montarTitulo,
  rotuloValorCampo,
  valorCampo,
  valoresAposMudar,
  automacoesDoEvento,
  conclusaoAoMover,
  estadoPrazo,
  eventosDoCalendario,
  alternarValor,
  contarFiltros,
  favoritosPrimeiro,
  filtrarTarefas,
  lerFavoritos,
  ordenarCartoes,
  FILTRO_TAREFAS_PADRAO,
  listaDeTemplates,
  mapearEtiquetas,
  mapearPorNome,
  notificacaoDePrazoItem,
  rotuloData,
  type Automacao,
} from "../src/lib/tarefas-core.ts";
import { campoSchema, editarQuadroSchema, checklistSchema, copiarTarefaSchema, criarListaSchema, criarQuadroSchema, ordenarListaSchema, criarTarefaSchema, editarChecklistSchema, editarTarefaSchema, modeloSchema } from "../src/lib/tarefas-validation.ts";

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
    assert.equal(n.link, "/painel/tarefas/abrir/7");
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

  it("F4 QUADRO DO PERÍODO: uma lista por dia; só dias úteis tira fins de semana, feriados e pontos facultativos", () => {
    assert.equal(nomeListaDoDia("2026-10-05"), "05 - OUTUBRO - 2026");
    const todos = listasDoPeriodo(2026, 10, [], false);
    assert.equal(todos.length, 31);
    const uteis = listasDoPeriodo(2026, 10, [], true).map((d) => d.data);
    // Out/2026: 22 dias de semana, menos 12/10 (Aparecida, segunda) e 28/10 (Servidor Público, quarta) = 20.
    assert.equal(uteis.length, 20);
    assert.ok(!uteis.includes("2026-10-12") && !uteis.includes("2026-10-28") && !uteis.includes("2026-10-03"));
    // Feriado do ADM (anual) também sai; fevereiro bissexto tem 29 dias.
    assert.ok(!listasDoPeriodo(2026, 10, [{ id: 1, data: "2020-10-27", nome: "Aniversário", tipo: "municipal", anual: true }], true).some((d) => d.data === "2026-10-27"));
    assert.equal(listasDoPeriodo(2028, 2, [], false).length, 29);
    assert.deepEqual(listasDoPeriodo(2026, 13, [], false), []);
    assert.deepEqual(mesSeguinte("2026-12-10"), { ano: 2027, mes: 1 });
  });

  it("F4 ORDENAR a lista: prazo (sem prazo no fim, a hora desempata), título natural, prioridade; o empate mantém a ordem", () => {
    const t = (id: number, o: Partial<{ prazo: string | null; prazoHora: string | null; titulo: string; prioridade: "baixa" | "media" | "alta" | "urgente"; criadoEm: string }>) => ({
      id,
      ordem: id,
      prazo: null,
      prazoHora: null,
      titulo: "",
      prioridade: "media" as const,
      criadoEm: `2026-01-0${id}`,
      ...o,
    });
    const ts = [t(1, { prazo: null, titulo: "10. Z" }), t(2, { prazo: "2026-03-02", titulo: "2. A", prioridade: "baixa" }), t(3, { prazo: "2026-03-02", prazoHora: "09:00", titulo: "1. B", prioridade: "urgente" })];
    assert.deepEqual(ordenarCartoes(ts, "prazo"), [3, 2, 1]);
    assert.deepEqual(ordenarCartoes(ts, "titulo"), [3, 2, 1]);
    assert.deepEqual(ordenarCartoes(ts, "prioridade"), [3, 1, 2]);
    assert.deepEqual(ordenarCartoes(ts, "criacao"), [1, 2, 3]);
  });

  it("F4 FAVORITOS: leitura tolerante e os favoritos primeiro (a ordem de cada grupo se mantém)", () => {
    assert.deepEqual(lerFavoritos({ ids: [3, 3, -1, "x", 5] }), [3, 5]);
    assert.deepEqual(lerFavoritos(null), []);
    assert.deepEqual(
      favoritosPrimeiro([{ id: 1 }, { id: 2 }, { id: 3 }], [3]).map((q) => q.id),
      [3, 1, 2],
    );
  });

  it("F4 schemas: quadro com período/templates, lista depois de outra, ordenar", () => {
    const q = criarQuadroSchema.parse({ nome: "Outubro", periodo: { ano: 2026, mes: 10 } });
    assert.equal(q.periodo?.diasUteis, true);
    assert.equal(criarQuadroSchema.safeParse({ nome: "X", periodo: { ano: 2026, mes: 13 } }).success, false);
    assert.equal(criarListaSchema.parse({ nome: "L", aposId: 3 }).aposId, 3);
    assert.equal(ordenarListaSchema.safeParse({ por: "prazo" }).success, true);
    assert.equal(ordenarListaSchema.safeParse({ por: "cor" }).success, false);
  });

  it("F5 FILTRO completo: prazo até amanhã/30 dias (só abertas), vários valores = qualquer um, contagem do botão", () => {
    const hoje = "2026-09-25";
    const T = (id: number, o: Partial<{ prazo: string | null; concluidaEm: string | null; etiquetas: number[]; envolvidos: number[] }>) => ({
      id,
      ticket: id,
      titulo: "x",
      prioridade: "media" as const,
      etiquetas: [] as number[],
      envolvidos: [] as number[],
      prazo: null as string | null,
      concluidaEm: null as string | null,
      ...o,
    });
    const ts = [T(1, { prazo: "2026-09-26" }), T(2, { prazo: "2026-10-20" }), T(3, { prazo: "2026-09-26", concluidaEm: "x" }), T(4, { prazo: "2026-11-30" })];
    const f = (x: Partial<typeof FILTRO_TAREFAS_PADRAO>) => filtrarTarefas(ts, { ...FILTRO_TAREFAS_PADRAO, ...x }, { usuarioId: 1, hoje }).map((t) => t.id);
    assert.deepEqual(f({ prazos: ["dia"] }), [1]);
    assert.deepEqual(f({ prazos: ["mes"] }), [1, 2]);
    assert.equal(contarFiltros({ ...FILTRO_TAREFAS_PADRAO, prazos: ["dia", "mes"], status: "abertas" }), 3);
    assert.deepEqual(alternarValor([1, 2], 2), [1]);
    assert.deepEqual(alternarValor([1], 2), [1, 2]);
  });

  it("F7 TÍTULO AUTOMÁTICO: campos trocados pelos valores; campo vazio some com o separador (sem ' - - ')", () => {
    const campos = [
      { id: 1, nome: "Categoria", tipo: "lista" as const },
      { id: 2, nome: "Tipo", tipo: "texto" as const },
      { id: 3, nome: "Nº protocolo", tipo: "texto" as const },
      { id: 4, nome: "Data", tipo: "data" as const },
    ];
    const f = "{Categoria} - {Tipo} - {Nº protocolo}";
    assert.equal(montarTitulo(f, campos, { 1: "2. Protocolo", 2: "FALTA", 3: "144756" }), "2. Protocolo - FALTA - 144756");
    assert.equal(montarTitulo(f, campos, { 1: "2. Protocolo", 3: "144756" }), "2. Protocolo - 144756");
    assert.equal(montarTitulo(f, campos, { 2: "FALTA", 3: "144756" }), "FALTA - 144756");
    assert.equal(montarTitulo(f, campos, { 1: "2. Protocolo" }), "2. Protocolo");
    assert.equal(montarTitulo(f, campos, {}), "");
    // Nome sem acento/caixa; data em dd/mm/aaaa; campo inexistente some.
    assert.equal(montarTitulo("{categoria} | {DATA} | {Nada}", campos, { 1: "A", 4: "2026-10-05" }), "A | 05/10/2026");
    assert.deepEqual(camposDoFormato(f), ["Categoria", "Tipo", "Nº protocolo"]);
    assert.ok(montarTitulo("{Tipo}", campos, { 2: "x".repeat(300) }).length <= 200);
  });

  it("F7 VALOR por tipo: número, data válida, opção da lista, caixa; inválido = null", () => {
    assert.equal(valorCampo({ tipo: "texto", opcoes: [] }, "  oi  "), "oi");
    assert.equal(valorCampo({ tipo: "texto", opcoes: [] }, "   "), null);
    assert.equal(valorCampo({ tipo: "numero", opcoes: [] }, "1.234,5"), "1234.5");
    assert.equal(valorCampo({ tipo: "numero", opcoes: [] }, "12.5"), "12.5");
    assert.equal(valorCampo({ tipo: "numero", opcoes: [] }, "abc"), null);
    assert.equal(valorCampo({ tipo: "data", opcoes: [] }, "2026-02-30"), null);
    assert.equal(valorCampo({ tipo: "data", opcoes: [] }, "2026-02-28"), "2026-02-28");
    assert.equal(valorCampo({ tipo: "lista", opcoes: ["A", "B"] }, "C"), null);
    assert.equal(valorCampo({ tipo: "lista", opcoes: ["A", "B"] }, "B"), "B");
    assert.equal(valorCampo({ tipo: "checkbox", opcoes: [] }, "true"), "1");
    assert.equal(valorCampo({ tipo: "checkbox", opcoes: [] }, "0"), null);
    assert.equal(rotuloValorCampo({ tipo: "checkbox", nome: "Urgente" }, "1"), "Urgente");
    assert.equal(rotuloValorCampo({ tipo: "numero", nome: "N" }, "1234.5"), "1.234,5");
    assert.deepEqual(lerOpcoesCampo('["A"," A ","", 3, "B"]'), ["A", "B"]);
    assert.deepEqual(lerOpcoesCampo("lixo"), []);
    assert.deepEqual(valoresAposMudar({ 1: "a", 2: "b" }, [{ campoId: 1, valor: null }, { campoId: 3, valor: "c" }]), { 2: "b", 3: "c" });
  });

  it("F7 COPIAR/MOVER entre quadros: valores pelo NOME e MESMO tipo; opção que não existe no destino fica de fora", () => {
    const origem = [
      { id: 1, nome: "Categoria", tipo: "lista" as const },
      { id: 2, nome: "Nº", tipo: "texto" as const },
      { id: 3, nome: "Qtd", tipo: "numero" as const },
    ];
    const destino = [
      { id: 10, nome: "categoria", tipo: "lista" as const, opcoes: ["A"] },
      { id: 20, nome: "Nº", tipo: "texto" as const, opcoes: [] },
      { id: 30, nome: "Qtd", tipo: "texto" as const, opcoes: [] },
    ];
    assert.deepEqual(mapearCampos(origem, destino, { 1: "A", 2: "144", 3: "5" }), [
      { campoId: 10, valor: "A" },
      { campoId: 20, valor: "144" },
    ]);
    assert.deepEqual(mapearCampos(origem, destino, { 1: "B" }), []);
  });

  it("F7 SCHEMAS: lista exige opções (sem repetir), nome sem chaves; formato vazio = desligado; valores sem repetir o campo", () => {
    assert.equal(campoSchema.safeParse({ nome: "Tipo", tipo: "lista", opcoes: [] }).success, false);
    assert.deepEqual(campoSchema.parse({ nome: "Tipo", tipo: "lista", opcoes: ["A", "A", "B"] }).opcoes, ["A", "B"]);
    assert.deepEqual(campoSchema.parse({ nome: "Nº", tipo: "texto", opcoes: ["x"] }).opcoes, []);
    assert.equal(campoSchema.safeParse({ nome: "{x}", tipo: "texto" }).success, false);
    assert.equal(editarQuadroSchema.parse({ formatoTitulo: "  " }).formatoTitulo, null);
    assert.equal(editarTarefaSchema.safeParse({ campos: [{ campoId: 1, valor: "a" }, { campoId: 1, valor: null }] }).success, false);
    assert.equal(editarTarefaSchema.safeParse({ campos: [{ campoId: 1, valor: null }], tituloManual: false }).success, true);
  });

  it("F7 FILTRO por campo de lista: valor escolhido ou sem valor (\"\"); conta no botão", () => {
    const base = { ticket: 1, titulo: "x", prioridade: "media" as const, etiquetas: [] as number[], envolvidos: [] as number[], prazo: null, concluidaEm: null };
    const ts = [
      { ...base, id: 1, campos: { 5: "A" } },
      { ...base, id: 2, campos: { 5: "B" } },
      { ...base, id: 3 },
    ];
    const f = (campos: Record<number, string[]>) => filtrarTarefas(ts, { ...FILTRO_TAREFAS_PADRAO, campos }, { usuarioId: 1, hoje: "2026-09-25" }).map((t) => t.id);
    assert.deepEqual(f({ 5: ["A"] }), [1]);
    assert.deepEqual(f({ 5: ["A", ""] }), [1, 3]);
    assert.deepEqual(f({ 5: [] }), [1, 2, 3]);
    assert.equal(contarFiltros({ ...FILTRO_TAREFAS_PADRAO, campos: { 5: ["A", ""] } }), 2);
  });

  it("F8 VÍNCULOS: o vínculo entre tarefas vale nos DOIS lados, sem repetir e sem a própria; tipo inválido sai", () => {
    const m = vinculosPorTarefa([
      { tarefaId: 1, tipo: "tarefa", alvoId: 2 },
      { tarefaId: 2, tipo: "tarefa", alvoId: 1 },
      { tarefaId: 1, tipo: "protocolo", alvoId: 44 },
      { tarefaId: 3, tipo: "tarefa", alvoId: 3 },
      { tarefaId: 3, tipo: "lixo", alvoId: 1 },
    ]);
    assert.deepEqual(m.get(1), [
      { tipo: "tarefa", id: 2 },
      { tipo: "protocolo", id: 44 },
    ]);
    assert.deepEqual(m.get(2), [{ tipo: "tarefa", id: 1 }]);
    assert.equal(m.get(3), undefined);
    assert.equal(rotuloDoVinculo({ tipo: "tarefa", id: 9, rotulo: "#9 Conferir" }), "Tarefa #9 Conferir");
    assert.equal(rotuloDoVinculo({ tipo: "dfd", id: 9, rotulo: null }), "DFD #9 (excluído)");
  });
});
