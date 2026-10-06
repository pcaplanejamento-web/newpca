import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONFIG_PRESENCA_PADRAO,
  ficaInvisivel,
  limparRecado,
  lerConfigPresenca,
  lerListaMensagem,
  lerMensagemAba,
  lerPrefsPresenca,
  listaPresenca,
  listaVendo,
  lerVendoMensagem,
  opcoesAte,
  ordenarPresenca,
  statusVigente,
  vistoHa,
  vistosRecentes,
} from "../src/lib/presenca-core.ts";
import { configPresencaSchema, prefsPresencaSchema } from "../src/lib/presenca-validation.ts";

const CFG = { ativo: true, ausente: true, invisivel: true, inativoMin: 5, atividade: true };

describe("presença: configuração e preferência", () => {
  it("padrão desligado; qualquer JSON vira válido; inativo dentro dos limites", () => {
    assert.deepEqual(lerConfigPresenca(undefined), CONFIG_PRESENCA_PADRAO);
    assert.equal(CONFIG_PRESENCA_PADRAO.ativo, false);
    assert.deepEqual(lerConfigPresenca({ ativo: true, ausente: "x", lixo: 1 }), { ativo: true, ausente: true, invisivel: true, inativoMin: 5, atividade: true });
    assert.equal(lerConfigPresenca({ inativoMin: 0 }).inativoMin, 0);
    assert.equal(lerConfigPresenca({ inativoMin: 999 }).inativoMin, 5);
    assert.deepEqual(lerConfigPresenca("texto"), CONFIG_PRESENCA_PADRAO);
  });
  it("preferência: invisível + status, tolerante", () => {
    assert.deepEqual(lerPrefsPresenca('{"invisivel":true}'), { invisivel: true, status: "disponivel", recado: "", ate: null });
    const p = lerPrefsPresenca({ status: "reuniao", recado: "  volto\\n às 14h ", ate: "2026-10-06T17:00:00.000Z" });
    assert.equal(p.status, "reuniao");
    assert.equal(p.ate, "2026-10-06T17:00:00.000Z");
    assert.equal(lerPrefsPresenca({ status: "dormindo", ate: "ontem" }).status, "disponivel");
    assert.equal(lerPrefsPresenca({ ate: "ontem" }).ate, null);
    assert.deepEqual(lerPrefsPresenca("{quebrado"), { invisivel: false, status: "disponivel", recado: "", ate: null });
  });
  it("recado limpo: sem controles/invisíveis, uma linha, até 80", () => {
    assert.equal(limparRecado("a\u0007b​ c\n\nd"), "a b c d");
    assert.equal(limparRecado("x".repeat(200)).length, 80);
    assert.equal(limparRecado(5), "");
  });
  it("status vence no 'até'", () => {
    const agora = Date.parse("2026-10-06T15:00:00Z");
    assert.deepEqual(statusVigente({ status: "ocupado", recado: "r", ate: "2026-10-06T14:00:00Z" }, agora), { status: "disponivel", recado: "" });
    assert.deepEqual(statusVigente({ status: "ocupado", recado: "r", ate: "2026-10-06T16:00:00Z" }, agora), { status: "ocupado", recado: "r" });
    assert.deepEqual(statusVigente({ status: "reuniao", recado: "", ate: null }, agora), { status: "reuniao", recado: "" });
  });
  it("invisível só quando o ADM permite", () => {
    assert.equal(ficaInvisivel(CFG, { invisivel: true }), true);
    assert.equal(ficaInvisivel({ ...CFG, invisivel: false }, { invisivel: true }), false);
  });
  it("schemas estritos", () => {
    assert.equal(configPresencaSchema.safeParse(CFG).success, true);
    assert.equal(configPresencaSchema.safeParse({ ...CFG, x: 1 }).success, false);
    assert.equal(configPresencaSchema.safeParse({ ...CFG, inativoMin: 500 }).success, false);
    assert.equal(prefsPresencaSchema.safeParse({ invisivel: "1" }).success, false);
    assert.equal(prefsPresencaSchema.safeParse({}).success, false);
    assert.equal(prefsPresencaSchema.safeParse({ status: "ocupado", recado: "x", ate: null }).success, true);
    assert.equal(prefsPresencaSchema.safeParse({ status: "dormindo" }).success, false);
  });
  it("opções do 'até': sem prazo + 30 min/1 h/2 h (+ 18h quando ainda dá)", () => {
    const manha = Date.parse("2026-10-06T12:00:00Z"); // 9h em Brasília
    const ops = opcoesAte(manha);
    assert.deepEqual(ops.map((o) => o.rotulo), ["Sem prazo", "30 minutos", "1 hora", "2 horas", "Até as 18h"]);
    assert.equal(ops[4].ate, "2026-10-06T21:00:00.000Z");
    assert.equal(opcoesAte(Date.parse("2026-10-06T21:10:00Z")).length, 4);
  });
});

