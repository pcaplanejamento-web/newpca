import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  capaSchema,
  criarPcaEspacoSchema,
  editarPcaEspacoSchema,
  acaoItensPcaSchema,
  acaoProtocolosPcaSchema,
  visaoOrcamentoSchema,
} from "../src/lib/pca-espaco-validation.ts";
import {
  adminUsuarioSchema,
  cadastroSchema,
  perfilSchema,
  trocarSenhaSchema,
} from "../src/lib/auth-validation.ts";
import {
  cadastrarPcaSchema,
  dfdOpSchema,
  editarDfdSchema,
  editarPcaSchema,
  faltasObrigatorias,
  gerarPcaSchema,
  patchPcaSchema,
  startProtocoloSchema,
  vincularDfdSchema,
} from "../src/lib/dfd-validation.ts";
import { avaliacaoSchema } from "../src/lib/avaliacao-validation.ts";
import { uploadSchema } from "../src/lib/validation.ts";

// Observação: os schemas de protocolos/tabelas vivem em módulos que também
// importam o acesso ao D1 (getDb → @opennextjs/cloudflare), então não são
// testáveis de forma isolada no Node ainda. Separá-los em módulos só-schema é
// um próximo passo de DRY para habilitar esses testes.

describe("auth-validation", () => {
  it("cadastroSchema normaliza e-mail e exige senha >= 8", () => {
    const r = cadastroSchema.parse({ nome: " Ana ", email: "  ANA@X.COM ", senha: "12345678" });
    assert.equal(r.email, "ana@x.com");
    assert.equal(r.nome, "Ana");
    assert.equal(cadastroSchema.safeParse({ nome: "Ana", email: "ana@x.com", senha: "1234" }).success, false);
  });

  it("perfilSchema valida foto (data-url) e aceita vazio p/ limpar", () => {
    assert.equal(perfilSchema.safeParse({ nome: "Ana", email: "a@x.com" }).success, true);
    assert.equal(
      perfilSchema.safeParse({ nome: "Ana", email: "a@x.com", foto: "data:image/png;base64,AAAA" }).success,
      true,
    );
    assert.equal(perfilSchema.safeParse({ nome: "Ana", email: "a@x.com", foto: "" }).success, true);
    assert.equal(perfilSchema.safeParse({ nome: "Ana", email: "a@x.com", foto: "http://x/a.png" }).success, false);
  });

  it("trocarSenhaSchema exige nova senha >= 8", () => {
    assert.equal(trocarSenhaSchema.safeParse({ senhaAtual: "x", novaSenha: "12345678" }).success, true);
    assert.equal(trocarSenhaSchema.safeParse({ senhaAtual: "x", novaSenha: "123" }).success, false);
  });

  it("adminUsuarioSchema: todos opcionais, role/status por enum", () => {
    assert.equal(adminUsuarioSchema.safeParse({}).success, true);
    assert.equal(adminUsuarioSchema.safeParse({ role: "gestor" }).success, true);
    assert.equal(adminUsuarioSchema.safeParse({ role: "root" }).success, false);
  });
});

describe("validation (upload em lotes)", () => {
  it("start exige o PCA (lista pronta) que recebe a planilha", () => {
    assert.equal(uploadSchema.safeParse({ mode: "start", codigo: "123", rows: [{ nomeProduto: "X" }] }).success, false);
  });

  it("start exige código e preenche município padrão", () => {
    const r = uploadSchema.parse({ mode: "start", pcaId: 1, codigo: "123", rows: [{ nomeProduto: "X" }] });
    assert.equal(r.mode, "start");
    if (r.mode === "start") assert.equal(r.municipio, "MUNICÍPIO NÃO INFORMADO");
  });

  it("append exige unidadeId positivo", () => {
    assert.equal(uploadSchema.safeParse({ mode: "append", unidadeId: 1, rows: [{ nomeProduto: "X" }] }).success, true);
    assert.equal(uploadSchema.safeParse({ mode: "append", unidadeId: 0, rows: [{ nomeProduto: "X" }] }).success, false);
  });

  it("rejeita lote vazio e modo desconhecido", () => {
    assert.equal(uploadSchema.safeParse({ mode: "start", pcaId: 1, codigo: "1", rows: [] }).success, false);
    assert.equal(uploadSchema.safeParse({ mode: "outro", rows: [{}] }).success, false);
  });
});

