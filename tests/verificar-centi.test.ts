import assert from "node:assert/strict";
import { test } from "node:test";
import { filtrarDfdsPelaTabela, valorDaColunaDfd, valoresConferencia, ROTULO_COM_NOTA, ROTULO_RESSALVA } from "../src/lib/dfd-colunas-valor.ts";
import { chaveRetomada, type DefNo, lerGrafo } from "../src/lib/fluxo-core.ts";
import { verificacoesDoNo } from "../src/lib/fluxo-dados.ts";
import { REGISTRO_NOS } from "../src/lib/fluxo-nos.ts";
import { modeloDoFluxo } from "../src/lib/fluxo-modelos.ts";
import { aplicarCentiPorTipos, GRUPOS_CORRECAO, grupoDoTipo, lerGruposCorrecao, NAO_CORRIGIVEIS, restaForaDaEscolha, tiposDosGrupos } from "../src/lib/correcao-centi-core.ts";
import { versaoMaior } from "../src/lib/avisos-sistema-store.ts";
import { tiposDivergencia } from "../src/lib/conferencia-dfd-centi.ts";

test("O que verificar: o padrão, as escolhas e os da ação da Mesa (só o conteúdo)", () => {
  assert.deepEqual(verificacoesDoNo({}, {}), { conteudo: true, corrigir: true, grupos: null, situacao: true, centro: true, trocarUnidade: false, semDfd: false });
  assert.deepEqual(verificacoesDoNo({ conteudo: false, corrigir: true, trocarUnidade: true }, {}), {
    conteudo: false,
    corrigir: false,
    grupos: null,
    situacao: true,
    centro: true,
    trocarUnidade: true,
    semDfd: false,
  });
  // O Reconferir da Mesa: só o conteúdo e sem corrigir; o Corrigir automaticamente corrige mesmo com a caixa desligada.
  assert.deepEqual(verificacoesDoNo({ corrigir: true, trocarUnidade: true }, { __verificacoes: ["conteudo"], __soConferir: true }), {
    conteudo: true,
    corrigir: false,
    grupos: null,
    situacao: false,
    centro: false,
    trocarUnidade: false,
    semDfd: false,
  });
  assert.equal(verificacoesDoNo({ corrigir: false }, { __verificacoes: ["conteudo"], __corrigir: true }).corrigir, true);
});

test("retomada: as escolhas entram na chave — mudar o que verificar refaz o DFD", () => {
  const sim = { conteudo: "sim", situacao: "sim", centro: "nao", corrigir: "nao" };
  assert.equal(chaveRetomada({ id: 7, verificar: sim }, "id"), "7|conteudo+situacao");
  assert.notEqual(chaveRetomada({ id: 7, verificar: { ...sim, centro: "sim" } }, "id"), chaveRetomada({ id: 7, verificar: sim }, "id"));
  assert.equal(chaveRetomada({ id: 7 }, "id"), "7", "sem escolha (fluxo de outra forma): a chave de sempre");
});

test("colunas da planilha de DFDs: a régua pura do filtro e os filtros REAPLICADOS à lista de agora", () => {
  const linhas = [
    { numero: "1", planejamento: "10", sigla: "SEPLAN", tipo: "DFD-S", itens: 2, valor: 100, execucao: "Executado", conferencia: { status: "convergente", motivo: null } },
    { numero: "2", planejamento: "20", sigla: "GGIM", tipo: "DFD-R", itens: 1, valor: 50, conferencia: { status: "divergente", motivo: "DFD 2 (Planej. 20): 1 diferença — Valor total: R$ 50,00 no sistema × R$ 60,00 na Centi" } },
    { numero: "3", planejamento: "30", sigla: "GGIM", tipo: null, itens: 1, valor: 10, centroCusto: { texto: "PM RV, GGIM" } },
  ];
  assert.equal(valorDaColunaDfd("execucao", linhas[1]), "Não verificado");
  assert.equal(valorDaColunaDfd("centroCusto", linhas[0]), "Sem centro de custo");
  assert.equal(valorDaColunaDfd("tipo", linhas[2]), "—");
  assert.deepEqual(filtrarDfdsPelaTabela(linhas, { sigla: ["GGIM"] })?.map((l) => l.numero), ["2", "3"]);
  assert.deepEqual(filtrarDfdsPelaTabela(linhas, { conferenciaCenti: ["Divergente · Valor total"] })?.map((l) => l.numero), ["2"]);
  assert.deepEqual(filtrarDfdsPelaTabela(linhas, { valor: { min: 40, max: 100 } } as never)?.map((l) => l.numero), ["1", "2"]);
  assert.equal(filtrarDfdsPelaTabela(linhas, { assinatura: ["Centi"] }), null, "coluna sem régua pura: quem chama usa a reserva");
  assert.equal(filtrarDfdsPelaTabela(linhas, {})?.length, 3);
  // Convergente* e a ressalva no filtro da coluna Centi.
  assert.deepEqual(valoresConferencia("convergente", "DFD 1 (Planej. 1): Sem as seções 8 a 10 na Centi — x"), [ROTULO_COM_NOTA]);
  assert.equal(valoresConferencia("divergente", "x", false, true)[0], ROTULO_RESSALVA);
});