describe("presença: a lista do grupo", () => {
  it("uma pessoa por item, o melhor estado entre as abas, sem invisíveis, status só quando não é Disponível", () => {
    const l = listaPresenca([
      { id: 5, estado: "ausente", invisivel: false },
      { id: 2, estado: "ausente", invisivel: false, status: "reuniao", recado: "até 15h" },
      { id: 5, estado: "online", invisivel: false },
      { id: 9, estado: "online", invisivel: true },
    ]);
    assert.deepEqual(l, [
      [2, "a", "reuniao", "até 15h"],
      [5, "o"],
    ]);
  });
  it("status vencido vira Disponível na lista; sem ausentes quando o ADM não os mostra", () => {
    const agora = Date.parse("2026-10-06T15:00:00Z");
    assert.deepEqual(listaPresenca([{ id: 1, estado: "online", invisivel: false, status: "ocupado", recado: "x", ate: "2026-10-06T14:00:00Z" }], true, agora), [[1, "o"]]);
    assert.deepEqual(
      listaPresenca(
        [
          { id: 1, estado: "ausente", invisivel: false },
          { id: 3, estado: "online", invisivel: false },
        ],
        false,
      ),
      [[3, "o"]],
    );
  });
  it("visto por último: só quem saiu há < 24 h e não está presente", () => {
    const agora = 100 * 3600_000;
    const vistos = new Map([
      [1, agora - 3600_000],
      [2, agora - 25 * 3600_000],
      [3, agora - 60_000],
    ]);
    assert.deepEqual(vistosRecentes(vistos, new Set([3]), agora), [[1, agora - 3600_000]]);
    assert.equal(vistoHa(agora - 30_000, agora), "agora há pouco");
    assert.equal(vistoHa(agora - 5 * 60_000, agora), "há 5 min");
    assert.equal(vistoHa(agora - 3 * 3600_000, agora), "há 3 h");
  });
  it("mensagens da aba: estado (também o formato antigo) e status; o resto é ignorado", () => {
    assert.deepEqual(lerMensagemAba('{"estado":"ausente"}'), { t: "estado", estado: "ausente" });
    assert.deepEqual(lerMensagemAba('{"t":"estado","estado":"online"}'), { t: "estado", estado: "online" });
    assert.deepEqual(lerMensagemAba('{"t":"status","status":"nao-perturbe","recado":"foco","ate":null}'), { t: "status", status: "nao-perturbe", recado: "foco", ate: null });
    assert.equal(lerMensagemAba('{"estado":"dormindo"}'), null);
    assert.equal(lerMensagemAba("ping"), null);
    assert.equal(lerMensagemAba("x".repeat(5000)), null);
  });
  it("mensagem para as abas: estados com status e os vistos", () => {
    const m = lerListaMensagem(JSON.stringify({ t: "presenca", p: [[1, "o"], [2, "a", "reuniao", "15h"], ["x", "o"], [3, "z"]], v: [[7, 123], ["y", 1]] }));
    assert.ok(m);
    assert.deepEqual([...m.estados], [
      [1, { estado: "online", status: "disponivel", recado: "" }],
      [2, { estado: "ausente", status: "reuniao", recado: "15h" }],
    ]);
    assert.deepEqual([...m.vistos], [[7, 123]]);
    assert.equal(lerListaMensagem('{"t":"mudou"}'), null);
  });
  it("tela: você primeiro, depois online e ausente pelo nome; só quem está no diretório", () => {
    const pessoas = [
      { id: 1, nome: "Zeca", apelido: null },
      { id: 2, nome: "Bruna", apelido: null },
      { id: 3, nome: "Ana", apelido: null },
      { id: 4, nome: "Carla", apelido: "Cacá" },
    ];
    const e = (estado: "online" | "ausente") => ({ estado });
    const estados = new Map([
      [1, e("online")],
      [2, e("ausente")],
      [3, e("online")],
      [4, e("online")],
      [99, e("online")],
    ]);
    assert.deepEqual(
      ordenarPresenca(pessoas, estados, 2).map((x) => [x.pessoa.id, x.estado, x.voce]),
      [
        [2, "ausente", true],
        [3, "online", false],
        [4, "online", false],
        [1, "online", false],
      ],
    );
  });
});

