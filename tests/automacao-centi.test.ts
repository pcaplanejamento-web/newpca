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
  assert.equal(versaoAtende("1.2.0"), false);
  assert.equal(versaoAtende("1.3.0"), false);
  assert.equal(versaoAtende("1.3.1"), false);
  assert.equal(versaoAtende("1.3.2"), false);
  assert.equal(versaoAtende("1.3.3"), false);
  assert.equal(versaoAtende("1.3.4"), false);
  assert.equal(versaoAtende("1.3.5"), false);
  assert.equal(versaoAtende("1.3.6"), false);
  assert.equal(versaoAtende("1.3.7"), false);
  assert.equal(versaoAtende("1.3.8"), false);
  assert.equal(versaoAtende("1.3.9"), false);
  assert.equal(versaoAtende("1.3.10"), false);
  assert.equal(versaoAtende("1.3.11"), false);
  assert.equal(versaoAtende("1.3.12"), false);
  assert.equal(versaoAtende("1.3.13"), false);
  assert.equal(versaoAtende("1.3.14"), false);
  assert.equal(versaoAtende("1.3.15"), false);
  assert.equal(versaoAtende("1.3.16"), false);
  assert.equal(versaoAtende("1.3.17"), false);
  assert.equal(versaoAtende("1.3.18"), true);
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
  const p = (id: number, numero: string, dfds: ReturnType<typeof d>[]) => ({ id, numero, idExterno: null, assunto: "A", interessado: null, sigla: "SMS", anoPca: 2027, pca: null, criadoEm: null, responsavelId: null, situacaoId: null, itens: 0, valor: 0, dfds });
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
  assert.equal(candidatosEntidade("", "02")[0], "00");
  assert.equal(candidatosEntidade("", "02").at(-1), "28");
  assert.equal(candidatosEntidade("", "02").length, 29);
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

// ── Anexar ao protocolo da Centi ───────────────────────────────────────────────────────────────────────────────────────

test("lerAlvoCenti / descricaoDoArquivo / opções de destino", async () => {
  const { lerAlvoCenti, descricaoDoArquivo, lerOpcoesSaida, paraBase64 } = await import("../src/lib/automacao-centi-core.ts");
  assert.deepEqual(lerAlvoCenti(" 2.332.778 ", "156844/2026"), { alvo: { id: "2332778", numero: "156844", ano: "2026" } });
  assert.deepEqual(lerAlvoCenti("2332778", "0156844"), { alvo: { id: "2332778", numero: "156844", ano: null } });
  assert.ok("erro" in lerAlvoCenti("", "156844"));
  assert.ok("erro" in lerAlvoCenti("2332778", "15/68"));
  assert.equal(descricaoDoArquivo("DFDs - PCA 2027 - (1, 2) - 2026.PDF"), "DFDs - PCA 2027 - (1, 2) - 2026");
  const o = lerOpcoesSaida({ destino: "protocolo", tipoDocumento: "x" });
  assert.equal(o.destino, "protocolo");
  assert.equal(o.tipoDocumento, "1039");
  assert.equal(lerOpcoesSaida({ destino: "nuvem" }).destino, "pasta");
  assert.equal(paraBase64(new TextEncoder().encode("%PDF-1.7")), "JVBERi0xLjc=");
});

