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

const CFG = { ativo: true, ausente: true, invisivel: true, inativoMin: 5 };

describe("presença: configuração e preferência", () => {
  it("padrão desligado; qualquer JSON vira válido; inativo dentro dos limites", () => {
    assert.deepEqual(lerConfigPresenca(undefined), CONFIG_PRESENCA_PADRAO);
    assert.equal(CONFIG_PRESENCA_PADRAO.ativo, false);
    assert.deepEqual(lerConfigPresenca({ ativo: true, ausente: "x", lixo: 1 }), { ativo: true, ausente: true, invisivel: true, inativoMin: 5 });
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
    assert.deepEqual(m, { t: "vendo", alvos: ["protocolo:12", "dfd:5", "tarefa:9", "protocolo:1", "protocolo:2"], editando: ["dfd:5"] });
    assert.deepEqual(lerMensagemAba('{"t":"vendo"}'), { t: "vendo", alvos: [], editando: [] });
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
