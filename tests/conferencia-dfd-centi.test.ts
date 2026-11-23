import assert from "node:assert/strict";
import { test } from "node:test";
import { contarDivergencias, diferencasDfdCenti, divergenciasDoMotivo, MAX_MOTIVO_CENTI, motivoDivergencias, semValores } from "../src/lib/conferencia-dfd-centi.ts";
import { lerConfigCenti, pedidoEmitirDfd } from "../src/lib/automacao-centi-core.ts";
import { compararDfdCenti } from "../src/lib/fluxo-nos.ts";
import type { DfdParseado } from "../src/lib/parse-dfd-comum.ts";

const item = (n: number, q = 10, vu = 5) => ({ item: n, codigo: `12345${n}`, descricao: `PRODUTO ${n} DE TESTE`, unidade: "UN", quantidade: q, valorUnitario: vu, valorTotal: q * vu });
const base = (): DfdParseado => ({
  numero: "123",
  planejamento: "456",
  tipo: "DFD-S",
  objeto: "Aquisição de materiais de escritório",
  orgaoEntidade: "PREFEITURA",
  setorRequisitante: "SEC. ADMINISTRAÇÃO",
  siglaSetor: null,
  responsavel: "FULANO",
  matricula: "123",
  email: "a@b.gov.br",
  telefone: "64 9999-0000",
  anoPca: 2027,
  numeroContrato: null,
  numeroAta: null,
  numeroLicitacao: null,
  valorTotal: 100,
  nomeArquivo: "x.pdf",
  secoes: [
    { numero: 3, titulo: "3 - JUSTIFICATIVA", texto: "Necessidade de reposição, conforme demanda." },
    { numero: 6, titulo: "6 - PRIORIDADE", texto: "ALTA" },
  ],
  itens: [item(1), item(2)],
  assinaturas: [],
});
const sistema = (d = base()) => ({ ...d, reparticaoId: 1, anoPca: 2027 });

test("conferência × Centi: igual = nenhuma diferença (quebra de linha e pontuação não contam)", () => {
  const c = base();
  c.secoes[0] = { ...c.secoes[0], texto: "Necessidade de reposição conforme\ndemanda" };
  c.secoes[1] = { ...c.secoes[1], texto: "alta" };
  c.objeto = "AQUISIÇÃO DE MATERIAIS  DE ESCRITÓRIO.";
  assert.deepEqual(diferencasDfdCenti(sistema(), c), []);
});

test("conferência × Centi: cada diferença em frase (cabeçalho, seção, itens)", () => {
  const c = base();
  c.objeto = "Aquisição de cadeiras";
  c.responsavel = "BELTRANO";
  c.secoes[0] = { ...c.secoes[0], texto: "Outro motivo" };
  c.itens = [item(1, 12, 6), item(3)];
  c.valorTotal = 122;
  const d = diferencasDfdCenti(sistema(), c);
  assert.ok(d.some((x) => x.startsWith("Objeto: “Aquisição de materiais de escritório” no sistema × “Aquisição de cadeiras” na Centi")));
  assert.ok(d.some((x) => x.startsWith("Responsável: “FULANO” no sistema × “BELTRANO”")));
  assert.ok(d.some((x) => x.startsWith("Seção 3 - JUSTIFICATIVA diferente")));
  assert.ok(d.some((x) => /^Item 1 \(cód\. 123451\): quantidade 10 × 12, valor unitário R\$\s5,00 × R\$\s6,00 \(sistema × Centi\)$/.test(x)));
  assert.ok(d.includes("Item 3 (cód. 123453) só na Centi"));
  assert.ok(d.includes("Item 2 (cód. 123452) só no sistema"));
  assert.ok(d.some((x) => /^Valor total: R\$\s100,00 no sistema × R\$\s122,00 na Centi$/.test(x)));
});

test("conferência × Centi: valor dentro da tolerância não é diferença", () => {
  const c = base();
  c.valorTotal = 100.005;
  assert.deepEqual(diferencasDfdCenti(sistema(), c, 0.01), []);
});