/** Um protocolo no formato do load da Centi (recorte real do 156844). */
function protocoloCenti(docs: unknown[]) {
  const T = "ORM.ObjectsJSON.Transports.ObjectDataJSON, ORM";
  const ref = (Id: number, extra: object[] = []) => ({ $type: T, Type: 0, State: 10, ModuleKey: 0, Guid: null, Fields: [{ Key: "Id", Value: Id }, ...extra], DynamicAttributes: null });
  return {
    $type: "ORM.ObjectsJSON.Returns.LoadReturn, ORM",
    Entity: {
      $type: T,
      Type: 0,
      State: 3,
      ModuleKey: 102907,
      Guid: "e78b8f4c-8fdf-47f4-95a5-ce8cbdb42eab",
      Fields: [
        { Key: "NrProtocolo", Value: "156844" },
        { Key: "AnoReferencia", Value: "2026" },
        { Key: "IdAssunto", Value: ref(1831, [{ Key: "Display", Value: "INCLUSÃO - PCA" }]) },
        { Key: "Descricao", Value: "DFDS ENVIADOS PARA INCLUSÃO NO PCA. " },
        { Key: "Documentos", Value: docs },
        { Key: "AtesteControleInterno", Value: null },
        { Key: "LinksDownloads", Value: null },
        { Key: "EtapasFluxo", Value: null },
        { Key: "DtDocumento", Value: null },
        { Key: "Id", Value: "2332778" },
      ],
      DynamicAttributes: [],
    },
    Message: null,
  };
}
const docCenti = (seq: string, desc: string, tipo: unknown) => ({
  $type: "ORM.ObjectsJSON.Transports.ObjectDataJSON, ORM",
  Type: 0,
  State: 3,
  ModuleKey: 102932,
  Guid: `g-${seq}`,
  Fields: [
    { Key: "IdPessoaDocumentoTipo", Value: tipo },
    { Key: "Sequencial", Value: seq },
    { Key: "Descricao", Value: desc },
    { Key: "Id", Value: `54523${seq}` },
  ],
  DynamicAttributes: [],
});

async function pecasAnexo() {
  const { readFileSync } = await import("node:fs");
  const vm = await import("node:vm");
  const ctx: Record<string, Record<string, (...a: unknown[]) => unknown>> = {};
  vm.runInNewContext(readFileSync("extensao-centi/centi-anexo.js", "utf8"), ctx);
  // O nome da peça leva o MESMO protocolo do centi-main.js (uma cópia antiga na aba nunca é reaproveitada).
  const p = readFileSync("extensao-centi/centi-main.js", "utf8").match(/const PROTOCOLO = (\d+);/)?.[1];
  const pecas = ctx[`__pcaCentiAnexo_p${p}`];
  assert.ok(pecas, "centi-anexo.js e centi-main.js com o mesmo protocolo");
  // O resultado volta por JSON (outro "realm" do vm): compara-se como dado puro.
  return Object.fromEntries(Object.entries(pecas).map(([k, f]) => [k, (...a: unknown[]): J => (typeof f === "function" ? JSON.parse(JSON.stringify(f(...a) ?? null)) : f)]));
}
type J = ReturnType<typeof JSON.parse>;
const PEDIDO = { id: "2332778", numero: "156844", ano: "2026", tipo: "1039", descricao: "DFDs - PCA 2027 - (156844) - 2026", arquivo: "DFDs - PCA 2027 - (156844) - 2026.pdf", pdf: "JVBERi0xLjc=" };

test("anexo: valida o pedido (só PDF, códigos numéricos, sem caminho no nome)", async () => {
  const A = await pecasAnexo();
  assert.equal(A.validarPedido(PEDIDO), null);
  assert.match(A.validarPedido({ ...PEDIDO, pdf: "PGh0bWw+" }), /PDF/);
  assert.match(A.validarPedido({ ...PEDIDO, id: "23a" }), /Id/);
  assert.match(A.validarPedido({ ...PEDIDO, arquivo: "../x.pdf" }), /arquivo/);
  assert.match(A.validarPedido({ ...PEDIDO, tipo: "" }), /Tipo/);
});

test("anexo: confere Id, número e ano do protocolo antes de qualquer gravação", async () => {
  const A = await pecasAnexo();
  const r = protocoloCenti([]);
  assert.ok(A.conferirProtocolo(r, PEDIDO).entidade);
  assert.match(A.conferirProtocolo(r, { ...PEDIDO, numero: "156845" }).erro, /é do protocolo 156844\/2026, não do 156845/);
  assert.match(A.conferirProtocolo(r, { ...PEDIDO, ano: "2025" }).erro, /de 2026, não de 2025/);
  assert.match(A.conferirProtocolo(r, { ...PEDIDO, id: "1" }).erro, /Id 1/);
  assert.match(A.conferirProtocolo({ Entity: { ModuleKey: 1, Fields: [] } }, PEDIDO).erro, /não devolveu/);
  const res = A.resumoProtocolo(r.Entity);
  assert.equal(res.assunto, "INCLUSÃO - PCA");
  assert.equal(res.documentos, 0);
});

