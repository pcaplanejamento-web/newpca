import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceConfigAutomacao,
  CONFIG_AUTOMACAO_PADRAO,
  estadoFinal,
  motivoNaoEscrever,
  podeTransitar,
  RECEITAS,
  receitaAtiva,
  textoAlvoAnexo,
} from "../src/lib/automacao-core.ts";
import { autorizarSchema, configAutomacaoSchema, consumirSchema, criarExecucaoSchema } from "../src/lib/automacao-validation.ts";

describe("automação — núcleo", () => {
  it("configuração: qualquer JSON vira válida; receita desconhecida e operação inválida são descartadas", () => {
    assert.deepEqual(coerceConfigAutomacao(null), CONFIG_AUTOMACAO_PADRAO);
    const c = coerceConfigAutomacao({
      ativa: false,
      receitas: { "anexar-dfds": { ativa: false }, inventada: { ativa: true }, "emitir-dfd": { ativa: "sim" } },
      operacao: { moduleKey: 120465, guid: "24E3E9D0-cb29-2473-1d0a-318c7d8507ef", assinatura: "16a3", em: "2026-10-02" },
    });
    assert.equal(c.ativa, false);
    assert.deepEqual(c.receitas, { "anexar-dfds": { ativa: false } });
    assert.deepEqual(c.operacao, { moduleKey: 120465, guid: "24e3e9d0-cb29-2473-1d0a-318c7d8507ef", assinatura: "163", em: "2026-10-02" });
    assert.equal(coerceConfigAutomacao({ operacao: { moduleKey: -1, guid: "x" } }).operacao, null);
  });

  it("negado por padrão: só receitas disponíveis e ligadas; escrita só com freio solto e capacidade declarada", () => {
    const cfg = CONFIG_AUTOMACAO_PADRAO;
    assert.equal(receitaAtiva(cfg, "anexar-dfds"), true);
    assert.equal(receitaAtiva(cfg, "tramitar-protocolo"), false, "prevista não roda");
    assert.equal(receitaAtiva({ ...cfg, receitas: { "tramitar-protocolo": { ativa: true } } }, "tramitar-protocolo"), false, "nem ligada à força");
    assert.equal(motivoNaoEscrever(cfg, "anexar-dfds", "anexar"), null);
    assert.match(motivoNaoEscrever({ ...cfg, ativa: false }, "anexar-dfds", "anexar") ?? "", /PAUSADA/);
    assert.match(motivoNaoEscrever(cfg, "emitir-dfd", "anexar") ?? "", /não escreve/);
    assert.match(motivoNaoEscrever(cfg, "anexar-dfds", "operar") ?? "", /desconhecida/);
    assert.match(motivoNaoEscrever({ ...cfg, receitas: { "anexar-dfds": { ativa: false } } }, "anexar-dfds", "anexar") ?? "", /desligada/);
    for (const r of RECEITAS.filter((x) => !x.disponivel)) assert.ok(!r.capacidades.includes("anexar"), r.id);
  });

  it("execução: transições e estado final pelos passos", () => {
    assert.ok(podeTransitar("preparada", "rodando"));
    assert.ok(podeTransitar("falhou", "rodando"), "retomar");
    assert.ok(!podeTransitar("concluida", "rodando"));
    assert.ok(!podeTransitar("cancelada", "rodando"));
    assert.equal(estadoFinal([{ estado: "ok" }, { estado: "fila" }]), null);
    assert.equal(estadoFinal([{ estado: "ok" }, { estado: "pulado" }]), "concluida");
    assert.equal(estadoFinal([{ estado: "ok" }, { estado: "falhou" }]), "falhou");
  });

  it("alvo da escrita: forma canônica (só dígitos nos códigos; descrição sem caixa nem espaços repetidos)", () => {
    const a = textoAlvoAnexo({ id: "2332778", numero: "156844", ano: "2026", descricao: " PGM - pca  2027 " });
    assert.equal(a, "anexar|2332778|156844|2026|PGM - PCA 2027");
    assert.equal(textoAlvoAnexo({ id: "2332778", numero: "156844", ano: null, descricao: "x" }), "anexar|2332778|156844||X");
  });

  it("validação: tetos firmes e só o que é conhecido", () => {
    assert.ok(configAutomacaoSchema.safeParse({ ativa: false }).success);
    assert.ok(!configAutomacaoSchema.safeParse({ ativa: false, outra: 1 }).success, "chave desconhecida");
    assert.ok(!criarExecucaoSchema.safeParse({ receita: "x", ensaio: true, passos: [{ chave: "a", capacidade: "anexar", alvo: null }] }).success);
    assert.ok(
      !criarExecucaoSchema.safeParse({
        receita: "anexar-dfds",
        ensaio: true,
        passos: [
          { chave: "a", capacidade: "anexar", alvo: null },
          { chave: "a", capacidade: "anexar", alvo: null },
        ],
      }).success,
      "passo repetido",
    );
    assert.ok(!criarExecucaoSchema.safeParse({ receita: "anexar-dfds", ensaio: true, passos: [{ chave: "a", capacidade: "excluir", alvo: null }] }).success);
    const alvo = { id: "2332778", numero: "156844", ano: "2026", descricao: "PGM" };
    assert.ok(autorizarSchema.safeParse({ chave: "a", capacidade: "anexar", alvo }).success);
    assert.ok(!autorizarSchema.safeParse({ chave: "a", capacidade: "operar", alvo }).success, "só capacidade de escrita");
    assert.ok(!consumirSchema.safeParse({ token: "curto", capacidade: "anexar", alvo }).success);
  });
});