test("motivo: teto com “e mais N”", () => {
  const difs = Array.from({ length: 2000 }, (_, i) => `Diferença número ${i} com algum texto para ocupar espaço`);
  const m = motivoDivergencias("DFD 1 (Planej. 2)", difs);
  assert.ok(m.length <= MAX_MOTIVO_CENTI);
  assert.match(m, /^DFD 1 \(Planej\. 2\): 2000 diferenças — /);
  assert.match(m, /;\ne mais \d+$/);
  assert.equal(contarDivergencias(divergenciasDoMotivo(m)), 2000);
});

test("motivo: 200 divergências cabem INTEIRAS e a lista as devolve todas", () => {
  const difs = Array.from({ length: 200 }, (_, i) => `Item ${i}: quantidade 1; com ponto e vírgula × 2 (sistema × Centi)`);
  const g = divergenciasDoMotivo(motivoDivergencias("DFD 1 (Planej. 2)", difs));
  assert.equal(g.length, 1);
  assert.equal(g[0].titulo, "DFD 1 (Planej. 2): 200 diferenças");
  assert.deepEqual(g[0].itens, difs);
});

test("divergenciasDoMotivo: formato antigo, várias origens e vazio", () => {
  assert.deepEqual(divergenciasDoMotivo("DFD 1 (Planej. 2): 2 diferenças — Objeto diferente; Valor total diferente"), [
    { titulo: "DFD 1 (Planej. 2): 2 diferenças", itens: ["Objeto diferente", "Valor total diferente"] },
  ]);
  assert.deepEqual(divergenciasDoMotivo("Fora da CM002;\nDFD 3: 1 diferença — Tipo diferente"), [
    { titulo: null, itens: ["Fora da CM002"] },
    { titulo: "DFD 3: 1 diferença", itens: ["Tipo diferente"] },
  ]);
  assert.deepEqual(divergenciasDoMotivo(null), []);
  assert.equal(contarDivergencias(divergenciasDoMotivo("a; b; e mais 5")), 7);
});

test("compararDfdCenti: com o DFD inteiro dos dois lados, o motivo lista tudo; o DFD inteiro não segue adiante", () => {
  const c = base();
  c.objeto = "Aquisição de cadeiras";
  const r = compararDfdCenti(
    [{ id: 9, numero: "123", planejamento: "456", tipo: "DFD-S", valor: 100, totalItens: 2, objeto: base().objeto, dfdSistema: sistema(), centi: { numero: "123", tipo: "DFD-S", valor: 100, totalItens: 2, dfd: c } }],
    { tolerancia: 0.01, objeto: true },
  );
  assert.equal(r.divergentes.length, 1);
  assert.match(String(r.divergentes[0].mensagem), /^DFD 123 \(Planej\. 456\): 1 diferença — Objeto: /);
  assert.equal("dfdSistema" in r.divergentes[0], false);
  assert.equal("dfd" in (r.divergentes[0].centi as object), false);
  const igual = compararDfdCenti([{ id: 9, numero: "123", planejamento: "456", dfdSistema: sistema(), centi: { numero: "123", dfd: base() } }], { tolerancia: 0.01, objeto: true });
  assert.equal(igual.conformes.length, 1);
  // O RESULTADO desta conferência vai no item (as colunas da Análise o mostram — não o lido antes).
  assert.equal(r.divergentes[0].conferenciaCenti, "divergente");
  assert.equal(r.divergentes[0].conferenciaCentiMotivo, r.divergentes[0].mensagem);
  assert.equal(igual.conformes[0].conferenciaCenti, "convergente");
  const falha = compararDfdCenti([{ id: 9, numero: "1", planejamento: "2", conferenciaCenti: "divergente", centi: null, centiFalha: true, centiErro: "x" }], { tolerancia: 0.01, objeto: true });
  assert.equal(falha.divergentes[0].naoMarcar, true);
  assert.equal(falha.divergentes[0].conferenciaCenti, undefined, "o não conferido não mostra a conferência de antes (a gravada fica no banco)");
});

