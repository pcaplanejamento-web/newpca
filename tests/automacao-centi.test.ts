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
  assert.equal(versaoAtende("1.1.0"), false);
  assert.equal(versaoAtende("1.0.5"), false);
  assert.equal(versaoAtende("1.2.0"), true);
});

test("pastas, nomes e plano por protocolo", async () => {
  const { nomePastaProtocolo, nomeSeguro, nomeArquivoDfd, planoDosProtocolos, planoDosIds, chaveOrgaoCenti, candidatosEntidade, lerOpcoesSaida, sufixoProtocolos } =
    await import("../src/lib/automacao-centi-core.ts");
  const d = (numero: string, planejamento: string | null, sigla = "SMS") => ({ numero, planejamento, anoPca: null, orgao: "o:3", orgaoNome: "FMS", sigla });
  assert.equal(sufixoProtocolos(["1222/2026", "2212/2026", "1222/2026"]), "(1222, 2212) - 2026");
  assert.equal(sufixoProtocolos(["5/2025", "7/2026"]), "(5) - 2025 + (7) - 2026");
  assert.equal(sufixoProtocolos(Array.from({ length: 10 }, (_, i) => `${i + 1}/2026`)), "(1, 2, 3, 4, 5, 6, 7, 8, … +2) - 2026");
  assert.equal(nomePastaProtocolo({ numero: "144756/2026", sigla: "SMS", anoPca: 2027, dfds: [] }), "SMS - PCA 2027 - (144756) - 2026");
  assert.equal(nomeArquivoDfd("640", { numero: "531", anoPca: 2027 }, "144756/2026"), "Planejamento 640 - DFD 531 - PCA 2027 - (144756) - 2026.pdf");
  assert.equal(nomeArquivoDfd("7"), "Planejamento 7.pdf");
  assert.equal(nomeSeguro("a".repeat(200)).length, 120);
  assert.equal(chaveOrgaoCenti(4, "x"), "o:4");
  assert.equal(chaveOrgaoCenti(null, " Fundo Municipal de Saúde "), "t:FUNDO MUNICIPAL DE SAUDE");
  assert.equal(chaveOrgaoCenti(null, null), null);
  const p = (id: number, numero: string, dfds: ReturnType<typeof d>[]) => ({ id, numero, idExterno: null, assunto: "A", interessado: null, sigla: "SMS", anoPca: 2027, pca: null, dfds });
  const protos = [
    p(1, "10/2026", [d("531", "900"), d("532", null), d("533", "0640"), d("534", "640")]),
    p(2, "11/2026", [d("700", "811", "SME"), d("701", "900")]),
  ];
  const op = lerOpcoesSaida({});
  assert.equal(op.escolherPasta, false);
  assert.equal(op.conferir, true);
  const sep = planoDosProtocolos(protos, op);
  assert.deepEqual(
    sep.arquivos.map((a) => a.nome),
    [
      "Planejamento 640 - DFD 533 - PCA 2027 - (10) - 2026.pdf",
      "Planejamento 811 - DFD 700 - PCA 2027 - (11) - 2026.pdf",
      "Planejamento 900 - DFD 531 - PCA 2027 - (10) - 2026.pdf",
    ],
  );
  assert.equal(sep.arquivos[0].pastas.join("/"), "PCA 2027/SMS - PCA 2027 - (10) - 2026");
  assert.deepEqual(sep.semPlanejamento, [{ protocolo: "10/2026", dfd: "532", grupo: "SMS - PCA 2027 - (10) - 2026" }]);
  // Um planejamento = um download: o duplicado no protocolo e o que já veio de outro protocolo ficam avisados.
  assert.deepEqual(
    sep.repetidos.map((r) => [r.dfd, r.tipo, r.motivo]),
    [
      ["534", "duplicado", "DFD duplicado — o planejamento 640 também está no DFD 533."],
      ["701", "repetido", "Já baixado no protocolo 10/2026 (DFD 531)."],
    ],
  );
  assert.equal(sep.total, 3);
  const porProto = planoDosProtocolos(protos, { ...op, pastaPca: false, formato: "protocolo", ordenarPlanejamento: false });
  assert.deepEqual(porProto.arquivos.map((a) => [a.pastas.length, a.nome, a.partes.map((t) => t.id).join(",")]), [
    [0, "SMS - PCA 2027 - (10) - 2026.pdf", "900,640"],
    [0, "SMS - PCA 2027 - (11) - 2026.pdf", "811"],
  ]);
  const porUnidade = planoDosProtocolos(protos, { ...op, formato: "unidade" });
  assert.deepEqual(porUnidade.arquivos.map((a) => [a.pastas.join("/"), a.nome, a.partes.map((t) => t.id).join(",")]), [
    ["PCA 2027", "SMS - PCA 2027 - (10) - 2026.pdf", "640,900"],
    ["PCA 2027", "SME - PCA 2027 - (11) - 2026.pdf", "811"],
  ]);
  const unico = planoDosProtocolos(protos, { ...op, formato: "unico" });
  assert.deepEqual(unico.arquivos.map((a) => [a.pastas.join("/"), a.nome, a.partes.map((t) => t.id).join(",")]), [
    ["PCA 2027", "DFDs - PCA 2027 - (10, 11) - 2026.pdf", "640,811,900"],
  ]);
  const ids = planoDosIds(["811", "5"], protos, op);
  assert.deepEqual(ids.map((a) => [a.pastas.join("/"), a.nome, a.partes[0].orgao]), [
    ["PCA sem ano", "Planejamento 5.pdf", null],
    ["PCA 2027", "Planejamento 811 - DFD 700 - PCA 2027 - (11) - 2026.pdf", "o:3"],
  ]);
  assert.deepEqual(candidatosEntidade("02: 03,x y", null), ["02", "03", "x", "y"]);
  assert.equal(candidatosEntidade("", "02")[0], "01");
  assert.equal(candidatosEntidade("", "02").length, 20);
  assert.deepEqual(candidatosEntidade("", null), []);
});