test("anexo: monta o Salvar = o protocolo do load SEM mudança + UM documento novo no fim", async () => {
  const A = await pecasAnexo();
  const tipoGravado = { $type: "x", State: 10, Fields: [{ Key: "Id", Value: 1039 }, { Key: "Display", Value: "DFD (DOCUMENTO FORMALIZAÇÃO DEMANDA)" }] };
  const r = protocoloCenti([docCenti("1", "OUTRO", tipoGravado)]);
  const antes = JSON.stringify(r);
  const corpo = A.montarSalvar(r.Entity, PEDIDO, new Date(2026, 9, 1, 14, 30, 40), "aefcd5c7-13a9-9bce-2d0a-d6bb4ecbc9a6");
  assert.equal(JSON.stringify(r), antes, "não altera o load");
  assert.equal(corpo.Token, "");
  const campo = (o: J, k: string): J => o.Fields.find((f: J) => f.Key === k)?.Value;
  // Tudo o mais exatamente como veio (só as listas nulas viram [] — como a tela da Centi).
  for (const f of r.Entity.Fields) {
    if (f.Key === "Documentos") continue;
    const esperado = ["AtesteControleInterno", "LinksDownloads", "EtapasFluxo"].includes(f.Key) ? [] : f.Value;
    assert.deepEqual(campo(corpo.Object, f.Key), esperado, f.Key);
  }
  assert.equal(corpo.Object.Guid, r.Entity.Guid);
  assert.equal(campo(corpo.Object, "DtDocumento"), null);
  const docs = campo(corpo.Object, "Documentos");
  assert.equal(docs.length, 2);
  assert.deepEqual(docs[0], campo(JSON.parse(JSON.stringify(r.Entity)), "Documentos")[0]);
  const novo = docs[1];
  assert.equal(novo.State, 0);
  assert.equal(novo.ModuleKey, 102932);
  assert.equal(campo(novo, "Id"), "0");
  assert.equal(campo(novo, "Descricao"), PEDIDO.descricao);
  assert.equal(campo(novo, "Data"), "01/10/2026 14:30:40");
  assert.equal(campo(novo, "DocumentoExterno"), "1");
  assert.deepEqual(campo(novo, "IdPessoaDocumentoTipo"), tipoGravado, "o tipo é o mesmo objeto que a Centi já devolve");
  const ged = campo(novo, "IdGed");
  assert.equal(campo(ged, "FileName"), PEDIDO.arquivo);
  assert.equal(campo(ged, "Data"), PEDIDO.pdf);
  // Sem documento desse tipo no protocolo: a referência pelo Id.
  const sem = A.montarSalvar(protocoloCenti([]).Entity, { ...PEDIDO, tipo: "77" }, new Date(), "g");
  const ref = campo(campo(sem.Object, "Documentos")[0], "IdPessoaDocumentoTipo");
  assert.equal(ref.State, 10);
  assert.equal(campo(ref, "Id"), 77);
});

test("anexo: não repete a mesma descrição e só confirma com o documento de volta", async () => {
  const A = await pecasAnexo();
  const r = protocoloCenti([docCenti("4", "dfds  - pca 2027 - (156844) - 2026", null)]);
  assert.deepEqual(A.jaAnexado(r.Entity, PEDIDO.descricao), { sequencial: "4", documento: "545234" });
  assert.equal(A.jaAnexado(protocoloCenti([]).Entity, PEDIDO.descricao), null);
  assert.deepEqual(A.conferirSalvo({ Success: true, Entity: r.Entity }, PEDIDO), { sequencial: "4", documento: "545234" });
  assert.match(A.conferirSalvo({ Success: false, Message: [{ Message: "Sem permissão" }] }, PEDIDO).erro, /Sem permissão/);
  assert.match(A.conferirSalvo({ Success: true, Entity: protocoloCenti([]).Entity }, PEDIDO).erro, /não voltou/);
  const zero = protocoloCenti([{ ...docCenti("0", PEDIDO.descricao, null), Fields: [{ Key: "Descricao", Value: PEDIDO.descricao }, { Key: "Id", Value: "0" }] }]);
  assert.match(A.conferirSalvo({ Success: true, Entity: zero.Entity }, PEDIDO).erro, /não voltou/);
});