test("tipos de divergência: cada texto gravado ganha o(s) tipo(s) para o filtro", async () => {
  const { tiposDivergencia, tiposDoMotivo, motivoDivergencias } = await import("../src/lib/conferencia-dfd-centi.ts");
  const casos: [string, string[]][] = [
    ["e mais 3", []],
    ["DFD 1 (Planej. 2) não está na CM002", ["Não encontrado na Centi"]],
    ["achado na Centi no órgão 3, mas o DFD está cadastrado no órgão 2", ["Órgão"]],
    ["DFD 1: situação X na CM002 (esperada Y)", ["Situação"]],
    ["na Centi é o DFD 5", ["Nº do DFD"]],
    ["Tipo: DFD-S no sistema × DFD-R na Centi", ["Tipo"]],
    ["Valor total: R$ 1,00 no sistema × R$ 2,00 na Centi", ["Valor total"]],
    ["DFD 1: valor 1,00 no DFD × 2,00 na CM002", ["Valor total"]],
    ["Nº de itens: 3 no sistema × 4 na Centi", ["Nº de itens"]],
    ["objeto diferente da Centi", ["Objeto"]],
    ["Seção 3 - JUSTIFICATIVA diferente (só na Centi)", ["Seção JUSTIFICATIVA"]],
    ["Item 4 (cód. 12) só na Centi", ["Item só na Centi"]],
    ["Item 4 só no sistema", ["Item só no sistema"]],
    ["Item 4 (cód. 12): quantidade 1 × 2, valor unitário R$ 1 × R$ 2 (sistema × Centi)", ["Item: quantidade", "Item: valor unitário"]],
    ["Item 4: descrição “a, situação b na Centi” × “c”, medida UN × CX (sistema × Centi)", ["Item: descrição", "Item: medida"]],
    ["Setor Requisitante: “a” no sistema × “b” na Centi", ["Setor Requisitante"]],
    ["algo estranho", ["Outras"]],
  ];
  for (const [t, esperado] of casos) assert.deepEqual(tiposDivergencia(t), esperado, t);
  const m = motivoDivergencias("DFD 1 (Planej. 2)", ["Valor total: R$ 1,00 no sistema × R$ 2,00 na Centi", "Item 1: quantidade 1 × 2 (sistema × Centi)", "Item 2: quantidade 3 × 4 (sistema × Centi)"]);
  assert.deepEqual(tiposDoMotivo(m), ["Valor total", "Item: quantidade"]);
  assert.deepEqual(tiposDoMotivo(null), []);
});

test("tolerância também nos valores do item; o motivo de UMA diferença nunca se parte no “; ”", async () => {
  const c = base();
  c.itens = [{ ...item(1), valorUnitario: 5.004, valorTotal: 50.04 }, item(2)];
  c.valorTotal = 100.04;
  assert.deepEqual(diferencasDfdCenti(sistema(), c, 0.05), [], "R$ 0,004 no unitário fica dentro da tolerância");
  assert.equal(diferencasDfdCenti(sistema(), c, 0.001).length > 0, true);
  const m = motivoDivergencias("DFD 1", ["Item 2: descrição “a; b” × “c” (sistema × Centi)"]);
  assert.deepEqual(divergenciasDoMotivo(m)[0].itens, ["Item 2: descrição “a; b” × “c” (sistema × Centi)"]);
});

