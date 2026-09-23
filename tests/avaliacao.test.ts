import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aplicarSinonimos,
  assuntoCadastrado,
  classificarAssunto,
  coerceRegras,
  comportamentoDaFalta,
  comportamentoDe,
  comportamentoNo,
  corImportancia,
  editavelDe,
  gateProtocolo,
  IMPORTANCIAS_PADRAO,
  type Importancia,
  importanciaDe,
  importanciasDe,
  importarDfdHabilitado,
  nivelDe,
  opcoesAssunto,
  protocolarHabilitado,
  type RegrasAvaliacao,
  regrasPadrao,
  sinonimosDe,
  tipoPermitido,
} from "../src/lib/avaliacao-core.ts";
import { avaliacaoSchema } from "../src/lib/avaliacao-validation.ts";
import { avaliarDfd, estadoCor, mensagensDfd, normalizarSecoesDfd, resumoEstado } from "../src/lib/dfd-tratamento.ts";
import { faltasObrigatorias } from "../src/lib/dfd-validation.ts";

// Monta uma conferência de DFD completa (nada falta); os testes removem 1 coisa.
function dfdCompleto() {
  return {
    planejamento: "640" as string | null,
    reparticaoId: 3,
    tipo: "DFD-S — Solução / com ETP",
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
  it("mesma lista/ordem de hoje quando falta tudo (+ o tipo e o nº de planejamento, obrigatórios por padrão)", () => {
    const f = faltasObrigatorias({ planejamento: null, reparticaoId: null, itens: [], secoes: [] });
    assert.deepEqual(f, [
      "valor unitário em todos os itens",
      "número de planejamento",
      "unidade vinculada",
      "tipo do DFD (DFD-S/R/O/E)",
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

describe("avaliarDfd — tipo do DFD (configurável)", () => {
  it("sem tipo bloqueia por padrão; 'intermediario' vira atenção; 'ignorar' some", () => {
    const d = { ...dfdCompleto(), tipo: null };
    assert.ok(avaliarDfd(d).bloqueantes.includes("tipo do DFD (DFD-S/R/O/E)"));
    const avisa: RegrasAvaliacao = { ...regrasPadrao(), pontos: { "dfd.tipo": "intermediario" } };
    assert.ok(avaliarDfd(d, avisa).atencoes.includes("tipo do DFD (DFD-S/R/O/E)"));
    const ign: RegrasAvaliacao = { ...regrasPadrao(), pontos: { "dfd.tipo": "ignorar" } };
    assert.deepEqual(avaliarDfd(d, ign), { bloqueantes: [], atencoes: [] });
  });
  it("tipo selecionado pelo usuário (rótulo do seletor) é reconhecido", () => {
    assert.deepEqual(avaliarDfd({ ...dfdCompleto(), tipo: "DFD-O · Ordinário" }).bloqueantes, []);
  });
});

describe("avaliarDfd — nº de planejamento (configurável)", () => {
  it("sem planejamento (null, vazio ou só espaços) é ERRO por padrão; 'intermediario' vira atenção; 'ignorar' some", () => {
    for (const planejamento of [null, "", "   "]) {
      const d = { ...dfdCompleto(), planejamento };
      assert.ok(avaliarDfd(d).bloqueantes.includes("número de planejamento"));
      assert.ok(faltasObrigatorias(d).includes("número de planejamento"));
    }
    const d = { ...dfdCompleto(), planejamento: null };
    const avisa: RegrasAvaliacao = { ...regrasPadrao(), pontos: { "dfd.planejamento": "intermediario" } };
    assert.ok(avaliarDfd(d, avisa).atencoes.includes("número de planejamento"));
    const ign: RegrasAvaliacao = { ...regrasPadrao(), pontos: { "dfd.planejamento": "ignorar" } };
    assert.deepEqual(avaliarDfd(d, ign), { bloqueantes: [], atencoes: [] });
  });
  it("mensagem de ERRO apontada no bloco de identificação e célula Estado 'Sem planejamento'; com o nº, acerto", () => {
    const msgs = mensagensDfd({ ...dfdCompleto(), planejamento: null });
    const m = msgs.find((x) => x.chave === "dfd.planejamento");
    assert.equal(m?.status, "erro");
    assert.equal(m?.ancora, "anoPca");
    assert.equal(resumoEstado(msgs).rotulo, "Sem planejamento");
    assert.equal(mensagensDfd(dfdCompleto()).find((x) => x.chave === "dfd.planejamento")?.status, "acerto");
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

describe("trava de protocolação (assuntos + tipos + botões)", () => {
  it("config vazia ⇒ nada barra e botões ligados (comportamento de hoje)", () => {
    const r = regrasPadrao();
    assert.deepEqual(gateProtocolo("Qualquer assunto", ["DFD-S", "DFD-R"], r), { ok: true, motivos: [] });
    assert.equal(protocolarHabilitado(r), true);
    assert.equal(importarDfdHabilitado(r), true);
    assert.equal(tipoPermitido("DFD-S", r), true); // lista vazia = todos
    assert.equal(assuntoCadastrado("Aquisição de bens", r), false); // nenhum cadastrado
  });

  it("assuntoCadastrado: casa por norm-contains (acento/caixa)", () => {
    const r: RegrasAvaliacao = { ...regrasPadrao(), assuntos: [{ id: "a1", termo: "Aquisição" }] };
    assert.equal(assuntoCadastrado("AQUISICAO DE MATERIAL", r), true);
    assert.equal(assuntoCadastrado("Contratação de serviço", r), false);
  });

  it("tipoPermitido: respeita a lista quando há tipos configurados", () => {
    const r: RegrasAvaliacao = { ...regrasPadrao(), tiposProtocolo: ["DFD-S", "DFD-O"] };
    assert.equal(tipoPermitido("DFD-S", r), true);
    assert.equal(tipoPermitido("DFD-R", r), false);
    assert.equal(tipoPermitido(null, r), false);
  });

  it("gateProtocolo: exige assunto cadastrado (bloqueia o protocolo inteiro)", () => {
    const r: RegrasAvaliacao = {
      ...regrasPadrao(),
      assuntos: [{ id: "a1", termo: "Aquisição" }],
      gate: { exigirAssunto: true },
    };
    assert.equal(gateProtocolo("Aquisição de X", ["DFD-S"], r).ok, true);
    const bad = gateProtocolo("Contratação de Y", ["DFD-S"], r);
    assert.equal(bad.ok, false);
    assert.ok(bad.motivos[0].includes("Assunto"));
  });

  it("gateProtocolo: exige tipo permitido em TODOS os DFDs + aponta os fora", () => {
    const r: RegrasAvaliacao = {
      ...regrasPadrao(),
      tiposProtocolo: ["DFD-S"],
      gate: { exigirTipo: true },
    };
    assert.equal(gateProtocolo("x", ["DFD-S", "DFD-S"], r).ok, true);
    const bad = gateProtocolo("x", ["DFD-S", "DFD-R", null], r);
    assert.equal(bad.ok, false);
    assert.ok(bad.motivos[0].includes("DFD-R"));
    assert.ok(bad.motivos[0].includes("sem tipo"));
  });

  it("botões: gate.protocolarHabilitado/importarDfdHabilitado=false desligam", () => {
    const r: RegrasAvaliacao = { ...regrasPadrao(), gate: { protocolarHabilitado: false, importarDfdHabilitado: false } };
    assert.equal(protocolarHabilitado(r), false);
    assert.equal(importarDfdHabilitado(r), false);
  });

  it("coerceRegras + avaliacaoSchema: round-trip das novas chaves", () => {
    const bruto = {
      assuntos: [{ id: "a1", termo: "Aquisição" }],
      tiposProtocolo: ["DFD-S"],
      gate: { exigirAssunto: true, exigirTipo: true, protocolarHabilitado: false },
    };
    const r = coerceRegras(bruto);
    assert.deepEqual(r.assuntos, bruto.assuntos);
    assert.deepEqual(r.tiposProtocolo, ["DFD-S"]);
    assert.equal(r.gate?.exigirAssunto, true);
    // O schema (corpo do PATCH) aceita e preserva as chaves.
    const parsed = avaliacaoSchema.parse(bruto);
    assert.deepEqual(parsed.assuntos, bruto.assuntos);
    assert.deepEqual(parsed.tiposProtocolo, ["DFD-S"]);
    assert.equal(parsed.gate?.protocolarHabilitado, false);
    // Tipo inválido é rejeitado pelo schema.
    assert.throws(() => avaliacaoSchema.parse({ tiposProtocolo: ["DFD-X"] }));
  });
});

describe("opcoesAssunto (seletor do assunto do protocolo)", () => {
  it("atual + categorias fixas + cadastrados, sem repetir (norm)", () => {
    const r: RegrasAvaliacao = { ...regrasPadrao(), assuntos: [{ id: "a", termo: "Inclusão" }, { id: "b", termo: "Revisão do PCA" }] };
    assert.deepEqual(opcoesAssunto(r, "INCLUSÃO - PCA"), ["INCLUSÃO - PCA", "INCLUSÃO", "EXCLUSÃO", "ALTERAÇÃO NÃO ONEROSA", "Revisão do PCA"]);
  });
  it("sem atual → só as opções", () => {
    assert.deepEqual(opcoesAssunto(regrasPadrao(), ""), ["INCLUSÃO", "EXCLUSÃO", "ALTERAÇÃO NÃO ONEROSA"]);
  });
});

describe("falta da PRIORIDADE = erro (Automático não rebaixa a falta)", () => {
  const semPrioridade = () => ({ ...dfdCompleto(), secoes: dfdCompleto().secoes.filter((x) => !x.titulo.includes("PRIORIDADE")) });
  const prioridadeInvalida = () => ({
    ...dfdCompleto(),
    anoPca: 2026,
    secoes: dfdCompleto().secoes.map((x) => (x.titulo.includes("PRIORIDADE") ? { ...x, texto: "A DEFINIR" } : x)),
  });
  const auto: RegrasAvaliacao = { ...regrasPadrao(), pontos: { "dfd.prioridade": "automatico" } };

  it("padrão (fundamental): falta de prioridade bloqueia", () => {
    assert.ok(avaliarDfd(semPrioridade()).bloqueantes.some((x) => x.includes("Seção 6")));
  });
  it("Automático: a FALTA (vazia) continua ERRO — bloqueia e vem como erro no painel", () => {
    assert.equal(comportamentoNo(auto, "dfd.prioridade"), "automatico");
    assert.equal(comportamentoDaFalta(auto, "dfd.prioridade"), "bloqueia");
    assert.ok(avaliarDfd(semPrioridade(), auto).bloqueantes.some((x) => x.includes("Seção 6")));
    const m = mensagensDfd(semPrioridade(), auto).find((x) => x.chave === "dfd.prioridade");
    assert.equal(m?.status, "erro");
    assert.equal(m?.cor, corImportancia(auto, "fundamental"));
    assert.ok(faltasObrigatorias(semPrioridade(), auto).some((x) => x.includes("Seção 6")));
  });
  it("Automático: prioridade FORA DO PADRÃO também é erro, com rótulo próprio no Estado", () => {
    const msgs = mensagensDfd(prioridadeInvalida(), auto);
    const m = msgs.find((x) => x.chave === "dfd.prioridade");
    assert.equal(m?.status, "erro");
    assert.equal(resumoEstado(msgs.filter((x) => x.status !== "acerto")).rotulo, "Prioridade inválida");
  });
  it("escolha EXPLÍCITA do ADM é respeitada: Intermediário avisa, Ignorar some", () => {
    const inter: RegrasAvaliacao = { ...regrasPadrao(), pontos: { "dfd.prioridade": "intermediario" } };
    assert.deepEqual(avaliarDfd(semPrioridade(), inter).bloqueantes, []);
    assert.ok(avaliarDfd(semPrioridade(), inter).atencoes.some((x) => x.includes("Seção 6")));
    const ign: RegrasAvaliacao = { ...regrasPadrao(), pontos: { "dfd.prioridade": "ignorar" } };
    assert.equal(mensagensDfd(semPrioridade(), ign).some((x) => x.chave === "dfd.prioridade"), false);
  });
  it("prioridade preenchida no Automático: acerto (nada muda)", () => {
    const m = mensagensDfd(dfdCompleto(), auto).find((x) => x.chave === "dfd.prioridade");
    assert.equal(m?.status, "acerto");
  });
  it("só a Prioridade tem a regra: a previsão no Automático segue avisando", () => {
    const d = { ...dfdCompleto(), secoes: dfdCompleto().secoes.filter((x) => !x.titulo.includes("PREVISÃO")) };
    const r: RegrasAvaliacao = { ...regrasPadrao(), pontos: { "dfd.previsao": "automatico" } };
    assert.equal(comportamentoDaFalta(r, "dfd.previsao"), "automatico");
    assert.ok(avaliarDfd(d, r).atencoes.some((x) => x.includes("Seção 5")));
  });
});
