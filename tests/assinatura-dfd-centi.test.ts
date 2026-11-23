import assert from "node:assert/strict";
import { test } from "node:test";
import { assinaturaDoLoad, PARA_TUDO } from "../src/lib/assinatura-dfd-centi.ts";
import { ajusteDaOperacao, CONFIG_CENTI_PADRAO, caminhoLoadPlanejamento, lerConfigCenti, pedidoEmitirDfd } from "../src/lib/automacao-centi-core.ts";
import { emitirUm } from "../src/lib/automacao-dfds-motor.ts";

// O ERRO das seções 8–10 iguais/em branco (16–17/11/2026): a automação abria o planejamento por OUTRO módulo da Centi
// (101026), cuja resposta não traz o registro das seções 8–10, e mandava um id fixo (163) ou vazio na emissão. A TELA da
// Centi (medida no DevTools) abre o planejamento com load?entity=101045 e manda, no "Processar", o
// IdPlanejamentoAssinaturaDFD que vem NESSA resposta — a automação faz igual.

// A ESTRUTURA real da resposta `restauth/load?entity=101045&key=131` (sem os dados pessoais): o campo é uma referência.
const ref = (id: number, extra: unknown[] = []) => ({ $type: "ObjectDataJSON", Type: 0, State: 10, ModuleKey: 0, Guid: null, Fields: [{ Key: "Id", Value: id }, ...extra] });
const loadDaTela = (plan: number, assinatura: number | null) => ({
  $type: "ORM.ObjectsJSON.Returns.LoadReturn, ORM",
  Entity: {
    Type: 0,
    State: 3,
    ModuleKey: 101045,
    Fields: [
      { Key: "DataInicial", Value: "01/01/2027" },
      { Key: "IdCentroCusto", Value: ref(75, [{ Key: "Display", Value: "PM RV, SECRETARIA" }]) },
      { Key: "NumeroDFD", Value: "92" },
      { Key: "IdPessoaResponsavelDemanda", Value: ref(47888) },
      ...(assinatura == null
        ? []
        : [
            {
              Key: "IdPlanejamentoAssinaturaDFD",
              Value: ref(assinatura, [
                { Key: "Display", Value: "SECRETARIA" },
                { Key: "Object", Value: { ModuleKey: 102706, Fields: [{ Key: "Modelo", Value: "SECRETARIA" }, { Key: "IdGestaoAutoridadeSecretarioDemandante", Value: ref(532) }, { Key: "Id", Value: String(assinatura) }] } },
              ]),
            },
          ]),
      { Key: "Produtos", Value: [{ Fields: [{ Key: "IdComprasPlanejamento", Value: ref(plan) }, { Key: "Id", Value: "25390" }] }] },
      { Key: "Id", Value: String(plan) },
    ],
  },
  Message: null,
});

test("o registro das seções 8–10 vem do campo IdPlanejamentoAssinaturaDFD do load do planejamento (como a tela)", () => {
  assert.deepEqual(assinaturaDoLoad(loadDaTela(131, 114), "131"), { id: "114" });
  assert.deepEqual(assinaturaDoLoad(loadDaTela(1078, 163), "1078"), { id: "163" });
  // O número direto (sem a referência) também vale.
  assert.deepEqual(assinaturaDoLoad({ Entity: { Fields: [{ Key: "IdPlanejamentoAssinaturaDFD", Value: "0114" }] } }, "131"), { id: "114" });
  // Sem o campo, com o campo zerado ou sem a Entity: erro — o DFD não é emitido (nunca vazio, nunca um id de outro).
  for (const j of [loadDaTela(131, null), loadDaTela(131, 0), { Entity: null, Message: "x" }, null]) {
    const r = assinaturaDoLoad(j, "131") as { erro: string };
    assert.match(r.erro, /registro das seções 8 a 10 do DFD/);
    assert.ok(!PARA_TUDO.test(r.erro), "a falta do registro de UM planejamento não para a execução");
  }
  // Nunca outro campo ou lista com "assinatura" no nome (assinatura digital, listas).
  const outros = { Entity: { Fields: [{ Key: "IdAssinaturaDigital", Value: 9 }, { Key: "AssinaturasDFD", Value: [{ Id: 5 }] }] } };
  assert.ok("erro" in assinaturaDoLoad(outros, "131"));
});