test("leituras do motivo: Δ do valor, divergências de um item, desatualizada, histórico, relatório e orientações", async () => {
  const lib = await import("../src/lib/conferencia-dfd-centi.ts");
  const m = motivoDivergencias("DFD 7 (Planej. 8)", [
    "Valor total: R$ 1.500,00 no sistema × R$ 2.000,50 na Centi",
    "Item 4 (cód. 12): quantidade 1 × 2 (sistema × Centi)",
    "Item 40 só no sistema",
    "Item 4 só na Centi",
    "Seção JUSTIFICATIVA diferente",
  ]);
  assert.equal(lib.deltaValorDoMotivo(m), -500.5);
  assert.equal(lib.deltaValorDoMotivo("DFD 1: valor 10,00 no DFD × 7,50 na CM002"), 2.5);
  assert.equal(lib.deltaValorDoMotivo(null), null);
  assert.deepEqual(lib.divergenciasDoItem(m, 4), ["Item 4 (cód. 12): quantidade 1 × 2 (sistema × Centi)"], "nem o 40 nem o só na Centi");
  assert.deepEqual(lib.divergenciasDoItem(m, 40), ["Item 40 só no sistema"]);
  assert.deepEqual(lib.divergenciasDoItem(m, null), []);
  assert.equal(lib.conferenciaDesatualizada("2026-11-01T10:00:00.000Z", "2026-11-01 10:05:00"), true);
  assert.equal(lib.conferenciaDesatualizada("2026-11-01T10:00:00.000Z", "2026-11-01 09:59:00"), false);
  assert.equal(lib.conferenciaDesatualizada(null, "2026-11-01 10:05:00"), false);
  const antes = motivoDivergencias("DFD 7", ["Tipo: a no sistema × b na Centi", "Objeto: “x” no sistema × “y” na Centi"]);
  const depois = motivoDivergencias("DFD 7", ["Objeto: “x” no sistema × “y” na Centi", "Nº de itens: 1 no sistema × 2 na Centi"]);
  assert.deepEqual(lib.comparacaoConferencias(antes, depois), {
    resolvidas: ["Tipo: a no sistema × b na Centi"],
    novas: ["Nº de itens: 1 no sistema × 2 na Centi"],
    mantidas: 1,
  });
  const dfds = [{ numero: "7", planejamento: "8", sigla: "SMS", protocolo: "100/2026", motivo: m }, { numero: "9", planejamento: "10", sigla: null, motivo: antes }];
  const desp = lib.textoRelatorioCenti(dfds, "despacho");
  assert.match(desp, /os 2 DFDs abaixo/);
  assert.match(desp, /DFD 7 \(Planej\. 8\) — SMS · Protocolo 100\/2026/);
  assert.match(desp, /Respeitosamente$/);
  assert.match(lib.textoRelatorioCenti(dfds, "whatsapp"), /^\*Divergências com a Centi — 2 DFDs\*/);
  const pdf = lib.blocosRelatorioCenti(dfds, "13/11/2026");
  assert.equal(pdf.blocos.filter((b) => b.tipo === "subsecao").length, 2);
  assert.deepEqual(lib.relatorioPorTipo(dfds)[0].dfds.length >= 1, true);
  assert.equal(lib.orientacoesDivergencias(["Situação"]).length, 1);
  assert.equal(lib.orientacoesDivergencias(["Valor total", "Órgão"]).length, 2);
  assert.deepEqual(lib.orientacoesDivergencias([]), []);
});

