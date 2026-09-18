import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aplicarSinonimos,
  classificarAssunto,
  comportamentoDe,
  comportamentoNo,
  corImportancia,
  editavelDe,
  IMPORTANCIAS_PADRAO,
  type Importancia,
  importanciaDe,
  importanciasDe,
  nivelDe,
  type RegrasAvaliacao,
  regrasPadrao,
  sinonimosDe,
} from "../src/lib/avaliacao-core.ts";
import { avaliarDfd, estadoCor, normalizarSecoesDfd } from "../src/lib/dfd-tratamento.ts";
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

describe("classificarAssunto (categorias FIXAS)", () => {
  it("casa INCLUSÃO / EXCLUSÃO / ALTERAÇÃO NÃO ONEROSA (palavra da capa)", () => {
    assert.equal(classificarAssunto("INCLUSÃO - PCA"), "inclusao");
    assert.equal(classificarAssunto("EXCLUSÃO de itens"), "exclusao");
    assert.equal(classificarAssunto("ALTERAÇÃO NÃO ONEROSA DO PCA"), "alteracao-nao-onerosa");
  });
  it("devolve null quando nada casa ou está vazio", () => {
    assert.equal(classificarAssunto("Assunto qualquer"), null);
    assert.equal(classificarAssunto(""), null);
    assert.equal(classificarAssunto(null), null);
  });
});

describe("editável e ajuste automático por palavras-chave", () => {
  it("editavelDe: padrão editável; false trava; campo sem suporte segue editável", () => {
    assert.equal(editavelDe(regrasPadrao(), "dfd.previsao"), true);
    assert.equal(editavelDe({ ...regrasPadrao(), editaveis: { "dfd.previsao": false } }, "dfd.previsao"), false);
    assert.equal(editavelDe({ ...regrasPadrao(), editaveis: {} }, "dfd.anoPca"), true); // sem suportaEdicao
  });
  it("aplicarSinonimos: casa termo (acentos/caixa ignorados) → valor canônico", () => {
    const regras = [{ termos: ["urgente", "imediato"], valor: "ALTA" }];
    assert.equal(aplicarSinonimos("PRIORIDADE URGENTE", regras), "ALTA");
    assert.equal(aplicarSinonimos("nada aqui", regras), null);
    assert.equal(sinonimosDe(regrasPadrao(), "dfd.prioridade").length, 0);
  });
  it("normalizarSecoesDfd aplica sinônimos do ADM quando o ponto é automático", () => {
    const dfd = {
      numero: "1",
      secoes: [{ numero: 6, titulo: "PRIORIDADE DA COMPRA", texto: "compra urgentíssima" }],
      itens: [],
    } as unknown as Parameters<typeof normalizarSecoesDfd>[0];
    const regras: RegrasAvaliacao = {
      ...regrasPadrao(),
      pontos: { "dfd.prioridade": "automatico" },
      sinonimos: { "dfd.prioridade": [{ termos: ["URGENT"], valor: "ALTA" }] },
    };
    const { dfd: out, auto } = normalizarSecoesDfd(dfd, regras);
    const sec = out.secoes.find((s) => s.numero === 6);
    assert.equal(sec?.texto, "ALTA");
    assert.ok(auto.includes("prioridade"));
  });
});

const CRITICO: Importancia = { id: "critico", nome: "Crítico", cor: "#e11d48", comportamento: "bloqueia", ordem: 5 };

describe("importâncias configuráveis (modelo unificado)", () => {
  it("importanciasDe garante SEMPRE as 4 base + customizadas ordenadas", () => {
    assert.deepEqual(
      importanciasDe(regrasPadrao()).map((i) => i.id),
      ["fundamental", "intermediario", "automatico", "ignorar"],
    );
    const r: RegrasAvaliacao = { ...regrasPadrao(), importancias: [...IMPORTANCIAS_PADRAO, CRITICO] };
    assert.ok(importanciasDe(r).some((i) => i.id === "critico"));
  });
  it("importanciaDe: id inexistente cai em 'ignora' (fallback seguro, nunca bloqueia)", () => {
    assert.equal(importanciaDe(regrasPadrao(), "xyz").comportamento, "ignora");
    assert.equal(comportamentoDe(regrasPadrao(), "xyz"), "ignora");
  });
  it("built-in mantém o comportamento fixo mesmo se o gravado tentar mudar (nome/cor valem)", () => {
    const r: RegrasAvaliacao = {
      ...regrasPadrao(),
      importancias: [{ id: "fundamental", nome: "Bloqueante", cor: "#000000", comportamento: "ignora", ordem: 1 }],
    };
    const f = importanciasDe(r).find((i) => i.id === "fundamental");
    assert.equal(f?.comportamento, "bloqueia"); // comportamento base preservado
    assert.equal(f?.nome, "Bloqueante"); // nome do gravado
    assert.equal(f?.cor, "#000000"); // cor do gravado
  });
  it("importância custom que bloqueia eleva um ponto a erro (bloqueante)", () => {
    const r: RegrasAvaliacao = {
      ...regrasPadrao(),
      importancias: [...IMPORTANCIAS_PADRAO, CRITICO],
      pontos: { "dfd.reparticao": "critico" },
    };
    assert.equal(comportamentoNo(r, "dfd.reparticao"), "bloqueia");
    const d = { ...dfdCompleto(), reparticaoId: null };
    assert.ok(avaliarDfd(d, r).bloqueantes.includes("unidade vinculada"));
  });
  it("cor da importância segue o gravado; o estado de severidade puxa dela", () => {
    const r: RegrasAvaliacao = {
      ...regrasPadrao(),
      importancias: [{ id: "fundamental", nome: "Fundamental", cor: "#123456", comportamento: "bloqueia", ordem: 1 }],
    };
    assert.equal(corImportancia(r, "fundamental"), "#123456");
    assert.equal(estadoCor("erro", r), "#123456"); // erro puxa a cor da importância base "bloqueia"
    assert.equal(estadoCor("erro"), "var(--danger)"); // sem regras = token de hoje
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
      pontos: { "protocolo.numero": "ignorar" }, // não permitido p/ esse ponto (só "fundamental")
    };
    assert.equal(nivelDe(r, "protocolo.numero"), "fundamental");
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
      "unidade vinculada",
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
    assert.equal(r.bloqueantes.includes("unidade vinculada"), false);
    assert.ok(r.atencoes.includes("unidade vinculada"));
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
    assert.ok(avaliarDfd(d, regras, { categoria: "inclusao" }).bloqueantes.includes("unidade vinculada"));
  });
});
