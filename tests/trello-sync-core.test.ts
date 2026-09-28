import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PALETA_ETIQUETAS } from "../src/lib/tarefas-core.ts";
import {
  corCapaTrello,
  corpoValorCampo,
  lerRetratoCartao,
  corTrelloDeHex,
  dataDoTrello,
  dataParaTrello,
  descricaoComNotas,
  diferencas,
  fundoTrello,
  hexDeCorTrello,
  lerCamposBoard,
  type MapaQuadro,
  reconciliar,
  separarNotas,
  type TarefaParaCartao,
  valoresDaTarefa,
  valoresDoCartao,
} from "../src/lib/trello-sync-core.ts";

const P = PALETA_ETIQUETAS;

describe("trello-sync-core — cores, datas e notas", () => {
  it("etiquetas: a paleta daqui é a do Trello (ida e volta exatas); cor livre = a mais próxima", () => {
    assert.equal(corTrelloDeHex("#4bce97", P), "green");
    assert.equal(corTrelloDeHex("#baf3db", P), "green_light");
    assert.equal(corTrelloDeHex("#0c66e4", P), "blue_dark");
    assert.equal(corTrelloDeHex("#ff0000", P), "red_dark");
    assert.equal(hexDeCorTrello("purple_dark", P), "#6e5dc6");
    assert.equal(hexDeCorTrello("sky", P), "#6cc3e0");
    assert.equal(hexDeCorTrello("inexistente", P), null);
    for (const h of P) assert.equal(hexDeCorTrello(corTrelloDeHex(h, P), P), h);
    assert.equal(corCapaTrello("#1f845a", P), "green");
    assert.equal(corCapaTrello(null, P), null);
    assert.equal(fundoTrello("#6366f1"), "purple");
    assert.equal(fundoTrello("#000000", { cores: ["#0079bf", "#fff"] }), "blue");
  });

  it("datas: Brasília ↔ UTC; sem hora = meio-dia; inválida = null", () => {
    assert.equal(dataParaTrello("2026-10-05", "09:30"), "2026-10-05T12:30:00.000Z");
    assert.equal(dataParaTrello("2026-10-05"), "2026-10-05T15:00:00.000Z");
    assert.equal(dataParaTrello("5/10/2026"), null);
    assert.deepEqual(dataDoTrello("2026-10-05T12:30:00.000Z"), { data: "2026-10-05", hora: "09:30" });
    assert.deepEqual(dataDoTrello("2026-10-06T01:00:00.000Z"), { data: "2026-10-05", hora: "22:00" });
    assert.equal(dataDoTrello("lixo"), null);
  });

  it("descrição + notas: ida e volta; sem notas = só a descrição", () => {
    const d = descricaoComNotas("Texto **forte**\n", ["Nota 1", " ", "Nota 2\ncom linha"]);
    assert.deepEqual(separarNotas(d), { descricao: "Texto **forte**", notas: ["Nota 1", "Nota 2\ncom linha"] });
    assert.equal(descricaoComNotas("abc", []), "abc");
    assert.deepEqual(separarNotas("só descrição"), { descricao: "só descrição", notas: [] });
    assert.equal(lerCamposBoard("lixo").porCampo && Object.keys(lerCamposBoard("lixo").porCampo).length, 0);
  });
});

