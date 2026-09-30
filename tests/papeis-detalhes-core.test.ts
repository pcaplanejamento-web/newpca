import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alternarColunaOculta,
  CATALOGO_COLUNAS_MESA,
  coerceDetalhes,
  colunasOcultaveis,
  compactarDetalhes,
  contarRestricoes,
  DETALHES_PADRAO,
  detalhesDoJson,
  detalhesPadrao,
  diffDetalhes,
  MODELOS_DETALHES,
  restringeAlgo,
  resumoDetalhes,
  SUBACOES_MESA,
  TABELAS_MESA,
  TELAS_EDICOES,
  TELAS_HISTORICO,
  textoDiffDetalhes,
  textoResumoDetalhes,
} from "../src/lib/papeis-detalhes-core.ts";

describe("detalhes do papel — padrão, normalização e implicações", () => {
  it("{} e lixo = o padrão (= o comportamento de antes): nada oculto, todas as linhas, tudo liberado", () => {
    for (const bruto of [{}, null, undefined, "x", 3, [], { mesa: "x" }, { mesa: { responsavel: 7 } }]) assert.deepEqual(coerceDetalhes(bruto), DETALHES_PADRAO);
    const p = detalhesPadrao();
    assert.equal(p.mesa.responsavel.ver, true);
    assert.equal(p.mesa.responsavel.alterar, "grupo");
    assert.equal(p.mesa.linhas, "todos");
    for (const s of SUBACOES_MESA) assert.equal(p.mesa.alteracoes[s], true);
    for (const t of TELAS_HISTORICO) assert.equal(p.historico[t], "completo");
    for (const t of TELAS_EDICOES) assert.deepEqual(p.edicoes[t], { personalizar: true, publicar: true, moderar: true });
    assert.deepEqual(detalhesDoJson("{inválido"), DETALHES_PADRAO); // não lança
    assert.deepEqual(detalhesDoJson(null), DETALHES_PADRAO);
  });

  it("é idempotente e canônico (ordem do catálogo, sem repetir)", () => {
    const d = coerceDetalhes({ mesa: { colunasOcultas: { protocolos: ["data", "estado", "data", "xyz"] } } });
    assert.deepEqual(d.mesa.colunasOcultas.protocolos, ["estado", "data"]);
    assert.deepEqual(coerceDetalhes(d), d);
    assert.deepEqual(coerceDetalhes(JSON.parse(JSON.stringify(d))), d);
  });

  it("colunas fixas e de controle próprio nunca entram na lista de ocultas", () => {
    const d = coerceDetalhes({ mesa: { colunasOcultas: { protocolos: ["numero", "responsavel", "distribuicao", "valor", "situacao"], itens: ["codigo", "vunit"] } } });
    assert.deepEqual(d.mesa.colunasOcultas.protocolos, ["situacao"]);
    assert.deepEqual(d.mesa.colunasOcultas.itens, []);
  });

  it("implicações: não ver o Responsável ⇒ não altera; sem Responsável e sem Distribuição ⇒ sem desempenho", () => {
    const a = coerceDetalhes({ mesa: { responsavel: { ver: false, alterar: "grupo" } } });
    assert.equal(a.mesa.responsavel.alterar, "nao");
    assert.equal(a.mesa.desempenho, true); // a Distribuição segue à vista
    const b = coerceDetalhes({ mesa: { responsavel: { ver: false }, distribuicao: false, desempenho: true } });
    assert.equal(b.mesa.desempenho, false);
  });

  it("implicações: Situação oculta ⇒ não altera a Situação; Valores ocultos ⇒ não altera itens nem capa", () => {
    const a = coerceDetalhes({ mesa: { colunasOcultas: { protocolos: ["situacao"] } } });
    assert.equal(a.mesa.alteracoes.situacao, false);
    const b = coerceDetalhes({ mesa: { valores: false } });
    assert.equal(b.mesa.alteracoes.itens, false);
    assert.equal(b.mesa.alteracoes.capa, false);
    assert.equal(b.mesa.alteracoes.dfd, true);
  });

  it("implicações: sem personalizar ⇒ sem publicar nem moderar", () => {
    const d = coerceDetalhes({ edicoes: { dfd: { personalizar: false, publicar: true, moderar: true } } });
    assert.deepEqual(d.edicoes.dfd, { personalizar: false, publicar: false, moderar: false });
    assert.deepEqual(d.edicoes.pca, { personalizar: true, publicar: true, moderar: true });
  });

  it("níveis desconhecidos caem no padrão", () => {
    const d = coerceDetalhes({ mesa: { responsavel: { alterar: "tudo" }, linhas: "algumas", dadosPessoais: "x" }, historico: { dfd: "meio" } });
    assert.equal(d.mesa.responsavel.alterar, "grupo");
    assert.equal(d.mesa.linhas, "todos");
    assert.equal(d.mesa.dadosPessoais, "ver");
    assert.equal(d.historico.dfd, "completo");
  });
});

