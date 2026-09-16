import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CATEGORIAS_PADRAO,
  classificarAssunto,
  nivelDe,
  type RegrasAvaliacao,
  regrasPadrao,
} from "../src/lib/avaliacao-core.ts";
import { avaliarDfd } from "../src/lib/dfd-tratamento.ts";
import { faltasObrigatorias } from "../src/lib/dfd-validation.ts";

// Monta uma conferência de DFD completa (nada falta); os testes removem 1 coisa.
function dfdCompleto() {
  return {
    reparticaoId: 3,
    itens: [
      { valorUnitario: 100, quantidade: 2 },
      { valorUnitario: 50, quantidade: 1 },
    ],
    secoes: [
      { titulo: "JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO", texto: "x" },
      { titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "ANUAL" },
      { titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", texto: "ALTA" },
      { titulo: "FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" },
    ],
  };
}

describe("classificarAssunto", () => {
  it("casa INCLUSÃO / EXCLUSÃO / ALTERAÇÃO NÃO ONEROSA (texto livre da capa)", () => {
    assert.equal(classificarAssunto("INCLUSÃO - PCA", CATEGORIAS_PADRAO), "inclusao");
    assert.equal(classificarAssunto("Exclusão de itens", CATEGORIAS_PADRAO), "exclusao");
    assert.equal(
      classificarAssunto("ALTERAÇÃO NÃO ONEROSA DO PCA", CATEGORIAS_PADRAO),
      "alteracao-nao-onerosa",
    );
  });
  it("devolve null quando nada casa ou está vazio", () => {
    assert.equal(classificarAssunto("Assunto qualquer", CATEGORIAS_PADRAO), null);
    assert.equal(classificarAssunto("", CATEGORIAS_PADRAO), null);
    assert.equal(classificarAssunto(null, CATEGORIAS_PADRAO), null);
  });
});

describe("nivelDe (precedência exceção > global > padrão do catálogo)", () => {
  it("padrão do catálogo quando não há override", () => {
    assert.equal(nivelDe(regrasPadrao(), "dfd.previsao"), "fundamental");
    assert.equal(nivelDe(regrasPadrao(), "dfd.referenciaRenovacao"), "intermediario");
    assert.equal(nivelDe(regrasPadrao(), "item.quantidade"), "intermediario");
  });
  it("override global vence o padrão", () => {
    const r: RegrasAvaliacao = { ...regrasPadrao(), pontos: { "dfd.previsao": "ignorar" } };
    assert.equal(nivelDe(r, "dfd.previsao"), "ignorar");
  });
  it("exceção por tipo de DFD vence o global (só com o ctx do tipo)", () => {
    const r: RegrasAvaliacao = {
      ...regrasPadrao(),
      pontos: { "dfd.referenciaRenovacao": "ignorar" },
      exDfd: { "DFD-R": { "dfd.referenciaRenovacao": "fundamental" } },
    };
    assert.equal(nivelDe(r, "dfd.referenciaRenovacao", { dfdTipo: "DFD-R" }), "fundamental");
    assert.equal(nivelDe(r, "dfd.referenciaRenovacao", { dfdTipo: "DFD-S" }), "ignorar");
  });
  it("exceção por categoria de protocolo vence o global", () => {
    const r: RegrasAvaliacao = {
      ...regrasPadrao(),
      exProtocolo: { exclusao: { "protocolo.valorCapa": "ignorar" } },
    };
    assert.equal(nivelDe(r, "protocolo.valorCapa", { categoria: "exclusao" }), "ignorar");
    assert.equal(nivelDe(r, "protocolo.valorCapa", { categoria: "inclusao" }), "fundamental");
  });
  it("nível fora dos permitidos é ignorado (cai no padrão)", () => {
    const r: RegrasAvaliacao = {
      ...regrasPadrao(),
      pontos: { "dfd.valorEstimadoVsTotal": "fundamental" }, // não permitido p/ esse ponto
    };
    assert.equal(nivelDe(r, "dfd.valorEstimadoVsTotal"), "intermediario");
  });
});

describe("faltasObrigatorias — INVARIANTE: config padrão == comportamento de hoje", () => {
  it("DFD completo → nenhuma falta", () => {
    assert.deepEqual(faltasObrigatorias(dfdCompleto()), []);
  });
  it("mesma lista/ordem de hoje quando falta tudo", () => {
    const f = faltasObrigatorias({ reparticaoId: null, itens: [], secoes: [] });
    assert.deepEqual(f, [
      "valor unitário em todos os itens",
      "repartição vinculada",
      "Justificativa da necessidade (Seção 3)",
      "Previsão de entrega/execução (Seção 5)",
      "Prioridade da compra/contratação (Seção 6)",
      "Fundamentação legal (Seção 7)",
    ]);
  });
  it("quantidade faltando NÃO bloqueia por padrão (igual a hoje)", () => {
    const d = { ...dfdCompleto(), itens: [{ valorUnitario: 100, quantidade: null }] };
    assert.deepEqual(faltasObrigatorias(d), []);
  });
});

describe("avaliarDfd — níveis e exceções", () => {
  it("quantidade faltando vira ATENÇÃO por padrão (não bloqueia)", () => {
    const d = { ...dfdCompleto(), itens: [{ valorUnitario: 100, quantidade: null }] };
    const r = avaliarDfd(d);
    assert.deepEqual(r.bloqueantes, []);
    assert.ok(r.atencoes.includes("quantidade em todos os itens"));
  });
  it("ponto em 'ignorar' some do bloqueio", () => {
    const d = { ...dfdCompleto(), secoes: dfdCompleto().secoes.filter((s) => !s.titulo.includes("PREVISÃO")) };
    assert.ok(faltasObrigatorias(d).some((x) => x.includes("Seção 5")));
    const regras: RegrasAvaliacao = { ...regrasPadrao(), pontos: { "dfd.previsao": "ignorar" } };
    assert.equal(avaliarDfd(d, regras).bloqueantes.some((x) => x.includes("Seção 5")), false);
    assert.equal(avaliarDfd(d, regras).atencoes.some((x) => x.includes("Seção 5")), false);
  });
  it("ponto em 'intermediario' vira atenção (não bloqueia)", () => {
    const d = { ...dfdCompleto(), reparticaoId: null };
    const regras: RegrasAvaliacao = { ...regrasPadrao(), pontos: { "dfd.reparticao": "intermediario" } };
    const r = avaliarDfd(d, regras);
    assert.equal(r.bloqueantes.includes("repartição vinculada"), false);
    assert.ok(r.atencoes.includes("repartição vinculada"));
  });
  it("DFD-R sem referência: atenção por padrão; fundamental por exceção de tipo", () => {
    const d = { ...dfdCompleto(), tipo: "DFD-R — Renovação / Ata vigente" };
    assert.ok(avaliarDfd(d).atencoes.some((x) => x.includes("referência de renovação")));
    assert.deepEqual(avaliarDfd(d).bloqueantes, []);
    const regras: RegrasAvaliacao = {
      ...regrasPadrao(),
      exDfd: { "DFD-R": { "dfd.referenciaRenovacao": "fundamental" } },
    };
    assert.ok(avaliarDfd(d, regras).bloqueantes.some((x) => x.includes("referência de renovação")));
  });
  it("exceção por categoria de protocolo aplica só no contexto", () => {
    const d = { ...dfdCompleto(), reparticaoId: null };
    const regras: RegrasAvaliacao = {
      ...regrasPadrao(),
      exProtocolo: { exclusao: { "dfd.reparticao": "ignorar" } },
    };
    assert.deepEqual(avaliarDfd(d, regras, { categoria: "exclusao" }).bloqueantes, []);
    assert.ok(avaliarDfd(d, regras, { categoria: "inclusao" }).bloqueantes.includes("repartição vinculada"));
  });
});
