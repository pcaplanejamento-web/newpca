import assert from "node:assert/strict";
import { test } from "node:test";
import { filtrarDfdsPelaTabela, valorDaColunaDfd, valoresConferencia, ROTULO_COM_NOTA, ROTULO_RESSALVA } from "../src/lib/dfd-colunas-valor.ts";
import { chaveRetomada, type DefNo, lerGrafo } from "../src/lib/fluxo-core.ts";
import { verificacoesDoNo } from "../src/lib/fluxo-dados.ts";
import { REGISTRO_NOS } from "../src/lib/fluxo-nos.ts";
import { modeloDoFluxo } from "../src/lib/fluxo-modelos.ts";

test("O que verificar: o padrão, as escolhas e os da ação da Mesa (só o conteúdo)", () => {
  assert.deepEqual(verificacoesDoNo({}, {}), { conteudo: true, corrigir: true, situacao: true, centro: true, trocarUnidade: false, semDfd: false });
  assert.deepEqual(verificacoesDoNo({ conteudo: false, corrigir: true, trocarUnidade: true }, {}), {
    conteudo: false,
    corrigir: false,
    situacao: true,
    centro: true,
    trocarUnidade: true,
    semDfd: false,
  });
  // O Reconferir da Mesa: só o conteúdo e sem corrigir; o Corrigir automaticamente corrige mesmo com a caixa desligada.
  assert.deepEqual(verificacoesDoNo({ corrigir: true, trocarUnidade: true }, { __verificacoes: ["conteudo"], __soConferir: true }), {
    conteudo: true,
    corrigir: false,
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