describe("presença: vendo agora", () => {
  it("mensagem da aba: só alvos válidos, até 5, editando ⊆ alvos", () => {
    const m = lerMensagemAba(JSON.stringify({ t: "vendo", alvos: ["protocolo:12", "dfd:5", "x:1", "dfd:5", "tarefa:9", "protocolo:1", "protocolo:2", "protocolo:3"], editando: ["dfd:5", "tarefa:99"] }));
    assert.deepEqual(m, { t: "vendo", alvos: ["protocolo:12", "dfd:5", "tarefa:9", "protocolo:1", "protocolo:2"], editando: ["dfd:5"], rotulos: ["Protocolo #12", "DFD #5", "Tarefa #9", "Protocolo #1", "Protocolo #2"] });
    assert.deepEqual(lerMensagemAba('{"t":"vendo"}'), { t: "vendo", alvos: [], editando: [], rotulos: [] });
  });
  it("lista: por alvo, uma vez por pessoa (editando vence), sem invisíveis, estável", () => {
    const l = listaVendo([
      { id: 2, invisivel: false, vendo: ["dfd:5", "protocolo:12"], editando: [] },
      { id: 1, invisivel: false, vendo: ["protocolo:12"], editando: ["protocolo:12"] },
      { id: 2, invisivel: false, vendo: ["protocolo:12"], editando: ["protocolo:12"] },
      { id: 9, invisivel: true, vendo: ["protocolo:12"], editando: [] },
    ]);
    assert.deepEqual(l, [
      ["dfd:5", [[2, 0]]],
      [
        "protocolo:12",
        [
          [1, 1],
          [2, 1],
        ],
      ],
    ]);
    const v = lerVendoMensagem({ t: "vendo", m: l });
    assert.deepEqual(v?.get("protocolo:12"), [
      { id: 1, editando: true },
      { id: 2, editando: true },
    ]);
    assert.equal(lerVendoMensagem({ t: "presenca" }), null);
  });
});

describe("presença — onde e atividade", () => {
  it("onde: a tela pela rota + o nome que a página dá", async () => {
    const { ondeDaRota } = await import("../src/lib/presenca-core.ts");
    assert.deepEqual(ondeDaRota("/painel/mesa"), { tela: "dfd", rotulo: "Mesa" });
    assert.deepEqual(ondeDaRota("/painel/mesa", "pca=3", "PCA 2027"), { tela: "dfd", rotulo: "Mesa · PCA 2027" });
    assert.deepEqual(ondeDaRota("/painel/pca/4", "aba=orcamento", "PCA 2027"), { tela: "pca", rotulo: "PCA · PCA 2027 · Orçamento" });
    assert.deepEqual(ondeDaRota("/painel/tarefas/9", "aba=quadro", "Compras"), { tela: "tarefas", rotulo: "Tarefas · Compras · Quadro" });
    assert.deepEqual(ondeDaRota("/painel/tarefas/9"), { tela: "tarefas", rotulo: "Tarefas · Quadro" });
    assert.deepEqual(ondeDaRota("/painel/calendario/"), { tela: "calendario", rotulo: "Calendário" });
    assert.deepEqual(ondeDaRota("/painel/configuracoes", "aba=presenca"), { tela: "admin", rotulo: "Configurações" });
    assert.deepEqual(ondeDaRota("/painel/perfil"), { tela: "perfil", rotulo: "Perfil" });
    assert.equal(ondeDaRota("/", "").tela, "outra");
    assert.equal(ondeDaRota("/painel/tarefas/1", "", "x".repeat(200)).rotulo.length, 80);
  });

  it("onde e vendo com rótulos: mensagens da aba", async () => {
    const { lerMensagemAba } = await import("../src/lib/presenca-core.ts");
    assert.deepEqual(lerMensagemAba(JSON.stringify({ t: "onde", tela: "tarefas", rotulo: " Tarefas\u0000 · Compras " })), { t: "onde", tela: "tarefas", rotulo: "Tarefas · Compras" });
    assert.deepEqual(lerMensagemAba(JSON.stringify({ t: "onde", tela: "dfd" })), { t: "onde", tela: "dfd", rotulo: "Mesa" });
    assert.equal(lerMensagemAba(JSON.stringify({ t: "onde", tela: "hack", rotulo: "x" })), null);
    const v = lerMensagemAba(JSON.stringify({ t: "vendo", alvos: ["protocolo:1", "x", "dfd:2"], editando: ["dfd:2"], rotulos: ["Protocolo 144/2026", "?", ""] }));
    assert.deepEqual(v, { t: "vendo", alvos: ["protocolo:1", "dfd:2"], editando: ["dfd:2"], rotulos: ["Protocolo 144/2026", "DFD #2"] });
  });

  it("atividade: a aba mais recente de cada pessoa, sem invisíveis, e a leitura na tela", async () => {
    const { listaAtividade, lerAtividade, textoAtividade, lerConfigPresenca } = await import("../src/lib/presenca-core.ts");
    const a = listaAtividade([
      { id: 2, invisivel: false, onde: { tela: "dfd", rotulo: "Mesa" }, vendo: ["protocolo:5"], rotulos: ["Protocolo 144/2026"], editando: ["protocolo:5"], mexeu: 10 },
      { id: 2, invisivel: false, onde: { tela: "tarefas", rotulo: "Tarefas · Compras" }, mexeu: 5 },
      { id: 3, invisivel: true, onde: { tela: "dfd", rotulo: "Mesa" }, mexeu: 20 },
      { id: 1, invisivel: false, mexeu: 30 },
    ]);
    assert.deepEqual(a, [[2, "dfd", "Mesa", ["Protocolo 144/2026"], 1]]);
    const m = lerAtividade({ a: [...a, [9, "hack", "x", [], 0], "lixo"] });
    assert.equal(m?.size, 1);
    assert.equal(textoAtividade(m?.get(2) as never), "Mesa › Protocolo 144/2026 · editando");
    assert.equal(lerAtividade({ m: [] }), null);
    assert.equal(lerConfigPresenca({}).atividade, true);
    assert.equal(lerConfigPresenca({ atividade: false }).atividade, false);
  });
});