describe("dfd-validation", () => {
  it("dfdOpSchema start-dfd: exige numero e ao menos 1 item (rows)", () => {
    assert.equal(
      dfdOpSchema.safeParse({ mode: "start-dfd", numero: "1586", rows: [{ item: 1, valorUnitario: 2 }] }).success,
      true,
    );
    assert.equal(dfdOpSchema.safeParse({ mode: "start-dfd", numero: "", rows: [{ item: 1 }] }).success, false);
    assert.equal(dfdOpSchema.safeParse({ mode: "start-dfd", numero: "1", rows: [] }).success, false);
  });

  it("assinatura ADICIONADA pela equipe (manual): só data real dd/mm/aaaa, não futura (ou nenhuma)", () => {
    const comAss = (data: string, fonte = "manual") =>
      editarDfdSchema.safeParse({ assinaturas: [{ nome: "FULANO", fonte, data, validacao: { por: "equipe", responsavel: "FULANO" } }] }).success;
    assert.equal(comAss("12/03/2026"), true);
    assert.equal(comAss(""), true);
    assert.equal(comAss("31/02/2026"), false);
    assert.equal(comAss("12/03/2999"), false);
    assert.equal(comAss("2026-03-12"), false);
    // As lidas do PDF mantêm o formato próprio (hora, fuso) — sem essa régua.
    assert.equal(comAss("31/08/2026 16:20:00 -03:00", "dropsigner"), true);
  });

  it("dfdOpSchema start-dfd: coerce de numero + protocoloId/totalItens opcionais", () => {
    const r = dfdOpSchema.parse({
      mode: "start-dfd",
      numero: 1586,
      reparticaoId: 3,
      protocoloId: 7,
      totalItens: 1200,
      rows: [{ item: 1 }],
    });
    assert.equal(r.mode, "start-dfd");
    if (r.mode === "start-dfd") {
      assert.equal(r.numero, "1586");
      assert.equal(r.protocoloId, 7);
      assert.equal(r.totalItens, 1200);
    }
  });

  it("dfdOpSchema start-dfd: aceita anoPca (2000–2100) e referências de renovação", () => {
    const r = dfdOpSchema.parse({
      mode: "start-dfd",
      numero: "959",
      anoPca: 2027,
      numeroContrato: "860/2025",
      numeroAta: null,
      numeroLicitacao: null,
      rows: [{ item: 1, valorUnitario: 2 }],
    });
    if (r.mode === "start-dfd") {
      assert.equal(r.anoPca, 2027);
      assert.equal(r.numeroContrato, "860/2025");
    }
    // anoPca fora da faixa é rejeitado.
    assert.equal(dfdOpSchema.safeParse({ mode: "start-dfd", numero: "1", anoPca: 1999, rows: [{ item: 1 }] }).success, false);
    assert.equal(dfdOpSchema.safeParse({ mode: "start-dfd", numero: "1", anoPca: 2101, rows: [{ item: 1 }] }).success, false);
  });

  it("editarDfdSchema aceita referências de renovação (DFD-R) e exige ao menos um campo", () => {
    assert.equal(editarDfdSchema.safeParse({ numeroContrato: "860/2025" }).success, true);
    assert.equal(editarDfdSchema.safeParse({ numeroAta: null }).success, true);
    assert.equal(editarDfdSchema.safeParse({ reparticaoId: 3 }).success, true);
    assert.equal(editarDfdSchema.safeParse({}).success, false); // nada para editar
  });

  it("dfdOpSchema start-dfd: teto de totalItens (anti-abuso)", () => {
    assert.equal(dfdOpSchema.safeParse({ mode: "start-dfd", numero: "1", totalItens: 100000, rows: [{ item: 1 }] }).success, true);
    assert.equal(dfdOpSchema.safeParse({ mode: "start-dfd", numero: "1", totalItens: 100001, rows: [{ item: 1 }] }).success, false);
  });

  it("dfdOpSchema append-dfd-itens: dfdId positivo + desde >=0 + rows", () => {
    assert.equal(
      dfdOpSchema.safeParse({ mode: "append-dfd-itens", dfdId: 5, desde: 200, rows: [{ item: 2 }] }).success,
      true,
    );
    assert.equal(dfdOpSchema.safeParse({ mode: "append-dfd-itens", dfdId: 0, desde: 0, rows: [{ item: 1 }] }).success, false);
    assert.equal(dfdOpSchema.safeParse({ mode: "append-dfd-itens", dfdId: 5, desde: -1, rows: [{ item: 1 }] }).success, false);
  });

  it("gerarPcaSchema exige nome e dfdIds positivos não-vazios", () => {
    assert.equal(gerarPcaSchema.safeParse({ nome: "PCA 2026", dfdIds: [1, 2] }).success, true);
    assert.equal(gerarPcaSchema.safeParse({ nome: "", dfdIds: [1] }).success, false);
    assert.equal(gerarPcaSchema.safeParse({ nome: "X", dfdIds: [] }).success, false);
    assert.equal(gerarPcaSchema.safeParse({ nome: "X", dfdIds: [0] }).success, false);
  });

  it("cadastrarPcaSchema exige nome; ano é opcional e limitado a 2000–2100", () => {
    assert.equal(cadastrarPcaSchema.safeParse({ nome: "PCA 2026", ano: 2026 }).success, true);
    assert.equal(cadastrarPcaSchema.safeParse({ nome: "PCA 2026" }).success, true);
    assert.equal(cadastrarPcaSchema.safeParse({ nome: "" }).success, false);
    assert.equal(cadastrarPcaSchema.safeParse({ nome: "X", ano: 1999 }).success, false);
    assert.equal(cadastrarPcaSchema.safeParse({ nome: "X", ano: 2101 }).success, false);
    // não cadastra por registro leve unindo DFDs (isso é do gerarPcaSchema).
    assert.equal("dfdIds" in cadastrarPcaSchema.parse({ nome: "X" }), false);
  });

  it("editarPcaSchema aceita nome e/ou ano, mas exige ao menos um campo", () => {
    assert.equal(editarPcaSchema.safeParse({ nome: "Novo nome" }).success, true);
    assert.equal(editarPcaSchema.safeParse({ ano: 2027 }).success, true);
    assert.equal(editarPcaSchema.safeParse({ ano: null }).success, true);
    assert.equal(editarPcaSchema.safeParse({}).success, false);
    assert.equal(editarPcaSchema.safeParse({ nome: "" }).success, false);
  });

  it("patchPcaSchema: marca ativo ({ativo:true}) OU edita nome/ano", () => {
    assert.equal(patchPcaSchema.safeParse({ ativo: true }).success, true);
    assert.equal(patchPcaSchema.safeParse({ nome: "PCA 2026" }).success, true);
    assert.equal(patchPcaSchema.safeParse({ ano: 2026 }).success, true);
    assert.equal(patchPcaSchema.safeParse({ ativo: false }).success, false); // só true ativa
    assert.equal(patchPcaSchema.safeParse({}).success, false);
  });

  it("startProtocoloSchema exige o numero do protocolo (capa)", () => {
    assert.equal(startProtocoloSchema.safeParse({ mode: "start-protocolo", protocolo: { numero: "144/2026" } }).success, true);
    assert.equal(startProtocoloSchema.safeParse({ mode: "start-protocolo", protocolo: { numero: "" } }).success, false);
  });

  it("startProtocoloSchema aceita o anoPca da capa (2000–2100)", () => {
    const r = startProtocoloSchema.parse({ mode: "start-protocolo", protocolo: { numero: "144/2026", anoPca: 2027 } });
    assert.equal(r.protocolo.anoPca, 2027);
    assert.equal(
      startProtocoloSchema.safeParse({ mode: "start-protocolo", protocolo: { numero: "1", anoPca: 1800 } }).success,
      false,
    );
  });

  it("vincularDfdSchema aceita id positivo ou null (desvincular)", () => {
    assert.equal(vincularDfdSchema.safeParse({ protocoloId: 5 }).success, true);
    assert.equal(vincularDfdSchema.safeParse({ protocoloId: null }).success, true);
    assert.equal(vincularDfdSchema.safeParse({ protocoloId: 0 }).success, false);
  });
});

