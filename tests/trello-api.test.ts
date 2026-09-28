import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clienteTrello, ErroTrello, queryTrello } from "../src/lib/trello-api.ts";
import { sugerirMembros } from "../src/lib/trello-sync-core.ts";
import { coerceIntegracoes, toView, trelloConfigurado } from "../src/lib/integracoes-core.ts";
import { integracoesSchema } from "../src/lib/integracoes-validation.ts";
import { ligacoesMembrosSchema } from "../src/lib/trello-validation.ts";

type Chamada = { url: string; init?: RequestInit };
const falso = (respostas: Response[]) => {
  const chamadas: Chamada[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    const r = respostas.shift();
    if (!r) throw new Error("sem rede");
    return r;
  };
  return { fetch, chamadas };
};

describe("trello-api — cliente", () => {
  it("fala só com api.trello.com, autentica pelo cabeçalho (nunca na URL) e lê o JSON", async () => {
    const f = falso([new Response(JSON.stringify({ id: "a1", username: "pca", fullName: "PCA RV" }))]);
    const c = clienteTrello({ apiKey: "k1", token: "t1", fetch: f.fetch });
    const eu = await c.eu();
    assert.equal(eu.username, "pca");
    assert.equal(f.chamadas[0].url, "https://api.trello.com/1/members/me?fields=id%2Cusername%2CfullName");
    assert.ok(!f.chamadas[0].url.includes("t1"));
    assert.match(String((f.chamadas[0].init?.headers as Record<string, string> | undefined)?.Authorization), /oauth_consumer_key="k1", oauth_token="t1"/);
  });

  it("recusa caminho estranho (sem SSRF) e usuário inválido", async () => {
    const c = clienteTrello({ apiKey: "k", token: "t", fetch: falso([]).fetch });
    await assert.rejects(c.get("https://evil.com/x"), ErroTrello);
    await assert.rejects(c.get("/boards/../x"), ErroTrello);
    await assert.rejects(c.get("//evil.com"), ErroTrello);
    assert.throws(() => c.membro("a b/c"), ErroTrello);
  });

  it("429 vira erro transitório com a espera; 401 = token recusado; rede = status 0", async () => {
    const c429 = clienteTrello({ apiKey: "k", token: "t", fetch: falso([new Response("x", { status: 429, headers: { "retry-after": "7" } })]).fetch });
    await assert.rejects(c429.eu(), (e: ErroTrello) => e.status === 429 && e.esperarS === 7 && e.transitorio);
    const c401 = clienteTrello({ apiKey: "k", token: "t", fetch: falso([new Response("invalid token", { status: 401 })]).fetch });
    await assert.rejects(c401.eu(), (e: ErroTrello) => e.status === 401 && !e.transitorio && /token/.test(e.message));
    const cRede = clienteTrello({ apiKey: "k", token: "t", fetch: falso([]).fetch });
    await assert.rejects(cRede.eu(), (e: ErroTrello) => e.status === 0 && e.transitorio);
  });

  it("membros das áreas de trabalho sem repetir; query sem nulos", async () => {
    const f = falso([
      new Response(JSON.stringify([{ id: "o1" }, { id: "o2" }])),
      new Response(JSON.stringify([{ id: "m1", username: "ana", fullName: "Ana" }])),
      new Response(JSON.stringify([{ id: "m1", username: "ana", fullName: "Ana" }, { id: "m2", username: "bia", fullName: "Bia" }])),
    ]);
    const ms = await clienteTrello({ apiKey: "k", token: "t", fetch: f.fetch }).membrosDasAreas();
    assert.deepEqual(ms.map((m) => m.id), ["m1", "m2"]);
    assert.equal(queryTrello({ a: 1, b: null, c: undefined, d: false }), "?a=1&d=false");
    assert.equal(queryTrello(), "");
  });
});

describe("trello — membros, configuração e validação", () => {
  const pessoas = [
    { id: 1, nome: "Ana Souza", apelido: "Ana" },
    { id: 2, nome: "Bia Lima", apelido: null },
    { id: 3, nome: "Caio", apelido: null },
  ];
  it("sugere pelo nome/apelido só quando casa com UMA pessoa; ignora as já ligadas e os membros usados", () => {
    const s = sugerirMembros(
      pessoas,
      [
        { id: "m1", username: "ana", fullName: "Ana Souza" },
        { id: "m2", username: "bia", fullName: "Bia Lima" },
        { id: "m3", username: "caio", fullName: "Caio" },
        { id: "m4", username: "caio2", fullName: "Caio" },
      ],
      [{ usuarioId: 2, membroId: "m9" }],
    );
    assert.deepEqual(s, { 1: "m1" });
  });

  it("config do Trello: tolerante, write-only no GET e 'configurado' = ativo + chave + token", () => {
    const i = coerceIntegracoes({ trello: { ativo: true, apiKey: "abc", token: "iv:ct", segredo: "", membroId: "m1", usuario: "pca", nome: "PCA" } });
    assert.equal(trelloConfigurado(i), true);
    const v = toView(i, true);
    assert.equal((v.trello as Record<string, unknown>).token, undefined);
    assert.deepEqual(v.trello, { ativo: true, apiKey: "abc", tokenDefinido: true, segredoDefinido: false, conta: { usuario: "pca", nome: "PCA" } });
    assert.equal(trelloConfigurado(coerceIntegracoes({ trello: { ativo: true, apiKey: "abc" } })), false);
    assert.equal(coerceIntegracoes(undefined).trello?.ativo, false);
  });

  it("schemas: chave só hexadecimal; ligações pelo id (24 hex) ou pelo usuário", () => {
    assert.equal(integracoesSchema.safeParse({ trello: { apiKey: "zz!" } }).success, false);
    assert.equal(integracoesSchema.parse({}).trello.ativo, false);
    assert.equal(ligacoesMembrosSchema.safeParse({ ligacoes: [{ usuarioId: 1, membroId: "5f1c0a2b3c4d5e6f7a8b9c0d" }] }).success, true);
    assert.equal(ligacoesMembrosSchema.safeParse({ ligacoes: [{ usuarioId: 1, usuarioTrello: "@ana_1" }] }).success, true);
    assert.equal(ligacoesMembrosSchema.safeParse({ ligacoes: [{ usuarioId: 1, membroId: "x" }] }).success, false);
    assert.equal(ligacoesMembrosSchema.safeParse({ ligacoes: [] }).success, false);
  });
});