describe("presença — nível profissional (ausente desde, carência, sinal)", () => {
  it("ausente há X: a aba diz há quanto tempo está parada; a lista leva o 'desde'", async () => {
    const { lerMensagemAba, ausentesDesde, lerListaMensagem, rotuloAusente, MAX_PARADO_MS } = await import("../src/lib/presenca-core.ts");
    assert.deepEqual(lerMensagemAba('{"t":"estado","estado":"ausente","ha":300000}'), { t: "estado", estado: "ausente", ha: 300000 });
    assert.deepEqual(lerMensagemAba('{"t":"estado","estado":"ausente","ha":1e12}'), { t: "estado", estado: "ausente", ha: MAX_PARADO_MS });
    assert.deepEqual(lerMensagemAba('{"t":"estado","estado":"online","ha":5}'), { t: "estado", estado: "online" });
    const d = ausentesDesde([
      { id: 1, estado: "ausente", invisivel: false, ausenteDesde: 100 },
      { id: 1, estado: "ausente", invisivel: false, ausenteDesde: 300 },
      { id: 2, estado: "ausente", invisivel: false, ausenteDesde: 50 },
      { id: 2, estado: "online", invisivel: false },
      { id: 3, estado: "ausente", invisivel: true, ausenteDesde: 10 },
    ]);
    assert.deepEqual(d, [[1, 300]]);
    const l = lerListaMensagem(JSON.stringify({ t: "presenca", p: [[1, "a"], [2, "o"]], v: [], d: [[1, 300], [2, 9]] }));
    assert.equal(l?.estados.get(1)?.desde, 300);
    assert.equal(l?.estados.get(2)?.desde, undefined);
    assert.equal(rotuloAusente({ desde: 1_000_000 }, 1_000_000 + 12 * 60_000), "ausente há 12 min");
    assert.equal(rotuloAusente({ desde: 1_000_000 }, 1_000_000 + 3 * 3600_000), "ausente há 3 h");
    assert.equal(rotuloAusente({}), "ausente");
  });
  it("constantes: carência curta, sinal com folga sobre o ping de 45 s", async () => {
    const { CARENCIA_SAIDA_MS, SEM_SINAL_MS, VARREDURA_MS } = await import("../src/lib/presenca-core.ts");
    assert.ok(CARENCIA_SAIDA_MS >= 5_000 && CARENCIA_SAIDA_MS <= 30_000);
    assert.ok(SEM_SINAL_MS >= 3 * 45_000);
    assert.ok(VARREDURA_MS < SEM_SINAL_MS);
  });
});