describe("trello-sync-core — tarefa ↔ cartão e reconciliação", () => {
  const m: MapaQuadro = {
    listas: new Map([[1, "L1"], [2, "L2"]]),
    etiquetas: new Map([[10, "E10"]]),
    membros: new Map([[7, "M7"]]),
    campos: lerCamposBoard({ prioridade: "CP", estimativa: "CE", ticket: "CT", porCampo: { 5: "CF5", 6: "CF6" }, opcoes: { CP: { o1: "Baixa", o2: "Média", o3: "Alta" }, CF6: { x: "Sim" } } }),
  };
  const t: TarefaParaCartao = {
    titulo: "Conferir DFDs",
    descricao: "Passos",
    notas: ["Lembrar"],
    listaId: 1,
    ticket: 12,
    prioridade: "alta",
    inicio: "2026-10-01",
    prazo: "2026-10-05",
    prazoHora: "09:30",
    lembreteMin: 60,
    concluidaEm: null,
    arquivada: false,
    template: false,
    capa: "#4bce97",
    etiquetas: [10, 99],
    pessoas: [7, 8],
    estimativaH: 2.5,
    campos: { 5: "abc", 6: "Sim" },
  };

  it("tarefa → valores: ids ligados, campos (prioridade, estimativa, ticket, personalizados); o que não liga fica fora", () => {
    const v = valoresDaTarefa(t, m, P);
    assert.equal(v.idList, "L1");
    assert.deepEqual(v.idLabels, ["E10"]);
    assert.deepEqual(v.idMembers, ["M7"]);
    assert.equal(v.due, "2026-10-05T12:30:00.000Z");
    assert.equal(v.dueReminder, 60);
    assert.equal(v.cover, "green");
    assert.deepEqual(v.campos, { CE: "2.5", CF5: "abc", CF6: "Sim", CP: "Alta", CT: "#12" });
    assert.match(v.desc, /Notas \(PCA\)/);
  });

  it("cartão → valores: mesmo formato; o cartão igual à tarefa não tem diferenças", () => {
    const v = valoresDaTarefa(t, m, P);
    const c = valoresDoCartao(
      {
        id: "c1",
        name: "Conferir DFDs",
        desc: v.desc,
        idList: "L1",
        start: "2026-10-01T15:00:00.000Z",
        due: "2026-10-05T12:30:00.000Z",
        dueComplete: false,
        dueReminder: 60,
        closed: false,
        isTemplate: false,
        cover: { color: "green" },
        idLabels: ["E10"],
        idMembers: ["M7"],
        customFieldItems: [
          { idCustomField: "CP", idValue: "o3" },
          { idCustomField: "CE", value: { number: "2.5" } },
          { idCustomField: "CT", value: { text: "#12" } },
          { idCustomField: "CF5", value: { text: "abc" } },
          { idCustomField: "CF6", idValue: "x" },
        ],
      },
      m,
    );
    assert.deepEqual(diferencas(v, c), []);
    assert.deepEqual(diferencas({ ...c, name: "Outro" }, c), ["name"]);
    assert.equal(diferencas(c, null).length > 5, true);
  });

  it("reconciliar: só de um lado vai para o outro; nos dois, vence o mais recente e o outro vira descartado", () => {
    const base = valoresDaTarefa(t, m, P);
    const local = { ...base, name: "Novo aqui", dueComplete: true };
    const trello = { ...base, name: "Novo lá", closed: true };
    const r1 = reconciliar(base, local, trello, "2026-10-02T10:00:00Z", "2026-10-02T09:00:00Z");
    assert.deepEqual(r1.paraTrello.sort(), ["dueComplete", "name"]);
    assert.deepEqual(r1.paraLocal, ["closed"]);
    assert.deepEqual(r1.descartados, [{ campo: "name", lado: "trello", valor: "Novo lá" }]);
    assert.equal(r1.retrato.name, "Novo aqui");
    assert.equal(r1.retrato.closed, true);
    const r2 = reconciliar(base, local, trello, "2026-10-02T08:00:00Z", "2026-10-02T09:00:00Z");
    assert.deepEqual(r2.paraLocal.sort(), ["closed", "name"]);
    assert.deepEqual(r2.descartados, [{ campo: "name", lado: "pca", valor: "Novo aqui" }]);
    // Iguais dos dois lados: nada a fazer.
    assert.deepEqual(reconciliar(base, base, base, null, null), { paraTrello: [], paraLocal: [], retrato: base, descartados: [] });
    // Sem retrato (1ª vez): vence o mais recente, sem descartados.
    const r3 = reconciliar(null, local, trello, "2026-10-03T00:00:00Z", "2026-10-02T00:00:00Z");
    assert.equal(r3.descartados.length, 0);
    assert.deepEqual(r3.paraTrello.sort(), ["closed", "dueComplete", "name"]);
  });
});

describe("trello-sync-core — campos e retrato", () => {
  it("valor do campo no formato de cada tipo; vazio limpa", () => {
    assert.deepEqual(corpoValorCampo("list", "Alta", { a: "Baixa", b: "Alta" }), { idValue: "b" });
    assert.deepEqual(corpoValorCampo("list", "Nenhuma", { a: "Baixa" }), { idValue: "" });
    assert.deepEqual(corpoValorCampo("number", "2.5", undefined), { value: { number: "2.5" } });
    assert.deepEqual(corpoValorCampo("date", "2026-10-05", undefined), { value: { date: "2026-10-05T15:00:00.000Z" } });
    assert.deepEqual(corpoValorCampo("checkbox", "1", undefined), { value: { checked: "true" } });
    assert.deepEqual(corpoValorCampo("text", "abc", undefined), { value: { text: "abc" } });
    assert.deepEqual(corpoValorCampo("text", null, undefined), { value: "" });
    assert.deepEqual(corpoValorCampo("list", "", undefined), { idValue: "" });
  });
  it("retrato: lê o gravado; o pendente (sem valores) e o lixo = null", () => {
    assert.equal(lerRetratoCartao('{"pendente":true,"url":"u"}'), null);
    assert.equal(lerRetratoCartao("lixo"), null);
    assert.equal(lerRetratoCartao(null), null);
    assert.equal(lerRetratoCartao('{"v":{"name":"x"},"url":"u","anexos":[]}')?.url, "u");
  });
});