/** A extensão falsa: o load (o módulo da tela) e o Emitir DFD devolvendo um PDF. */
function centiFalsa(loads: Record<string, unknown>) {
  const pedidos: { acao: string; dados: { caminho?: string; corpo?: { Params?: { Key: string; Value: string }[] } } }[] = [];
  const pedir = async (acao: string, dados: unknown) => {
    pedidos.push({ acao, dados: dados as never });
    const d = dados as { caminho: string };
    if (acao === "ler") return { ok: true, j: loads[d.caminho] ?? { Entity: null, Message: null } };
    if (acao === "pedir") return { ok: true, b64: Buffer.from("%PDF-1.4 teste").toString("base64"), status: 200 };
    return { ok: true };
  };
  const c = { pedir: pedir as never, cfg: () => lerConfigCenti(null), aplicarOperacao: () => false, mapa: () => ({}), cadastradas: () => ({}), definirEntidade: () => {} };
  return { c, pedidos };
}
const param = (p: { Params?: { Key: string; Value: string }[] } | undefined, k: string) => p?.Params?.find((x) => x.Key === k)?.Value;

test("emissão: abre o planejamento pelo módulo da tela (101045) e manda o registro DELE — cada planejamento o seu", async () => {
  assert.equal(caminhoLoadPlanejamento("131"), "restauth/load?entity=101045&key=131");
  const { c, pedidos } = centiFalsa({ [caminhoLoadPlanejamento("131")]: loadDaTela(131, 114), [caminhoLoadPlanejamento("1078")]: loadDaTela(1078, 163) });
  const a = await emitirUm(c, "131");
  const b = await emitirUm(c, "1078");
  assert.ok(a.pdf && b.pdf);
  const ops = pedidos.filter((p) => p.acao === "pedir").map((p) => p.dados.corpo);
  assert.deepEqual(
    ops.map((o) => [param(o, "IdComprasPlanejamento"), param(o, "IdPlanejamentoAssinaturaDFD")]),
    [
      ["131", "114"],
      ["1078", "163"],
    ],
  );
  // A operação que a tela manda hoje.
  assert.equal((ops[0] as unknown as { ModuleKey: number }).ModuleKey, 120477);
});

test("emissão: sem o registro no planejamento, emite com o campo VAZIO e marca semSecoes810 (as demais seções seguem conferidas); sem abrir, a mensagem da Centi", async () => {
  const { c, pedidos } = centiFalsa({ [caminhoLoadPlanejamento("131")]: loadDaTela(131, null) });
  const r = await emitirUm(c, "131");
  assert.ok(r.pdf, "o DFD é emitido mesmo sem o registro das seções 8 a 10");
  assert.equal(r.semSecoes810, true);
  assert.equal(r.recusada, undefined, "a falta do registro nunca conta como recusa da Centi");
  const ops = pedidos.filter((p) => p.acao === "pedir").map((p) => p.dados.corpo);
  assert.equal(ops.length, 1);
  assert.equal(param(ops[0], "IdPlanejamentoAssinaturaDFD"), "", "nunca um id de outro planejamento");
  const n = centiFalsa({ [caminhoLoadPlanejamento("5")]: { Entity: null, Message: "Registro não encontrado" } });
  const x = await emitirUm(n.c, "5", "3");
  assert.match(x.erro ?? "", /Não consegui abrir o planejamento 5 na Centi \(órgão 3\) — Registro não encontrado/);
  assert.equal(x.definitivo, undefined, "outro órgão pode abrir");
  assert.equal(n.pedidos.filter((p) => p.acao === "pedir").length, 0);
});