test("modelo do fluxo: pelo id gravado no diagrama (renomear não o perde); sem ele, pelo nome", () => {
  assert.equal(modeloDoFluxo({ nome: "Qualquer nome", grafo: lerGrafo({ nos: [], conexoes: [], modelo: "conferir-corrigir-centi" }) })?.id, "conferir-corrigir-centi");
  assert.equal(modeloDoFluxo({ nome: "Verificar DFDs na Centi", grafo: lerGrafo({ nos: [], conexoes: [] }) })?.id, "conferir-corrigir-centi");
  assert.equal(modeloDoFluxo({ nome: "Outro", grafo: null }), undefined);
});

test("Planejamentos da Centi sem DFD: só com a escolha; compara por planejamento + órgão com TODOS os DFDs; salva a tabela", async () => {
  const def = REGISTRO_NOS.get("centi.semDfd") as DefNo;
  const pedidos: unknown[] = [];
  const tabelas: unknown[] = [];
  const todos = [
    { id: 1, numero: "1", planejamento: "100", entidade: "2" },
    { id: 2, numero: "2", planejamento: "0200", entidade: "2" },
    { id: 3, numero: "3", planejamento: "300", entidade: "6" },
  ];
  const ctx = {
    centi: async (acao: string, d: { entidade: string }) => {
      pedidos.push([acao, d.entidade]);
      return d.entidade === "2"
        ? { ok: true, linhas: [{ id: "100", situacao: "Executado" }, { id: "200", situacao: "Executado" }, { id: "300", situacao: "Em elaboração" }] }
        : { ok: true, linhas: [] };
    },
    api: async (c: string, init?: { body?: unknown }) => {
      if (c.includes("/tabelas")) tabelas.push(init?.body);
      return { ok: true, total: 1, cortadas: 0 };
    },
    cancelado: () => false,
    aviso: () => {},
    host: { protocolos: [], __cache: new Map([["dfds", Promise.resolve(todos)]]) },
  } as never;
  const sim = { verificar: { semDfd: "sim" } };
  // Sem a escolha: não lê nem grava.
  assert.deepEqual((await def.executar({ entrada: [{ ...todos[0], verificar: { semDfd: "nao" } }] }, {}, ctx, {})).saida, []);
  assert.equal(pedidos.length, 0);
  // Com a escolha: o órgão 2 dos DFDs escolhidos; o 300 do órgão 2 não tem DFD (o DFD 3 é de OUTRO órgão).
  const r = await def.executar({ entrada: [{ ...todos[0], ...sim }, { ...todos[1], ...sim }] }, {}, ctx, {});
  assert.deepEqual(pedidos, [["cm002", "2"]], "uma leitura por órgão");
  assert.deepEqual(r.saida?.map((l) => l.planejamento), ["300"]);
  assert.equal((tabelas[0] as { nome: string; modo: string }).nome, "CM002 sem DFD no sistema");
  assert.equal((tabelas[0] as { modo: string }).modo, "substituir");
  // Sem órgão com o ID da Centi: aponta, não para a automação.
  const sem = await def.executar({ entrada: [{ id: 9, planejamento: "9", entidade: "", ...sim }] }, {}, ctx, {});
  assert.match(String((sem.__apontados ?? [])[0]?.mensagem), /ID da Centi/);
});

test("O que corrigir: cada tipo de divergência cai num grupo; os não corrigíveis em nenhum", () => {
  const exemplos = [
    "Objeto: “A” no sistema × “B” na Centi",
    "Setor requisitante: “X” no sistema × “Y” na Centi",
    "Tipo: DFD-S no sistema × DFD-R na Centi",
    "Seção 3 - JUSTIFICATIVA diferente",
    "Item 3 (52410) só na Centi",
    "Item 4 (99) só no sistema",
    "Item 1 (52410): quantidade 10 × 12, valor unitário 1,00 × 2,00 (sistema × Centi)",
    "Item 2 (52410): descricao A × B, codigo 1 × 2, medida UN × CX (sistema × Centi)",
    "Valor total: R$ 10,00 no sistema × R$ 12,00 na Centi",
    "Nº de itens: 3 no sistema × 4 na Centi",
  ];
  const tipos = [...new Set(exemplos.flatMap(tiposDivergencia))];
  for (const t of tipos) assert.ok(grupoDoTipo(t), `${t} sem grupo`);
  for (const t of NAO_CORRIGIVEIS) assert.equal(grupoDoTipo(t), null, t);
  assert.deepEqual(new Set(tipos.map(grupoDoTipo)), new Set(GRUPOS_CORRECAO.map((g) => g.valor)), "todos os grupos têm exemplo");
  assert.deepEqual(tiposDosGrupos(tipos, ["valores"]).sort(), ["Item: quantidade", "Item: valor unitário", "Valor total"].sort());
  // Todos os grupos (ou nenhum, ou lixo) = null (tudo); a escolha parcial vem limpa e sem repetir.
  assert.equal(lerGruposCorrecao(GRUPOS_CORRECAO.map((g) => g.valor)), null);
  assert.deepEqual(lerGruposCorrecao([]), [], "tudo desmarcado = nenhum");
  assert.equal(lerGruposCorrecao(["xyz"]), null);
  assert.deepEqual(lerGruposCorrecao(["valores", "valores", "secoes"]), ["valores", "secoes"]);
});