test("zip STORE: estrutura e CRC", async () => {
  const { ZipArmazenar, crc32 } = await import("../src/lib/zip-armazenar.ts");
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
  const z = new ZipArmazenar(new Date(2026, 9, 1));
  const partes = [...z.adicionar("PCA 2027/a.pdf", new Uint8Array([1, 2, 3])), ...z.adicionar("PCA 2027/a.pdf", new Uint8Array([4])), ...z.fechar()];
  const tudo = Buffer.concat(partes);
  assert.equal(tudo.readUInt32LE(0), 0x04034b50);
  const fim = tudo.length - 22;
  assert.equal(tudo.readUInt32LE(fim), 0x06054b50);
  assert.equal(tudo.readUInt16LE(fim + 10), 2);
  assert.ok(tudo.includes(Buffer.from("PCA 2027/a (2).pdf")));
});

test("extensão: arquivos gerados em dia com extensao-centi/ e zip com a logo", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { ARQUIVOS_EXTENSAO } = await import("../src/lib/extensao-centi-arquivos.ts");
  const { pngDoDataUrl, zipDaExtensao } = await import("../src/lib/extensao-zip.ts");
  const pasta = new URL("../extensao-centi/", import.meta.url);
  const nomes = readdirSync(pasta).filter((n) => /\.(js|json)$/.test(n)).sort();
  assert.deepEqual(Object.keys(ARQUIVOS_EXTENSAO).sort(), nomes, "rode: node scripts/gerar-extensao.mjs");
  for (const n of nomes) assert.equal(ARQUIVOS_EXTENSAO[n], readFileSync(new URL(n, pasta), "utf8"), `${n} desatualizado — rode: node scripts/gerar-extensao.mjs`);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0]);
  assert.deepEqual(pngDoDataUrl(`data:image/png;base64,${png.toString("base64")}`), new Uint8Array(png));
  assert.equal(pngDoDataUrl("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(pngDoDataUrl(undefined), null);
  const zip = Buffer.concat(zipDaExtensao(ARQUIVOS_EXTENSAO, new Uint8Array(png)));
  assert.ok(zip.includes(Buffer.from("icone.png")));
  assert.ok(zip.includes(Buffer.from('"default_icon"')));
  const semIcone = Buffer.concat(zipDaExtensao(ARQUIVOS_EXTENSAO, null));
  assert.ok(!semIcone.includes(Buffer.from("icone.png")));
});

test("conferirConteudoDfd: só o PDF do planejamento e do DFD pedidos", async () => {
  const { conferirConteudoDfd } = await import("../src/lib/automacao-centi-core.ts");
  const t = "DOCUMENTO DE FORMALIZAÇÃO DE DEMANDA Número DFD: 1209 Planejamento: 1.525 Tipo DFD";
  assert.equal(conferirConteudoDfd(t, { id: "1525", dfd: "1209" }), null);
  assert.match(conferirConteudoDfd(t, { id: "152", dfd: "1209" }) ?? "", /planejamento 152/);
  assert.match(conferirConteudoDfd(t, { id: "1525", dfd: "120" }) ?? "", /DFD 120/);
  assert.equal(conferirConteudoDfd(t, { id: "1525", dfd: null }), null);
  assert.match(conferirConteudoDfd("   ", { id: "1", dfd: null }) ?? "", /sem texto/);
});