test("operação: a atual da tela (120477); as que a Centi desligou viram a atual; a tela segue mandando", () => {
  assert.equal(CONFIG_CENTI_PADRAO.moduleKey, 120477);
  assert.equal(CONFIG_CENTI_PADRAO.guid, "1449d1d1-85f8-8080-7f63-df246a9e7f80");
  for (const velha of [
    { moduleKey: 120464, guid: "2b414e51-4389-1c0a-f194-b11779b834f5" },
    { moduleKey: 120465, guid: "24e3e9d0-cb29-2473-1d0a-318c7d8507ef" },
  ]) {
    const c = lerConfigCenti({ ...velha, valorReferencia: false });
    assert.equal(c.moduleKey, 120477);
    assert.equal(c.guid, CONFIG_CENTI_PADRAO.guid);
    assert.equal(c.valorReferencia, false);
    assert.equal(ajusteDaOperacao(CONFIG_CENTI_PADRAO, velha), null, "uma operação desligada nunca volta");
  }
  assert.deepEqual(ajusteDaOperacao(CONFIG_CENTI_PADRAO, { moduleKey: 120480, guid: "AAAAAAAA-85f8-8080-7f63-df246a9e7f80" }), {
    moduleKey: 120480,
    guid: "aaaaaaaa-85f8-8080-7f63-df246a9e7f80",
  });
  // A configuração antiga (fonte/pares/reserva) é descartada.
  const c = lerConfigCenti({ fonteAssinatura: { metodo: "GET" }, paresAssinatura: { 131: "1" }, assinaturaReserva: "163" }) as Record<string, unknown>;
  assert.ok(!("fonteAssinatura" in c) && !("paresAssinatura" in c) && !("assinaturaReserva" in c));
  const corpo = pedidoEmitirDfd("131", lerConfigCenti(null), new Date(2026, 10, 17), "114");
  assert.equal(param(corpo, "IdPlanejamentoAssinaturaDFD"), "114");
});

test("completar com o DFD do sistema: o mesmo nº de planejamento em dois órgãos traz OS DOIS DFDs (nunca o último por cima)", async () => {
  const { REGISTRO_NOS } = await import("../src/lib/fluxo-nos.ts");
  const def = REGISTRO_NOS.get("sistema.completarDfd") as unknown as { executar: (e: unknown, c: unknown, ctx: unknown) => Promise<{ saida: { id: number }[]; naoEncontrados: unknown[] }> };
  const dfds = [
    { id: 92, numero: "92", planejamento: "131", entidade: "2" },
    { id: 500, numero: "500", planejamento: "131", entidade: "3" },
    { id: 7, numero: "7", planejamento: "8", entidade: "2" },
  ];
  const cache = new Map<string, unknown>([["dfds", Promise.resolve(dfds)]]);
  const ctx = { host: { __cache: cache }, aviso: () => {}, cancelado: () => false };
  const r = await def.executar({ entrada: [{}] }, { planejamento: "131" }, ctx);
  assert.deepEqual(r.saida.map((x) => x.id).sort((a, b) => a - b), [92, 500]);
  assert.equal(r.naoEncontrados.length, 0);
});

