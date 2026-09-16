import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
  it("start exige código e preenche município padrão", () => {
    const r = uploadSchema.parse({ mode: "start", codigo: "123", rows: [{ nomeProduto: "X" }] });
    assert.equal(r.mode, "start");
    if (r.mode === "start") assert.equal(r.municipio, "MUNICÍPIO NÃO INFORMADO");
  });

  it("append exige unidadeId positivo", () => {
    assert.equal(uploadSchema.safeParse({ mode: "append", unidadeId: 1, rows: [{ nomeProduto: "X" }] }).success, true);
    assert.equal(uploadSchema.safeParse({ mode: "append", unidadeId: 0, rows: [{ nomeProduto: "X" }] }).success, false);
  });

  it("rejeita lote vazio e modo desconhecido", () => {
    assert.equal(uploadSchema.safeParse({ mode: "start", codigo: "1", rows: [] }).success, false);
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
    // valorEstimadoVsTotal não permite "fundamental"
    assert.equal(avaliacaoSchema.safeParse({ pontos: { "dfd.valorEstimadoVsTotal": "fundamental" } }).success, false);
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
});

describe("faltasObrigatorias (regras de import de DFD)", () => {
  const completo = {
    reparticaoId: 3,
    itens: [{ valorUnitario: 100 }, { valorUnitario: 50 }],
    secoes: [
      { titulo: "JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO", texto: "x" },
      { titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "y" },
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

  it("bloqueia sem repartição", () => {
    assert.ok(faltasObrigatorias({ ...completo, reparticaoId: null }).some((x) => /repartição/i.test(x)));
  });

  it("bloqueia sem justificativa/previsão/prioridade/fundamentação", () => {
    assert.equal(faltasObrigatorias({ ...completo, secoes: [] }).length, 4);
  });
});