// ——— De ponta a ponta: a etapa de 1 DFD da automação única, SÓ CONFERINDO (o "Reconferir" da Mesa), rodada pelo motor, a
// Centi e o banco simulados. Cada execução tem de gravar o status certo — e mudar quando a Centi muda — sem corrigir nada.
test("Conferir e corrigir 1 DFD × Centi, só conferindo: grava, muda e volta o status; nada corrigido; falha e órgão sem ID não gravam", async () => {
  const { executarFluxo } = await import("../src/lib/fluxo-core.ts");
  const { REGISTRO_NOS } = await import("../src/lib/fluxo-nos.ts");
  const { MODELOS_FLUXO, grafoDoModelo } = await import("../src/lib/fluxo-modelos.ts");
  const m = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-1-dfd");
  assert.ok(m);
  const g = grafoDoModelo(m, new Map());
  let corrigidos = 0;
  const banco = { status: null as string | null, motivo: null as string | null };
  const rodar = async (centi: DfdParseado | "falha" | "nao", entidade = "2") => {
    const posts: { dfdId: number; status: string; motivo?: string }[] = [];
    const r = await executarFluxo(g, REGISTRO_NOS, {
      centi: async () => ({ ok: true }),
      cancelado: () => false,
      api: async (url: string, o?: { body?: unknown }) => {
        if (url.includes("conferencia-dfds"))
          for (const x of (o?.body as { itens?: { dfdId: number; status: string; motivo?: string }[] } | undefined)?.itens ?? []) {
            posts.push(x);
            banco.status = x.status;
            banco.motivo = x.status === "divergente" ? (x.motivo ?? null) : null;
          }
        return { ok: true, marcados: 1, convergentes: 0, divergentes: 0 };
      },
      host: {
        __entrada: [{ id: 7, numero: "123", planejamento: "456", entidade, tipo: "DFD-S", valor: 100, totalItens: 2 }],
        __cache: new Map(),
        __vars: {},
        __soConferir: true,
        corrigirPelaCenti: async () => {
          corrigidos++;
          return { resultado: "corrigido", status: "convergente", motivo: null };
        },
        lerDfdCenti: async (plan: string, _e?: string, _pdf?: boolean, completo?: boolean) => {
          if (centi === "falha") throw new Error("Sem resposta da Centi");
          if (centi === "nao") throw new Error("NAO_ENCONTRADO: a Centi não abriu o planejamento 456 — Registro não encontrado.");
          return { numero: centi.numero, planejamento: plan, tipo: centi.tipo, objeto: centi.objeto, valor: centi.valorTotal, totalItens: centi.itens.length, situacao: "EM ELABORAÇÃO", ...(completo ? { dfd: centi } : {}) };
        },
        dfdDoSistema: async (id: number) => ({ id, ...sistema(), itens: base().itens.map((x, i) => ({ id: 50 + i, ...x })) }),
      },
    } as never);
    return { r, posts };
  };

  let x = await rodar(base());
  assert.deepEqual(x.posts.map((p) => p.status), ["convergente"]);
  assert.deepEqual(banco, { status: "convergente", motivo: null });

  const dif = base();
  dif.itens = [item(1), item(2, 12)];
  dif.valorTotal = 110;
  x = await rodar(dif);
  assert.equal(banco.status, "divergente");
  assert.match(banco.motivo ?? "", /Valor total/);
  assert.match(banco.motivo ?? "", /Item 2 .*quantidade 10 × 12/);
  assert.equal(x.r.estado, "concluido");
  assert.equal(corrigidos, 0, "só conferir: o divergente NÃO é corrigido");
  assert.match(JSON.stringify(x.r.retorno), /"correcao":"soConferir"/);

  x = await rodar(base());
  assert.deepEqual(banco, { status: "convergente", motivo: null }, "voltou igual: Convergente e o motivo some");

  x = await rodar("falha");
  assert.equal(x.r.estado, "falhou", "a falha de comunicação é erro do subfluxo (a retomada refaz)");
  assert.equal(x.posts.length, 0, "não conferido = não grava");
  assert.equal(banco.status, "convergente");

  x = await rodar("nao");
  assert.equal(banco.status, "divergente");
  assert.match(banco.motivo ?? "", /não encontrado na Centi/);

  x = await rodar(base(), "");
  assert.equal(x.posts.length, 0, "órgão sem o ID da Centi: não busca nem grava");
  assert.equal(corrigidos, 0);
});