describe("trello-sync-core — a volta (cartão → tarefa)", () => {
  const m: MapaQuadro = {
    listas: new Map([[1, "L1"], [2, "L2"]]),
    etiquetas: new Map([[10, "E10"], [11, "E11"]]),
    membros: new Map([[7, "M7"], [8, "M8"]]),
    campos: lerCamposBoard({ prioridade: "CP", estimativa: "CE", ticket: "CT", porCampo: { 5: "CF5" }, opcoes: { CP: { o1: "Baixa", o3: "Urgente" } } }),
  };
  it("só os campos pedidos; prazo 12:00 = dia inteiro; pessoas/etiquetas sem ligação ficam", async () => {
    const { patchDoCartao } = await import("../src/lib/trello-sync-core.ts");
    const v = {
      name: "  Novo  ",
      desc: `Texto${"\n\n---\n**Notas (PCA)**\n"}\nN1`,
      idList: "L2",
      start: "2026-10-01T15:00:00.000Z",
      due: "2026-10-05T15:00:00.000Z",
      dueComplete: true,
      dueReminder: 30,
      closed: false,
      isTemplate: false,
      cover: "red_dark",
      idLabels: ["E11", "EX"],
      idMembers: ["M8", "MX"],
      campos: { CP: "Urgente", CE: "3", CF5: "x" },
    };
    const todos = ["name", "desc", "idList", "start", "due", "dueComplete", "dueReminder", "cover", "idLabels", "idMembers", "campos"] as const;
    const p = patchDoCartao([...todos], v, m, { pessoas: [7, 99], etiquetas: [10, 50] }, P);
    assert.equal(p.titulo, "Novo");
    assert.deepEqual([p.descricao, p.notas], ["Texto", ["N1"]]);
    assert.equal(p.listaId, 2);
    assert.deepEqual([p.inicio, p.prazo, p.prazoHora], ["2026-10-01", "2026-10-05", null]);
    assert.equal(p.concluida, true);
    assert.equal(p.capa, "#c9372c");
    assert.deepEqual(p.etiquetas, [50, 11]);
    assert.deepEqual(p.pessoas, [99, 8]);
    assert.deepEqual([p.prioridade, p.estimativaH, p.campos], ["urgente", 3, { 5: "x" }]);
    assert.deepEqual(patchDoCartao(["name"], v, m, { pessoas: [], etiquetas: [] }, P), { titulo: "Novo" });
    const hora = patchDoCartao(["due"], { ...v, due: "2026-10-05T12:30:00.000Z" }, m, { pessoas: [], etiquetas: [] }, P);
    assert.equal(hora.prazoHora, "09:30");
  });
});

describe("trello-sync-core — avisos do Trello (webhook)", () => {
  it("assinatura HMAC-SHA1 (corpo + URL); errada/ausente = inválida", async () => {
    const { assinaturaWebhookValida } = await import("../src/lib/trello-sync-core.ts");
    const { createHmac } = await import("node:crypto");
    const corpo = '{"action":{"type":"updateCard"}}';
    const url = "https://governarv.com.br/api/integracoes/trello/webhook/abc";
    const certa = createHmac("sha1", "segredo").update(corpo + url).digest("base64");
    assert.equal(await assinaturaWebhookValida("segredo", corpo, url, certa), true);
    assert.equal(await assinaturaWebhookValida("outro", corpo, url, certa), false);
    assert.equal(await assinaturaWebhookValida("segredo", `${corpo} `, url, certa), false);
    assert.equal(await assinaturaWebhookValida("segredo", corpo, url, null), false);
  });
  it("token: o hash é estável (64 hex) e o token novo é aleatório", async () => {
    const { hashToken, novoToken } = await import("../src/lib/trello-sync-core.ts");
    assert.match(await hashToken("x"), /^[0-9a-f]{64}$/);
    assert.equal(await hashToken("x"), await hashToken("x"));
    assert.notEqual(novoToken(), novoToken());
  });
  it("o que o aviso pede: cartão, lista, etiqueta; eco da conta institucional = nada", async () => {
    const { alvoDoAviso } = await import("../src/lib/trello-sync-core.ts");
    assert.deepEqual(alvoDoAviso({ type: "updateCard", idMemberCreator: "u1", data: { card: { id: "c1" }, list: { id: "l1" } } }, "conta"), { tipo: "tarefa", alvo: "c1" });
    assert.deepEqual(alvoDoAviso({ type: "addLabelToCard", idMemberCreator: "u1", data: { card: { id: "c1" }, label: { id: "e1" } } }, "conta"), { tipo: "tarefa", alvo: "c1" });
    assert.deepEqual(alvoDoAviso({ type: "updateLabel", idMemberCreator: "u1", data: { label: { id: "e1" } } }, "conta"), { tipo: "etiqueta", alvo: "e1" });
    assert.deepEqual(alvoDoAviso({ type: "updateList", idMemberCreator: "u1", data: { list: { id: "l1" } } }, "conta"), { tipo: "lista", alvo: "l1" });
    assert.equal(alvoDoAviso({ type: "updateCard", idMemberCreator: "conta", data: { card: { id: "c1" } } }, "conta"), null);
    assert.equal(alvoDoAviso({ type: "updateBoard", idMemberCreator: "u1", data: {} }, "conta"), null);
    assert.equal(alvoDoAviso(null, "conta"), null);
  });
});