test("dadosDoPlanejamento: os campos do PRÓPRIO planejamento (formato real do 101045)", async () => {
  const { dadosDoPlanejamento } = await import("../src/lib/automacao-centi-core.ts");
  const ref = (id: number, display: string, obj: unknown[] = []) => ({ $type: "x", Fields: [{ Key: "Id", Value: id }, { Key: "Display", Value: display }, { Key: "Object", Value: { Fields: obj } }] });
  const j = {
    Entity: {
      Fields: [
        { Key: "IdCentroCusto", Value: ref(7, "PM RV, SECRETARIA MUNICIPAL DE TESTE") },
        { Key: "Finalidade", Value: "Aquisição de materiais" },
        // O protocolo ligado traz a SITUAÇÃO DELE (texto) — nunca é a do planejamento.
        { Key: "IdProtocolo", Value: ref(3, "123/2026", [{ Key: "SituacaoDescricao", Value: "Em Andamento" }]) },
        { Key: "Situacao", Value: 1 },
      ],
    },
  };
  assert.deepEqual(dadosDoPlanejamento(j), { situacao: "", centroCusto: "PM RV, SECRETARIA MUNICIPAL DE TESTE", finalidade: "Aquisição de materiais" });
  assert.deepEqual(dadosDoPlanejamento({ Entity: { Fields: [{ Key: "Situacao", Value: "Executado" }] } }), { situacao: "Executado" });
  assert.deepEqual(dadosDoPlanejamento({ Entity: null }), {});
  assert.deepEqual(dadosDoPlanejamento({ Entity: { Fields: [{ Key: "IdCentroCusto", Value: 12 }] } }), { centroCusto: "" }, "o id numérico nunca é o centro de custo");
  // O texto da situação no TOPO do próprio planejamento (Situacao só com o código): vale o SituacaoDescricao do topo.
  assert.deepEqual(dadosDoPlanejamento({ Entity: { Fields: [{ Key: "Situacao", Value: 2 }, { Key: "SituacaoDescricao", Value: "Não Executado" }] } }), { situacao: "Não Executado" });
  // O do registro LIGADO (aninhado) nunca vale — nem com o Situacao do topo ausente.
  assert.deepEqual(dadosDoPlanejamento({ Entity: { Fields: [{ Key: "IdProtocolo", Value: ref(3, "1/2026", [{ Key: "SituacaoDescricao", Value: "Em Andamento" }]) }] } }), {});
});

// A Centi 3.0.216.217 (19/11/2026): o load completo (101045) voltou vazio e o 101026 abre só uma PRÉVIA do planejamento
// (sem o centro de custo e sem o registro das seções 8–10). A emissão com o campo VAZIO funciona (a Centi usa o do
// planejamento) e QUEM DECIDE se as seções 8–10 vieram é o PDF (`temSecoes810`) — nunca o load.
const previa = (plan: number) => ({ Entity: { ModuleKey: 999999, Fields: [{ Key: "Finalidade", Value: "x" }, { Key: "Situacao", Value: 1 }, { Key: "Id", Value: String(plan) }] }, Message: null });

test("load PRÉVIA (sem o centro de custo e sem as seções 8–10): EMITE com o campo vazio — o PDF decide as seções 8–10", async () => {
  const { faltasDoLoad, loadIncompleto } = await import("../src/lib/automacao-centi-core.ts");
  assert.deepEqual(faltasDoLoad(loadDaTela(131, 114)), []);
  assert.deepEqual(faltasDoLoad(loadDaTela(131, null)), ["IdPlanejamentoAssinaturaDFD"]);
  assert.equal(loadIncompleto(loadDaTela(131, null)), false);
  assert.equal(loadIncompleto(previa(24)), true);
  assert.equal(loadIncompleto({ Entity: null }), false);
  const { c, pedidos } = centiFalsa({ [caminhoLoadPlanejamento("24")]: previa(24) });
  const r = await emitirUm(c, "24", "3");
  assert.ok(r.pdf, "a prévia emite (a Centi 217 aceita o campo vazio)");
  assert.equal(r.erro, undefined);
  assert.equal(r.semSecoes810, true, "só o sinal de que o pedido foi sem o registro — o PDF é que decide");
  assert.equal(r.secoes810NaoLidas, true, "a prévia: o Baixar/anexar confere o PDF antes de salvar");
  const ops = pedidos.filter((p) => p.acao === "pedir").map((p) => p.dados.corpo);
  assert.equal(ops.length, 1, "UMA emissão");
  assert.equal(param(ops[0], "IdComprasPlanejamento"), "24");
  assert.equal(param(ops[0], "IdPlanejamentoAssinaturaDFD"), "", "nunca um id de outro planejamento");
  // Com o registro: emite com ele.
  const u = centiFalsa({ [caminhoLoadPlanejamento("131")]: loadDaTela(131, 114) });
  const y = await emitirUm(u.c, "131");
  assert.ok(y.pdf);
  assert.equal(y.semSecoes810, undefined);
  assert.equal(param(u.pedidos.find((p) => p.acao === "pedir")?.dados.corpo, "IdPlanejamentoAssinaturaDFD"), "114");
});