test("load sem registro: a mensagem da Centi e quando ela diz que o planejamento não existe", async () => {
  const { mensagemSemRegistro, planejamentoInexistente } = await import("../src/lib/automacao-centi-core.ts");
  assert.equal(mensagemSemRegistro({ Entity: { Fields: [] } }), null);
  assert.equal(mensagemSemRegistro({ outro: 1 }), null);
  assert.equal(mensagemSemRegistro({ Entity: null, Message: "Registro não encontrado." }), "Registro não encontrado.");
  assert.equal(mensagemSemRegistro({ Entity: null, Message: { Text: "Usuário sem permissão!" } }), "Usuário sem permissão!");
  assert.equal(mensagemSemRegistro({ Entity: null }), "");
  assert.equal(planejamentoInexistente("Registro não encontrado."), true);
  assert.equal(planejamentoInexistente("Planejamento inexistente"), true);
  assert.equal(planejamentoInexistente("Usuário sem permissão!"), false, "permissão nunca vira 'não existe'");
  assert.equal(planejamentoInexistente(null), false);
});

test("PDF da Centi sem o valor de referência: itens sem valor = não conferido; com valor (inclusive 0) = conferível", () => {
  // O leiaute real emitido com "Emitir valor referência" = Não (Planej. 131): a seção 4 sem VALOR UNITÁRIO/VALOR TOTAL.
  const semColunas = { valorTotal: null, itens: [{ item: 1, codigo: "5241903721", quantidade: 1, valorUnitario: null, valorTotal: null }] };
  assert.equal(semValores(semColunas), true);
  // Com "Sim": 1 × 2.880.000,0000.
  const comColunas = { valorTotal: 2_880_000, itens: [{ item: 1, quantidade: 1, valorUnitario: 2_880_000, valorTotal: 2_880_000 }] };
  assert.equal(semValores(comColunas), false);
  // "0,0000" é valor (0), não falta; um item com valor basta; DFD sem itens não é "sem valores".
  assert.equal(semValores({ valorTotal: 0, itens: [{ valorUnitario: 0, valorTotal: 0 }] }), false);
  assert.equal(semValores({ valorTotal: null, itens: [{ valorUnitario: null, valorTotal: null }, { valorUnitario: 5, valorTotal: null }] }), false);
  assert.equal(semValores({ valorTotal: null, itens: [] }), false);
});

test("a emissão da conferência manda “Emitir valor referência” = Sim mesmo com a chave do aparelho desligada", () => {
  const param = (corpo: { Params: { Key: string; Value: string }[] }, k: string) => corpo.Params.find((p) => p.Key === k)?.Value;
  const doAparelho = lerConfigCenti({ valorReferencia: false });
  assert.equal(param(pedidoEmitirDfd("131", doAparelho, new Date(2026, 10, 17), "114"), "EmitirValorReferencia"), "0");
  // O que `lerNaSessao` faz: a mesma configuração com o valor de referência ligado.
  assert.equal(param(pedidoEmitirDfd("131", { ...doAparelho, valorReferencia: true }, new Date(2026, 10, 17), "114"), "EmitirValorReferencia"), "1");
});

