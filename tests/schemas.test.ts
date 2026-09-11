import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminUsuarioSchema,
  cadastroSchema,
  perfilSchema,
  trocarSenhaSchema,
} from "../src/lib/auth-validation.ts";
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