describe("detalhes do papel — compacto, diff e resumo", () => {
  it("o compacto do padrão é {} e a volta devolve o mesmo", () => {
    assert.deepEqual(compactarDetalhes(DETALHES_PADRAO), {});
    const d = coerceDetalhes({
      mesa: { responsavel: { alterar: "si" }, linhas: "meus", colunasOcultas: { dfds: ["assinatura"] }, alteracoes: { vincular: false } },
      historico: { tarefas: "anonimo" },
      edicoes: { orcamento: { publicar: false } },
    });
    const c = compactarDetalhes(d);
    assert.deepEqual(c, {
      mesa: { colunasOcultas: { dfds: ["assinatura"] }, responsavel: { alterar: "si" }, linhas: "meus", alteracoes: { vincular: false } },
      historico: { tarefas: "anonimo" },
      edicoes: { orcamento: { publicar: false } },
    });
    assert.deepEqual(coerceDetalhes(c), d);
    assert.deepEqual(coerceDetalhes(JSON.parse(JSON.stringify(c))), d);
  });

  it("diff: o que mudou e se restringe", () => {
    const antes = detalhesPadrao();
    const depois = coerceDetalhes({ mesa: { responsavel: { ver: false }, linhas: "meus" } });
    const diff = diffDetalhes(antes, depois);
    const ids = diff.map((d) => d.id);
    assert.ok(ids.includes("mesa.responsavel.ver"));
    assert.ok(ids.includes("mesa.responsavel.alterar")); // implicação
    assert.ok(ids.includes("mesa.linhas"));
    assert.ok(diff.every((d) => d.restringe));
    assert.equal(restringeAlgo(diff), true);
    assert.equal(restringeAlgo(diffDetalhes(depois, antes)), false);
    assert.match(textoDiffDetalhes(diff), /^Mesa: Responsável Visível → Oculto/);
    assert.deepEqual(diffDetalhes(antes, antes), []);
  });

  it("resumo: só os desvios; colunas por tabela numa linha; padrão = sem restrições", () => {
    assert.deepEqual(resumoDetalhes({}), []);
    assert.equal(textoResumoDetalhes({}), "Sem restrições");
    assert.equal(contarRestricoes({}), 0);
    const d = coerceDetalhes({ mesa: { distribuicao: false, colunasOcultas: { protocolos: ["estado", "data"] } } });
    const r = resumoDetalhes(d);
    assert.deepEqual(
      r.map((l) => `${l.rotulo}: ${l.valor}`),
      ["Distribuição: Oculto", "Colunas ocultas (Protocolos): Estado, Data da protocolação"],
    );
    assert.equal(contarRestricoes(d), 2);
    assert.match(textoResumoDetalhes(d), /^Mesa — Distribuição: Oculto; Colunas ocultas/);
  });

  it("alternar coluna: só as ocultáveis", () => {
    let d = alternarColunaOculta(DETALHES_PADRAO, "itens", "catalogo", true);
    assert.deepEqual(d.mesa.colunasOcultas.itens, ["catalogo"]);
    d = alternarColunaOculta(d, "itens", "codigo", true);
    assert.deepEqual(d.mesa.colunasOcultas.itens, ["catalogo"]);
    d = alternarColunaOculta(d, "itens", "catalogo", false);
    assert.deepEqual(d.mesa.colunasOcultas.itens, []);
  });

  it("modelos normalizados", () => {
    for (const m of MODELOS_DETALHES) assert.deepEqual(coerceDetalhes(m.detalhes), m.detalhes);
    const meus = MODELOS_DETALHES.find((m) => m.id === "meus");
    assert.equal(meus?.detalhes.mesa.linhas, "meus");
    assert.equal(meus?.detalhes.mesa.responsavel.alterar, "si");
  });
});

describe("catálogo das colunas das Mesas", () => {
  it("chaves únicas por tabela; toda coluna fixa tem o motivo; controle próprio só em 'dado'", () => {
    for (const t of TABELAS_MESA) {
      const chaves = CATALOGO_COLUNAS_MESA[t].map((c) => c.chave);
      assert.equal(new Set(chaves).size, chaves.length, t);
      for (const c of CATALOGO_COLUNAS_MESA[t]) {
        if (c.classe === "fixa") assert.ok(c.motivo, `${t}.${c.chave} sem motivo`);
        if (c.controle) assert.equal(c.classe, "dado", `${t}.${c.chave}`);
      }
    }
  });

  it("identificadores são fixos (nunca ocultáveis)", () => {
    const fixa = (t: (typeof TABELAS_MESA)[number], k: string) => CATALOGO_COLUNAS_MESA[t].find((c) => c.chave === k)?.classe === "fixa";
    assert.ok(fixa("protocolos", "numero"));
    assert.ok(fixa("dfds", "numero"));
    assert.ok(fixa("dfds", "planejamento"));
    assert.ok(fixa("itens", "item"));
    assert.ok(fixa("itens", "codigo"));
    assert.ok(fixa("consolidada", "codigo"));
    assert.deepEqual(
      colunasOcultaveis("protocolos").map((c) => c.chave),
      ["estado", "situacao", "data"],
    );
  });
});