test("sem o registro das seções 8 a 10 na Centi: só elas não contam — “convergente*” com a nota; outra diferença = divergente", async () => {
  const { conferenciaDoRetrato, lerRetrato, montarRetrato, notaConferencia, NOTA_SEM_SECOES_810, textoRetrato } = await import("../src/lib/conferencia-dfd-centi.ts");
  const { marcacoesConferencia } = await import("../src/lib/fluxo-nos.ts");
  const { novoDaCenti } = await import("../src/lib/correcao-centi-core.ts");
  const s = base();
  s.secoes = [...s.secoes, { numero: 8, titulo: "8 - INDICAÇÃO DA EQUIPE DE PLANEJAMENTO", texto: "ANA, BIA" }, { numero: 10, titulo: "10 - AUTORIZAÇÃO", texto: "Autorizo." }];
  // A Centi sem as seções 8 a 10 (ou com as de OUTRO registro): não comparadas.
  const c = base();
  c.secoes = [...c.secoes, { numero: 8, titulo: "8 - INDICAÇÃO DA EQUIPE DE PLANEJAMENTO", texto: "OUTRA EQUIPE" }];
  assert.ok(diferencasDfdCenti(sistema(s), c).some((x) => x.startsWith("Seção 8")), "com o registro, comparadas");
  assert.deepEqual(diferencasDfdCenti(sistema(s), c, 0.01, true), [], "sem o registro, fora da comparação");
  const it = (dfd: DfdParseado) => ({ id: 9, numero: "123", planejamento: "456", dfdSistema: sistema(s), centi: { numero: "123", semSecoes810: true, dfd } });
  const so = compararDfdCenti([it(c)], { tolerancia: 0.01, objeto: true });
  assert.equal(so.conformes.length, 1);
  assert.equal(so.conformes[0].conferenciaCenti, "convergente");
  assert.match(String(so.conformes[0].conferenciaCentiMotivo), /^DFD 123 \(Planej\. 456\): Sem as seções 8 a 10 na Centi/);
  assert.ok(notaConferencia("convergente", String(so.conformes[0].conferenciaCentiMotivo))?.startsWith(NOTA_SEM_SECOES_810));
  assert.equal(notaConferencia("convergente", null), null);
  assert.equal(notaConferencia("divergente", String(so.conformes[0].conferenciaCentiMotivo)), null);
  // A marcação grava o convergente COM a nota (a tela mostra "Convergente*"); o comum segue sem motivo.
  const m = marcacoesConferencia([], [...so.conformes, { id: 10, conferenciaCenti: "convergente", conferenciaCentiMotivo: null }]);
  assert.equal(m.find((x) => x.dfdId === 9)?.motivo, so.conformes[0].conferenciaCentiMotivo);
  assert.equal("motivo" in (m.find((x) => x.dfdId === 10) ?? {}), false);
  // Qualquer outra diferença: a lógica de sempre (divergente, sem a nota).
  const c2 = { ...c, objeto: "Aquisição de cadeiras" };
  const div = compararDfdCenti([it(c2)], { tolerancia: 0.01, objeto: true });
  assert.equal(div.divergentes.length, 1);
  assert.match(String(div.divergentes[0].mensagem), /1 diferença — Objeto:/);
  // O retrato guarda a falta: a reconferência pela Mesa dá o MESMO resultado e a correção mantém as seções do sistema.
  const r = lerRetrato(textoRetrato(montarRetrato({ numero: "123", tipo: "DFD-S", entidade: "2", entidadeAchada: "" }, { situacao: "", numero: "123", tipo: "DFD-S", semSecoes810: true }, c2, { objeto: true, tolerancia: 0.01 })));
  assert.equal(r?.semSecoes810, true);
  assert.equal(conferenciaDoRetrato({ ...sistema(s), numero: "123", planejamento: "456", tipo: "DFD-S" }, r!).status, "divergente");
  assert.match(String(conferenciaDoRetrato({ ...sistema(s), numero: "123", planejamento: "456", tipo: "DFD-S" }, { ...r!, dfd: c }).motivo), /Sem as seções 8 a 10/);
  const novo = novoDaCenti(s, r!, 2027);
  assert.deepEqual(
    novo.secoes.filter((x) => /EQUIPE|AUTORIZA/.test(x.titulo)).map((x) => x.texto),
    ["ANA, BIA", "Autorizo."],
    "a correção nunca apaga nem troca as seções 8 a 10 do sistema",
  );
});