test("anexo: o tipo vai como a tela da Centi manda (o registro do tipo carregado)", async () => {
  const A = await pecasAnexo();
  const reg = { $type: "x", Type: 0, State: 3, ModuleKey: 103868, Guid: "g", Fields: [{ Key: "Descricao", Value: "DFD" }, { Key: "Id", Value: "1039" }], DynamicAttributes: [] };
  assert.deepEqual(A.tipoDoLoad({ Entity: reg }, "1039"), reg);
  assert.equal(A.tipoDoLoad({ Entity: reg }, "77"), null);
  assert.equal(A.tipoDoLoad({ Entity: { ...reg, ModuleKey: 1 } }, "1039"), null);
  const corpo = A.montarSalvar(protocoloCenti([]).Entity, PEDIDO, new Date(), "g", reg);
  const campo = (o: J, k: string): J => o.Fields.find((f: J) => f.Key === k)?.Value;
  assert.deepEqual(campo(campo(corpo.Object, "Documentos")[0], "IdPessoaDocumentoTipo"), reg);
});

test("anexo: a dica do erro do salvar diz quais cabeçalhos da tela faltaram (só os nomes)", async () => {
  const A = await pecasAnexo();
  assert.equal(A.dicaCabecalhos(null, ["Refreshtoken"], false), "");
  assert.equal(A.dicaCabecalhos([], ["Refreshtoken"], true), "");
  const tela = ["content-type", "accept", "refreshtoken", "company", "month", "modulekey", "x-ts-a"];
  assert.equal(A.dicaCabecalhos(tela, ["Refreshtoken", "Company", "Month"], true), "Cabeçalhos do salvar da Centi que faltaram: modulekey.");
  assert.match(A.dicaCabecalhos(tela, ["Refreshtoken", "Company", "Month", "Modulekey"], true), /anti-robô/);
  assert.match(A.dicaCabecalhos(["refreshtoken"], ["Refreshtoken"], true), /mesmos/);
});

test("anexo: a dica do erro mostra os passos da tela antes do salvar (sem números longos)", async () => {
  const A = await pecasAnexo();
  assert.equal(A.dicaTrilha(null, "restauth/confirmsave"), "");
  const d = A.dicaTrilha(["GET load?entity=102907&key=2332778", "POST upload?entity=102932"], "restauth/confirmsave");
  assert.equal(d, "Passos da tela antes de salvar: GET load?entity=102907&key=233… › POST upload?entity=102932. Anexo: restauth/confirmsave.");
});

test("anexo: o rastreio (trace-*) vai NOVO em cada pedido; sessão e entidade ficam", async () => {
  const A = await pecasAnexo();
  const cab = {
    Refreshtoken: "abc123def456ghi789jkl",
    Company: "2",
    "Trace-Guid": "11111111-2222-4333-8444-555555555555",
    "Trace-Ticket": "1759340000000",
    "X-Ai-Trace": "a1b2c3d4e5f6a7b8c9d0",
    "trace-compact": "1",
  };
  let n = 0;
  const r = A.renovarRastreio(cab, () => `aaaaaaaa-bbbb-4ccc-8ddd-${String(++n).padStart(12, "0")}`, 1760000000000, () => 0.5);
  assert.equal(r.Refreshtoken, cab.Refreshtoken);
  assert.equal(r.Company, "2");
  assert.equal(r["Trace-Guid"], "aaaaaaaa-bbbb-4ccc-8ddd-000000000001");
  assert.equal(r["Trace-Ticket"], "1760000000000");
  assert.notEqual(r["X-Ai-Trace"], cab["X-Ai-Trace"]);
  assert.equal(r["X-Ai-Trace"].length, cab["X-Ai-Trace"].length);
  assert.match(r["X-Ai-Trace"], /^[0-9a-f]+$/);
  assert.equal(r["trace-compact"], "1");
});