test("O que corrigir: os grupos chegam ao item, entram na retomada e só os valores corrigem SÓ os valores", () => {
  const v = verificacoesDoNo({ corrigirTipos: ["valores"] }, {});
  assert.deepEqual(v.grupos, ["valores"]);
  assert.equal(verificacoesDoNo({ corrigirTipos: ["valores"], corrigir: false }, {}).grupos, null, "sem corrigir, nada a escolher");
  assert.equal(verificacoesDoNo({ corrigirTipos: [] }, {}).corrigir, false, "nenhum tipo marcado = só confere");
  assert.equal(verificacoesDoNo({ corrigirTipos: ["valores"] }, { __verificacoes: ["conteudo"], __corrigir: true }).grupos, null, "a ação da Mesa corrige tudo");
  const sim = { conteudo: "sim", corrigir: "sim" };
  assert.notEqual(chaveRetomada({ id: 7, verificar: sim, corrigirGrupos: ["valores"] }, "id"), chaveRetomada({ id: 7, verificar: sim }, "id"));
  // O nó leva os grupos só quando são uma escolha.
  const def = REGISTRO_NOS.get("dados.filtrarConferencia") as DefNo;
  return Promise.all([
    def.executar({ entrada: [{ id: 1 }] }, { corrigirTipos: ["valores"] }, ctxFalso(), {} as never),
    def.executar({ entrada: [{ id: 1 }] }, {}, ctxFalso(), {} as never),
  ]).then(([a, b]) => {
    assert.deepEqual((a.saida as { corrigirGrupos?: string[] }[])[0].corrigirGrupos, ["valores"]);
    assert.equal((b.saida as { corrigirGrupos?: string[] }[])[0].corrigirGrupos, undefined);
  });
});

test("O que corrigir: o item que só existe na Centi NÃO entra quando só os valores foram escolhidos", () => {
  const base = { numero: "1", planejamento: "10", tipo: "DFD-S", objeto: "X", secoes: [], assinaturas: [], valorTotal: 10 } as never;
  const sist = { ...(base as object), itens: [{ item: 1, codigo: "1", descricao: "A", unidade: "UN", quantidade: 1, valorUnitario: 10, valorTotal: 10 }] };
  const plano = {
    tolerancia: 0.01,
    centi: { ...(base as object), itens: [{ item: 1, codigo: "1", descricao: "A", unidade: "UN", quantidade: 2, valorUnitario: 10, valorTotal: 20 }, { item: 2, codigo: "9", descricao: "N", unidade: "UN", quantidade: 1, valorUnitario: 5, valorTotal: 5 }] },
    entradas: [],
    divergentes: [
      { entrada: { tipo: "item", chave: "n:1" }, tipos: ["Item só na Centi", "Nº de itens", "Valor total"] },
      { entrada: { tipo: "item", chave: "a:0:0" }, tipos: ["Item: quantidade", "Valor total"] },
    ],
    pares: [[0, 0]],
  };
  const r = aplicarCentiPorTipos(sist as never, plano as never, ["Item: quantidade", "Valor total"], ["valores"]) as unknown as { itens: { quantidade: number }[] };
  assert.equal(r.itens.length, 1, "o item só da Centi não entrou");
  assert.equal(r.itens[0].quantidade, 2, "a quantidade foi corrigida");
});

function ctxFalso() {
  return { host: {}, aviso() {}, cancelado: () => false, api: async () => ({}) } as never;
}

test("O que corrigir: o que resta fora da escolha não é pendência (o total dos itens não escolhidos também)", () => {
  assert.deepEqual(restaForaDaEscolha(["Item só na Centi", "Nº de itens", "Valor total"], ["valores"]), ["Item só na Centi", "Nº de itens", "Valor total"]);
  assert.deepEqual(restaForaDaEscolha(["Valor total"], ["valores"]), [], "o total dentro da escolha segue pendência");
  assert.deepEqual(restaForaDaEscolha(["Seção X", "Situação"], ["valores"]), ["Seção X"], "o que a Centi não corrige não é escolha");
  assert.deepEqual(restaForaDaEscolha(["Seção X"], null), []);
});

test("versão nova: só a do servidor MAIOR avisa (um isolate antigo no deploy não)", () => {
  assert.equal(versaoMaior("1.298.0", "1.297.9"), true);
  assert.equal(versaoMaior("1.297.0", "1.298.0"), false);
  assert.equal(versaoMaior("1.298.0", "1.298.0"), false);
  assert.equal(versaoMaior("2.0.0", "1.999.99"), true);
});
