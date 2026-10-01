import assert from "node:assert/strict";
import { test } from "node:test";
import { CONFIG_CENTI_PADRAO, lerConfigCenti, lerIdsCenti, pedidoEmitirDfd, TRAVAS_CENTI } from "../src/lib/automacao-centi-core.ts";

test("lerIdsCenti: separadores, únicos, sem zeros à esquerda", () => {
  assert.deepEqual(lerIdsCenti("1154:1155, 1154;0160 abc 0").ids, ["1154", "1155", "160"]);
  const muitos = Array.from({ length: 205 }, (_, i) => i + 1).join(":");
  const r = lerIdsCenti(muitos);
  assert.equal(r.ids.length, 200);
  assert.equal(r.excedente, 5);
});

test("lerConfigCenti: inválido volta ao padrão", () => {
  assert.deepEqual(lerConfigCenti(null), CONFIG_CENTI_PADRAO);
  const c = lerConfigCenti({ valorReferencia: false, guid: "x", moduleKey: -1, assinaturaDfd: "a7" });
  assert.equal(c.valorReferencia, false);
  assert.equal(c.guid, CONFIG_CENTI_PADRAO.guid);
  assert.equal(c.moduleKey, CONFIG_CENTI_PADRAO.moduleKey);
  assert.equal(c.assinaturaDfd, "7");
});

test("pedidoEmitirDfd: o Id, as opções e as TRAVAS", () => {
  const p = pedidoEmitirDfd("1154", CONFIG_CENTI_PADRAO, new Date(2026, 9, 1, 11, 57, 45));
  const v = Object.fromEntries(p.Params.map((x) => [x.Key, x.Value]));
  assert.equal(p.ModuleKey, 120464);
  assert.equal(v.IdComprasPlanejamento, "1154");
  assert.equal(v.EmitirValorReferencia, "1");
  assert.equal(v.Data, "01/10/2026");
  assert.equal(v.DataAssinatura, "01/10/2026 11:57:45");
  for (const [k, val] of Object.entries(TRAVAS_CENTI)) assert.equal(v[k], val, k);
  assert.equal(p.Params.length, 44);
});

test("a versão da tela é a do manifest da extensão", async () => {
  const { readFileSync } = await import("node:fs");
  const { VERSAO_EXTENSAO_CENTI } = await import("../src/lib/automacao-centi-core.ts");
  assert.equal(JSON.parse(readFileSync("extensao-centi/manifest.json", "utf8")).version, VERSAO_EXTENSAO_CENTI);
  // O script da página da Centi e a ponte falam o MESMO protocolo.
  const p = (f: string) => readFileSync(`extensao-centi/${f}`, "utf8").match(/const (?:PROTOCOLO|P) = (\d+);/)?.[1];
  assert.equal(p("centi-main.js"), p("centi-ponte.js"));
});

test("analisarRespostaCenti: PDF cru, base64, chave do arquivo, sessão e esqueleto sem token", async () => {
  const { analisarRespostaCenti, caminhosDoArquivo, linkDaResposta, versaoAtende } = await import("../src/lib/automacao-centi-core.ts");
  const enc = (t: string) => new TextEncoder().encode(t);
  assert.equal(analisarRespostaCenti(enc("%PDF-1.7"), 200).tipo, "pdf");
  assert.equal(analisarRespostaCenti(enc(JSON.stringify({ R: { File: "JVBERi0x" } })), 200).tipo, "base64");
  const c = analisarRespostaCenti(
    enc(JSON.stringify({ $type: "OperationReturn", File: { Key: "907ef972-a24f-48b9-be6f-a590c2806dac", FileName: "EmitirDFDPlanejamento.pdf", Mode: 0, URL: null } })),
    200,
  );
  assert.equal(c.tipo, "chave");
  if (c.tipo === "chave") assert.equal(caminhosDoArquivo(c)[0], "restauth/getbinlink/907ef972-a24f-48b9-be6f-a590c2806dac/EmitirDFDPlanejamento.pdf");
  const s = analisarRespostaCenti(enc("{}"), 401);
  assert.equal(s.tipo === "nada" && /sessão/i.test(s.erro), true);
  const n = analisarRespostaCenti(enc(JSON.stringify({ Ok: false, Token: "segredo" })), 200);
  assert.equal(n.tipo === "nada" && !n.amostra?.includes("segredo"), true);
  assert.equal(linkDaResposta(enc('"/contabil/wcf/restauth/bin/1"')), "/contabil/wcf/restauth/bin/1");
  assert.equal(linkDaResposta(enc('{"URL":"https://x/y"}')), "https://x/y");
  assert.equal(versaoAtende("1.1.0"), true);
  assert.equal(versaoAtende("1.0.5"), false);
  assert.equal(versaoAtende("1.2.0"), true);
});

test("pastas e tarefas por protocolo", async () => {
  const { nomePastaProtocolo, nomeSeguro, tarefasDosProtocolos, tarefasDosIds } = await import("../src/lib/automacao-centi-core.ts");
  assert.equal(nomePastaProtocolo({ numero: "144756/2026", assunto: "INCLUSÃO: PCA 2027?", interessado: "X" }), "144756-2026 - INCLUSÃO- PCA 2027");
  assert.equal(nomePastaProtocolo({ numero: "1/2026", assunto: " ", interessado: "SEC. SAÚDE" }), "1-2026 - SEC. SAÚDE");
  assert.equal(nomePastaProtocolo({ numero: "1/2026", assunto: null, interessado: null }), "1-2026");
  assert.equal(nomeSeguro("a".repeat(200)).length, 120);
  const p = (id: number, numero: string, dfds: { numero: string; planejamento: string | null }[]) => ({ id, numero, idExterno: null, assunto: "A", interessado: null, anoPca: 2027, pca: null, dfds });
  const { tarefas, semPlanejamento } = tarefasDosProtocolos([
    p(1, "10/2026", [{ numero: "531", planejamento: "640" }, { numero: "532", planejamento: null }, { numero: "533", planejamento: "0640" }]),
    p(2, "10/2026", [{ numero: "700", planejamento: "811" }]),
  ]);
  assert.deepEqual(tarefas.map((t) => [t.id, t.pasta, t.arquivo]), [
    ["640", "10-2026 - A", "DFD 531 - Planejamento 640.pdf"],
    ["811", "10-2026 - A (2)", "DFD 700 - Planejamento 811.pdf"],
  ]);
  assert.deepEqual(semPlanejamento, [{ protocolo: "10/2026", dfd: "532" }]);
  assert.deepEqual(tarefasDosIds(["5"]), [{ chave: "5", id: "5", arquivo: "DFD - Planejamento 5.pdf", pasta: null }]);
});