test("anexo: o token novo de cada resposta substitui o antigo (token, Bearer e refreshtoken)", async () => {
  const A = await pecasAnexo();
  const cab = { Refreshtoken: "r0", token: "t0", Authorization: "Bearer t0", Company: "2" };
  assert.deepEqual(A.comTokenNovo(cab, "t1", "r1"), { Refreshtoken: "r1", token: "t1", Authorization: "Bearer t1", Company: "2" });
  // Nunca acrescenta cabeçalho que a tela não manda (o operation só leva Refreshtoken + Company + Month).
  assert.deepEqual(A.comTokenNovo({ Refreshtoken: "r0", Company: "2" }, "t1", null), { Refreshtoken: "r0", Company: "2" });
  assert.deepEqual(A.comTokenNovo({ Refreshtoken: "r0", Company: "2" }, "t1", "r1"), { Refreshtoken: "r1", Company: "2" });
  assert.deepEqual(A.comTokenNovo(cab, null, null), cab);
});

test("confirmsave recebe o OBJETO do protocolo direto (como a tela da Centi); o save, o envelope", async () => {
  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const ctx: Record<string, unknown> = {};
  vm.runInNewContext(fs.readFileSync("extensao-centi/centi-anexo.js", "utf8"), ctx);
  const A = Object.values(ctx).find((v) => v && typeof v === "object" && "corpoConfirmar" in (v as object)) as {
    montarSalvar: (...a: unknown[]) => { Token: string; Object: { ModuleKey: number; Fields: unknown[] } };
    corpoConfirmar: (s: unknown) => { ModuleKey: number; Fields: unknown[]; Token?: unknown; Object?: unknown };
  };
  const e = { $type: "ORM", Type: 0, State: 3, ModuleKey: 102907, Guid: "g", Fields: [{ Key: "Documentos", Value: [] }, { Key: "Id", Value: "1" }] };
  const salvar = A.montarSalvar(e, { tipo: "1039", descricao: "D", arquivo: "D.pdf", pdf: "JVBER" }, new Date(), "u");
  const conf = A.corpoConfirmar(salvar);
  assert.equal(salvar.Token, "");
  assert.equal(conf.ModuleKey, 102907);
  assert.equal(conf.Token, undefined);
  assert.equal(conf.Object, undefined);
  assert.equal(conf, salvar.Object);
});

test("anexo: o protocolo da Tela Protocolo (módulo 102908) é aceito e o documento segue o módulo dos que ele já tem", async () => {
  const A = await pecasAnexo();
  const doc = { $type: "ORM", Type: 0, State: 3, ModuleKey: 102999, Guid: "d", Fields: [{ Key: "Descricao", Value: "PGM" }], DynamicAttributes: [] };
  const e = {
    $type: "ORM", Type: 0, State: 3, ModuleKey: 102908, Guid: "g",
    Fields: [{ Key: "Id", Value: "2332778" }, { Key: "NrProtocolo", Value: "156844" }, { Key: "AnoReferencia", Value: "2026" }, { Key: "Documentos", Value: [doc] }],
  };
  const c = A.conferirProtocolo({ Entity: e }, { id: "2332778", numero: "156844", ano: 2026 });
  assert.equal(c.erro, undefined);
  const s = A.montarSalvar(e, { tipo: "1039", descricao: "D", arquivo: "D.pdf", pdf: "JVBER" }, new Date(), "u");
  const docs = s.Object.Fields.find((f: { Key: string }) => f.Key === "Documentos").Value;
  assert.equal(docs.length, 2);
  assert.equal(docs[1].ModuleKey, 102999);
  assert.ok(A.conferirProtocolo({ Entity: { ...e, ModuleKey: 5 } }, { id: "2332778", numero: "156844" }).erro);
});
