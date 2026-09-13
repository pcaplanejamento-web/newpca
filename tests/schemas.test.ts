import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminUsuarioSchema,
  cadastroSchema,
  perfilSchema,
  trocarSenhaSchema,
} from "../src/lib/auth-validation.ts";
import {
  dfdOpSchema,
  faltasObrigatorias,
  gerarPcaSchema,
  startProtocoloSchema,
  vincularDfdSchema,
} from "../src/lib/dfd-validation.ts";
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

  it("startProtocoloSchema exige o numero do protocolo (capa)", () => {
    assert.equal(startProtocoloSchema.safeParse({ mode: "start-protocolo", protocolo: { numero: "144/2026" } }).success, true);
    assert.equal(startProtocoloSchema.safeParse({ mode: "start-protocolo", protocolo: { numero: "" } }).success, false);
  });

  it("vincularDfdSchema aceita id positivo ou null (desvincular)", () => {
    assert.equal(vincularDfdSchema.safeParse({ protocoloId: 5 }).success, true);
    assert.equal(vincularDfdSchema.safeParse({ protocoloId: null }).success, true);
    assert.equal(vincularDfdSchema.safeParse({ protocoloId: 0 }).success, false);
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