test("seções 8–10 pelo PDF: preenchidas (qualquer uma) = comparadas; todas em branco = não", async () => {
  const { temSecoes810 } = await import("../src/lib/conferencia-dfd-centi.ts");
  const sec = (titulo: string, texto: string) => ({ titulo, texto });
  const base = [sec("3 - JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO", "x")];
  assert.equal(temSecoes810({ secoes: base }), false, "sem as seções 8–10");
  assert.equal(temSecoes810({ secoes: [...base, sec("8 - INDICAÇÃO DO(S) INTEGRANTE(S) DA EQUIPE DE PLANEJAMENTO E RESPONSÁVEL PELA FISCALIZAÇÃO", "  ")] }), false, "só o título");
  assert.equal(temSecoes810({ secoes: [...base, sec("9 - AUTORIZAÇÃO DEMANDA", "Autorizo o início da formalização da demanda. FULANO GESTOR")] }), true);
  // O texto FIXO que a Centi imprime sem o registro (rótulos, a frase da autorização) não é conteúdo.
  assert.equal(
    temSecoes810({
      secoes: [
        ...base,
        sec("8 - INDICAÇÃO DO(S) INTEGRANTE(S) DA EQUIPE DE PLANEJAMENTO E RESPONSÁVEL PELA FISCALIZAÇÃO", "Integrantes Equipe: Nome: Matrícula: Email: Responsável Fiscalização: Nome: Matrícula: Email:"),
        sec("9 - AUTORIZAÇÃO DEMANDA", "Autorizo o início da formalização da demanda."),
      ],
    }),
    false,
  );
  assert.equal(temSecoes810({ secoes: [...base, sec("8 - INDICAÇÃO DO(S) INTEGRANTE(S) DA EQUIPE DE PLANEJAMENTO E RESPONSÁVEL PELA FISCALIZAÇÃO", "Integrantes Equipe: Nome: X")] }), true);
});

test("recusa do Emitir DFD com a prévia: a causa certa (o registro NÃO VEIO na leitura) e nunca 'o planejamento não tem'", async () => {
  const pedidos: string[] = [];
  const pedir = async (acao: string, dados: unknown) => {
    pedidos.push(acao);
    const d = dados as { caminho: string };
    if (acao === "ler") return { ok: true, j: d.caminho === caminhoLoadPlanejamento("24") ? previa(24) : { Entity: null, Message: null } };
    if (acao === "pedir") return { ok: true, b64: Buffer.from(JSON.stringify({ Success: false, Message: "Usuário sem permissão!" })).toString("base64"), status: 200 };
    return { ok: true };
  };
  const c = { pedir: pedir as never, cfg: () => lerConfigCenti(null), aplicarOperacao: () => false, mapa: () => ({}), cadastradas: () => ({}), definirEntidade: () => {} };
  const r = await emitirUm(c, "24", "3");
  assert.equal(r.pdf, undefined);
  assert.match(r.erro ?? "", /o registro das seções 8 a 10 não veio na leitura da Centi/);
  assert.match(r.erro ?? "", /Abra UM planejamento na CM002 da Centi \(duplo clique na linha\)/, "diz o que fazer");
  assert.doesNotMatch(r.erro ?? "", /o planejamento não tem o registro/);
  // Na prévia (todo DFD na Centi 217), a recusa CONTA como as outras (várias seguidas param a execução) e a operação é
  // reaprendida ANTES de qualquer conclusão — a Centi pode ter trocado o Emitir DFD.
  assert.equal(r.recusada, true);
  assert.equal(r.definitivo, undefined);
  assert.deepEqual(pedidos, ["ler", "pedir", "estado"]);
});