describe("avaliacaoSchema (regras de avaliação do ADM)", () => {
  it("aceita níveis permitidos por ponto e exceções por tipo/categoria", () => {
    assert.equal(avaliacaoSchema.safeParse({ pontos: { "dfd.previsao": "ignorar" } }).success, true);
    assert.equal(
      avaliacaoSchema.safeParse({ exDfd: { "DFD-R": { "dfd.referenciaRenovacao": "fundamental" } } }).success,
      true,
    );
    assert.equal(
      avaliacaoSchema.safeParse({ exProtocolo: { exclusao: { "protocolo.valorCapa": "ignorar" } } }).success,
      true,
    );
  });
  it("recusa ponto desconhecido e nível não permitido", () => {
    assert.equal(avaliacaoSchema.safeParse({ pontos: { "dfd.inexistente": "ignorar" } }).success, false);
    // protocolo.numero só permite "fundamental" (identificador imutável) — "ignorar" é recusado.
    assert.equal(avaliacaoSchema.safeParse({ pontos: { "protocolo.numero": "ignorar" } }).success, false);
  });
  it("recusa tipo de DFD desconhecido nas exceções", () => {
    assert.equal(avaliacaoSchema.safeParse({ exDfd: { "DFD-X": { "dfd.previsao": "ignorar" } } }).success, false);
  });
  it("editaveis só aceita pontos editáveis; booleano", () => {
    assert.equal(avaliacaoSchema.safeParse({ editaveis: { "dfd.previsao": false } }).success, true);
    assert.equal(avaliacaoSchema.safeParse({ editaveis: { "dfd.anoPca": false } }).success, false); // não editável
  });
  it("sinonimos só em pontos com ajuste automático; termos + valor", () => {
    assert.equal(
      avaliacaoSchema.safeParse({ sinonimos: { "dfd.prioridade": [{ termos: ["URGENTE"], valor: "ALTA" }] } }).success,
      true,
    );
    assert.equal(
      avaliacaoSchema.safeParse({ sinonimos: { "dfd.reparticao": [{ termos: ["x"], valor: "y" }] } }).success,
      false,
    ); // sem suporte a automático
    assert.equal(
      avaliacaoSchema.safeParse({ sinonimos: { "dfd.prioridade": [{ termos: ["x"], valor: "" }] } }).success,
      false,
    ); // valor vazio
  });
  it("importâncias: aceita id kebab + cor hex + comportamento; recusa id/cor inválidos", () => {
    const ok = { importancias: [{ id: "critico", nome: "Crítico", cor: "#e11d48", comportamento: "bloqueia", ordem: 5 }] };
    assert.equal(avaliacaoSchema.safeParse(ok).success, true);
    // id com maiúsculas
    assert.equal(
      avaliacaoSchema.safeParse({ importancias: [{ id: "Critico", nome: "X", cor: "#e11d48", comportamento: "bloqueia", ordem: 5 }] }).success,
      false,
    );
    // cor não-hex
    assert.equal(
      avaliacaoSchema.safeParse({ importancias: [{ id: "critico", nome: "X", cor: "vermelho", comportamento: "bloqueia", ordem: 5 }] }).success,
      false,
    );
  });
  it("importâncias: built-in não pode trocar de comportamento", () => {
    assert.equal(
      avaliacaoSchema.safeParse({ importancias: [{ id: "fundamental", nome: "F", cor: "#dc2626", comportamento: "ignora", ordem: 1 }] }).success,
      false,
    );
  });
  it("ponto usa importância custom do MESMO payload; recusa comportamento não permitido", () => {
    const critico = { id: "critico", nome: "Crítico", cor: "#e11d48", comportamento: "bloqueia", ordem: 5 };
    // custom "bloqueia" é permitido em dfd.reparticao (aceita bloqueia/avisa/ignora)
    assert.equal(avaliacaoSchema.safeParse({ importancias: [critico], pontos: { "dfd.reparticao": "critico" } }).success, true);
    // um ponto que só aceita "bloqueia" (protocolo.numero) recusa uma importância que avisa
    const brando = { id: "brando", nome: "Brando", cor: "#ca8a04", comportamento: "avisa", ordem: 6 };
    assert.equal(avaliacaoSchema.safeParse({ importancias: [brando], pontos: { "protocolo.numero": "brando" } }).success, false);
    // importância não declarada em lugar nenhum → recusa
    assert.equal(avaliacaoSchema.safeParse({ pontos: { "dfd.reparticao": "fantasma" } }).success, false);
  });
  it("estadosCiclo: aceita nome+cor dos 4 estados; recusa estado desconhecido", () => {
    assert.equal(avaliacaoSchema.safeParse({ estadosCiclo: { editado: { nome: "Alterado", cor: "#2563eb" } } }).success, true);
    assert.equal(avaliacaoSchema.safeParse({ estadosCiclo: { inexistente: { nome: "X", cor: "#2563eb" } } }).success, false);
    assert.equal(avaliacaoSchema.safeParse({ estadosCiclo: { editado: { nome: "X", cor: "azul" } } }).success, false);
  });
});