test("seções 8 a 10 NÃO LIDAS (a prévia da Centi 217) × o planejamento sem o registro: a nota diz qual — e o retrato a guarda", async () => {
  const { conferenciaDoRetrato, lerRetrato, montarRetrato, notaConferencia, notaSemLeitura, NOTA_SECOES_810_NAO_LIDAS, NOTA_SEM_SECOES_810, textoRetrato } = await import("../src/lib/conferencia-dfd-centi.ts");
  const s = base();
  s.secoes = [...s.secoes, { numero: 8, titulo: "8 - INDICAÇÃO DA EQUIPE DE PLANEJAMENTO", texto: "ANA, BIA" }];
  const c = base();
  const it = (naoLidas: boolean) => ({ id: 9, numero: "123", planejamento: "456", dfdSistema: sistema(s), centi: { numero: "123", semSecoes810: true, ...(naoLidas ? { secoes810NaoLidas: true } : {}), dfd: c } });
  const lida = compararDfdCenti([it(true)], { tolerancia: 0.01, objeto: true });
  assert.equal(lida.conformes.length, 1, "o resto confere: Convergente* (nunca erro, nunca bloqueia as outras seções)");
  const m1 = String(lida.conformes[0].conferenciaCentiMotivo);
  assert.match(m1, /^DFD 123 \(Planej\. 456\): Seções 8 a 10 não conferidas — a Centi não informou/);
  assert.doesNotMatch(m1, /não tem o registro/, "não lido nunca vira 'o planejamento não tem'");
  const n1 = notaConferencia("convergente", m1);
  assert.ok(n1?.startsWith(NOTA_SECOES_810_NAO_LIDAS));
  assert.equal(notaSemLeitura(n1), true);
  const tem = compararDfdCenti([it(false)], { tolerancia: 0.01, objeto: true });
  const m2 = String(tem.conformes[0].conferenciaCentiMotivo);
  assert.match(m2, /Sem as seções 8 a 10 na Centi — o planejamento não tem o registro/);
  assert.ok(notaConferencia("convergente", m2)?.startsWith(NOTA_SEM_SECOES_810));
  assert.equal(notaSemLeitura(notaConferencia("convergente", m2)), false);
  // O retrato guarda a marca: a reconferência pela Mesa dá o MESMO texto.
  const r = lerRetrato(textoRetrato(montarRetrato({ numero: "123", tipo: "DFD-S", entidade: "2", entidadeAchada: "" }, { situacao: "", numero: "123", tipo: "DFD-S", semSecoes810: true, secoes810NaoLidas: true }, c, { objeto: true, tolerancia: 0.01 })));
  assert.equal(r?.semSecoes810, true);
  assert.equal(r?.secoes810NaoLidas, true);
  const rec = conferenciaDoRetrato({ ...sistema(s), numero: "123", planejamento: "456", tipo: "DFD-S" }, r!);
  assert.equal(rec.status, "convergente");
  assert.match(String(rec.motivo), /Seções 8 a 10 não conferidas/);
  // Sem a marca no retrato (o planejamento não tem): o texto de sempre.
  const r2 = lerRetrato(textoRetrato(montarRetrato({ numero: "123", tipo: "DFD-S", entidade: "2", entidadeAchada: "" }, { situacao: "", numero: "123", tipo: "DFD-S", semSecoes810: true }, c, { objeto: true, tolerancia: 0.01 })));
  assert.equal(r2?.secoes810NaoLidas, undefined);
  assert.match(String(conferenciaDoRetrato({ ...sistema(s), numero: "123", planejamento: "456", tipo: "DFD-S" }, r2!).motivo), /Sem as seções 8 a 10 na Centi/);
});

test("“não encontrado na Centi” SÓ quando a Centi diz: a resposta vazia (a Centi 217 também a dá ao planejamento que existe) é 'não abriu'", async () => {
  const { planejamentoInexistente } = await import("../src/lib/automacao-centi-core.ts");
  assert.equal(planejamentoInexistente(""), false, "sem mensagem: não abriu — nunca grava 'Não encontrado' nem limpa o centro de custo");
  assert.equal(planejamentoInexistente("Registro não encontrado."), true);
});

test("emissão sem o registro das seções 8 a 10: o campo vai VAZIO (nunca o de outro planejamento)", () => {
  const corpo = JSON.stringify(pedidoEmitirDfd("456", lerConfigCenti(null), new Date("2026-11-18T12:00:00Z"), ""));
  assert.match(corpo, /IdPlanejamentoAssinaturaDFD/);
  assert.doesNotMatch(corpo, /IdPlanejamentoAssinaturaDFD[^\]]*163/);
});