test("recusa do Emitir DFD com a prévia e a operação TROCADA na Centi: reaprende da tela e emite", async () => {
  let op = 0;
  const pedidos: string[] = [];
  const pedir = async (acao: string, dados: unknown) => {
    pedidos.push(acao);
    const d = dados as { caminho: string };
    if (acao === "ler") return { ok: true, j: d.caminho === caminhoLoadPlanejamento("24") ? previa(24) : { Entity: null, Message: null } };
    if (acao === "estado") return { ok: true, operacao: { moduleKey: 130000, guid: "11111111-2222-3333-4444-555555555555" } };
    if (acao === "pedir")
      return op === 0
        ? { ok: true, b64: Buffer.from(JSON.stringify({ Success: false, Message: "Usuário sem permissão!" })).toString("base64"), status: 200 }
        : { ok: true, b64: Buffer.from("%PDF-1.4 teste").toString("base64"), status: 200 };
    return { ok: true };
  };
  const c = { pedir: pedir as never, cfg: () => lerConfigCenti(null), aplicarOperacao: () => (op++ === 0), mapa: () => ({}), cadastradas: () => ({}), definirEntidade: () => {} };
  const r = await emitirUm(c, "24", "3");
  assert.ok(r.pdf, r.erro);
  assert.equal(r.semSecoes810, true);
  assert.equal(r.secoes810NaoLidas, true);
  assert.deepEqual(pedidos, ["ler", "pedir", "estado", "pedir"]);
});

test("load sem a Entity (o envelope da Centi 217 sem registro, devolvido cru): NÃO abriu — nada é emitido", async () => {
  const { c, pedidos } = centiFalsa({ [caminhoLoadPlanejamento("24")]: { Data: null, Count: 0, Success: true, Message: "" } });
  const r = await emitirUm(c, "24", "3");
  assert.equal(r.pdf, undefined);
  assert.match(r.erro ?? "", /Não consegui abrir o planejamento 24 na Centi \(órgão 3\)/);
  assert.equal(pedidos.filter((p) => p.acao === "pedir").length, 0, "nunca emitido como se o planejamento tivesse sido lido");
});

test("centro de custo: o texto da referência (Display › o registro ligado) e o NÃO LIDO separado do 'não tem'", async () => {
  const { centroCustoLidoNoLoad, dadosDoPlanejamento } = await import("../src/lib/automacao-centi-core.ts");
  const comCentro = (v: unknown) => ({ Entity: { Fields: [{ Key: "IdCentroCusto", Value: v }, { Key: "Id", Value: "24" }] } });
  // Sem o Display: o caminho do registro ligado (a estrutura real do 17/11 — Object.Caminho).
  const semDisplay = comCentro(ref(75, [{ Key: "Object", Value: { ModuleKey: 103729, Fields: [{ Key: "Nome", Value: "FUNDO" }, { Key: "Caminho", Value: "FUNDO MUNICIPAL DE SAUDE" }] } }]));
  assert.equal(dadosDoPlanejamento(semDisplay).centroCusto, "FUNDO MUNICIPAL DE SAUDE");
  assert.equal(centroCustoLidoNoLoad(semDisplay), true);
  assert.equal(centroCustoLidoNoLoad(loadDaTela(131, 114)), true);
  // Não lido: o campo não veio, ou a referência com um Id e sem texto.
  assert.equal(centroCustoLidoNoLoad(previa(24)), false);
  assert.equal(centroCustoLidoNoLoad(comCentro(ref(75))), false);
  // Lido e vazio (a Centi não tem): Id 0 ou nulo.
  assert.equal(centroCustoLidoNoLoad(comCentro(ref(0))), true);
  assert.equal(centroCustoLidoNoLoad(comCentro(null)), true);
});
