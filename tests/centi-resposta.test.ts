import assert from "node:assert/strict";
import test from "node:test";
import { lerParametros, marcadoresUsados, montarCorpo, registrosDaResposta, resumoResposta, urlBaseValida, urlDaApi } from "../src/lib/centi-resposta-core.ts";

test("Resposta da Centi: corpo com os marcadores (o valor inteiro vira número; dentro do texto, troca textual)", () => {
  const p = lerParametros('{"ano":"{ano}","idOrgao":"{orgao}","fonte":["{fonte}"],"ini":"01/01/{ano}","x":"{outro}"}');
  assert.ok(p.ok);
  assert.deepEqual(montarCorpo(p.ok && p.valor, { ano: 2026, orgao: 21, fonte: 100 }), { ano: 2026, idOrgao: 21, fonte: [100], ini: "01/01/2026", x: "{outro}" });
  assert.deepEqual(marcadoresUsados(p.ok && p.valor), ["ano", "fonte", "orgao", "outro"]);
});

test("Resposta da Centi: parâmetros tolerantes", () => {
  assert.equal(lerParametros("[1]").ok, false);
  assert.equal(lerParametros("{").ok, false);
});

test("Resposta da Centi: só HTTPS do domínio da Centi", () => {
  assert.equal(urlBaseValida("https://api.centi.com.br/portal"), true);
  for (const u of ["http://api.centi.com.br/portal", "https://api.centi.com.br.evil.com/p", "https://evilcenti.com.br/x", "https://u:s@api.centi.com.br/p", "https://api.centi.com.br:8443/p", "https://api.centi.com.br/p?x=1", "https://127.0.0.1/", "nada"]) {
    assert.equal(urlBaseValida(u), false, u);
  }
  assert.equal(urlDaApi({ urlBase: "https://api.centi.com.br/portal/", endpoint: "getempenhos", uf: "go", tenant: "rioverde" }), "https://api.centi.com.br/portal/getempenhos/go/rioverde");
});

test("Resposta da Centi: o resumo da resposta do teste (lista direta ou dentro de um objeto, total, campos e amostra)", () => {
  const lista = JSON.stringify([
    { Id: 1, Numero: "10", Historico: "x".repeat(400), TotalRegistros: 1530 },
    { Id: 2, Numero: "11", Extra: { a: 1 } },
  ]);
  const r = resumoResposta(lista);
  assert.equal(r.itens, 2);
  assert.equal(r.total, 1530);
  assert.deepEqual(r.campos, ["Id", "Numero", "Historico", "TotalRegistros", "Extra"]);
  assert.equal(r.amostra[0].Historico.length, 160);
  assert.equal(r.amostra[1].Extra, '{"a":1}');
  assert.equal(r.mensagem, null);
  assert.equal(resumoResposta(JSON.stringify({ TotalRegistros: 7, data: [{ a: 1 }] })).total, 7);
  assert.deepEqual(registrosDaResposta({ ok: true, itens: [{ a: 1 }] }), [{ a: 1 }]);
  assert.match(resumoResposta("[]").mensagem ?? "", /sem registros/);
  assert.match(resumoResposta("<html>erro</html>").mensagem ?? "", /não é JSON/);
  assert.match(resumoResposta("").mensagem ?? "", /vazia/);
  assert.match(resumoResposta('{"ok":true}').mensagem ?? "", /lista de registros/);
});