describe("faltasObrigatorias (regras de import de DFD)", () => {
  const completo = {
    reparticaoId: 3,
    tipo: "DFD-S",
    itens: [{ valorUnitario: 100 }, { valorUnitario: 50 }],
    secoes: [
      { titulo: "JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO", texto: "x" },
      { titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "JANEIRO/2027" },
      { titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", texto: "Alto" },
      { titulo: "FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133" },
    ],
  };

  it("DFD completo → nenhuma falta (pode importar)", () => {
    assert.deepEqual(faltasObrigatorias(completo), []);
  });

  it("bloqueia sem valor unitário em algum item", () => {
    const f = faltasObrigatorias({ ...completo, itens: [{ valorUnitario: 100 }, { valorUnitario: null }] });
    assert.ok(f.some((x) => /valor unit/i.test(x)));
  });

  it("bloqueia sem unidade", () => {
    assert.ok(faltasObrigatorias({ ...completo, reparticaoId: null }).some((x) => /unidade/i.test(x)));
  });

  it("bloqueia sem justificativa/previsão/prioridade/fundamentação", () => {
    assert.equal(faltasObrigatorias({ ...completo, secoes: [] }).length, 4);
  });

  it("seção PREENCHIDA mas fora do padrão também bloqueia (mesma régua do Tratamento)", () => {
    const secoes = [
      { titulo: "JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO", texto: "x" },
      { titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "IMEDIATO" },
      { titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", texto: "URGENTÍSSIMA" },
      { titulo: "FUNDAMENTAÇÃO LEGAL", texto: "BAIXA" },
    ];
    const f = faltasObrigatorias({ ...completo, secoes });
    assert.equal(f.length, 3);
    assert.ok(!f.some((x) => /justificativa/i.test(x)));
  });

  it("'12 MESES - PCA 2027' é previsão ANUAL válida", () => {
    const secoes = completo.secoes.map((s) => (s.titulo.startsWith("PREVIS") ? { ...s, texto: "12 MESES - PCA 2027." } : s));
    assert.deepEqual(faltasObrigatorias({ ...completo, secoes }), []);
  });
});


describe("pca-espaco-validation", () => {
  it("criar exige nome, ano válido e fonte", () => {
    assert.equal(criarPcaEspacoSchema.safeParse({ nome: "PCA 2027", ano: 2027, fonte: "protocolo" }).success, true);
    assert.equal(criarPcaEspacoSchema.safeParse({ nome: "PCA", ano: 1999, fonte: "lista" }).success, false);
    assert.equal(criarPcaEspacoSchema.safeParse({ nome: "PCA", ano: 2027, fonte: "x" }).success, false);
  });
  it("editar exige algo e aceita capa só como data-URL de imagem", () => {
    assert.equal(editarPcaEspacoSchema.safeParse({}).success, false);
    assert.equal(editarPcaEspacoSchema.safeParse({ status: "publicado" }).success, true);
    assert.equal(editarPcaEspacoSchema.safeParse({ capa: null }).success, true);
    assert.equal(capaSchema.safeParse("data:image/webp;base64,AAAA").success, true);
    assert.equal(capaSchema.safeParse("javascript:alert(1)").success, false);
    assert.equal(capaSchema.safeParse("data:image/svg+xml;base64,AAAA").success, false);
  });
  it("ações da Mesa do PCA (enviar/devolver/incorporar — sem desincorporar: é permanente)", () => {
    assert.equal(acaoProtocolosPcaSchema.safeParse({ acao: "incorporar", ids: [1], acoes: { "1": "substituir" } }).success, true);
    assert.equal(acaoProtocolosPcaSchema.safeParse({ acao: "enviar", ids: [] }).success, false);
    assert.equal(acaoProtocolosPcaSchema.safeParse({ acao: "incorporar", ids: [1], acoes: { "1": "apagar" } }).success, false);
    assert.equal(acaoProtocolosPcaSchema.safeParse({ acao: "mover", ids: [1] }).success, false);
    for (const acao of ["enviar", "devolver"]) assert.equal(acaoProtocolosPcaSchema.safeParse({ acao, ids: [3] }).success, true);
    assert.equal(acaoProtocolosPcaSchema.safeParse({ acao: "desincorporar", ids: [3] }).success, false);
  });
  it("retirar itens do PCA (≤ 100)", () => {
    assert.equal(acaoItensPcaSchema.safeParse({ acao: "retirar", ids: [1, 2] }).success, true);
    assert.equal(acaoItensPcaSchema.safeParse({ acao: "retirar", ids: [] }).success, false);
    assert.equal(acaoItensPcaSchema.safeParse({ acao: "retirar", ids: Array.from({ length: 101 }, (_, i) => i + 1) }).success, false);
  });
  it("visão: nome + filtros só das dimensões conhecidas", () => {
    const r = visaoOrcamentoSchema.parse({ nome: "PCA", filtros: { nomeElemento: ["MATERIAL"], lixo: ["x"] } });
    assert.deepEqual(r.filtros, { nomeElemento: ["MATERIAL"] });
    assert.equal(visaoOrcamentoSchema.safeParse({ nome: "", filtros: {} }).success, false);
  });
});
