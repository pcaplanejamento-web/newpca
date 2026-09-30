import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMINIO_INSTITUCIONAL, emailInstitucional, nomeCompleto } from "../src/lib/cadastro-core.ts";
import {
  conferirCodigoRegistro,
  esperaReenvio,
  gerarCodigo,
  hashCodigo,
  MAX_TENTATIVAS_CODIGO,
  REENVIO_CODIGO_S,
} from "../src/lib/codigo-email-core.ts";
import { emailCodigo, enderecoDosAvisos, lerPrefsEmail } from "../src/lib/email-core.ts";

describe("cadastro institucional", () => {
  it("e-mail: só o domínio institucional (caixa e espaços não importam)", () => {
    assert.equal(DOMINIO_INSTITUCIONAL, "rioverde.go.gov.br");
    assert.equal(emailInstitucional(" Ana.Souza@RioVerde.go.gov.br "), true);
    assert.equal(emailInstitucional("ana@gmail.com"), false);
    assert.equal(emailInstitucional("ana@sub.rioverde.go.gov.br"), false);
    assert.equal(emailInstitucional("ana@rioverde.go.gov.br.evil.com"), false);
    assert.equal(emailInstitucional("@rioverde.go.gov.br"), false);
    assert.equal(emailInstitucional("a b@rioverde.go.gov.br"), false);
  });

  it("nome completo: nome e sobrenome", () => {
    assert.equal(nomeCompleto("Ana Souza"), true);
    assert.equal(nomeCompleto("  Maria  de  Souza "), true);
    assert.equal(nomeCompleto("Ana"), false);
    assert.equal(nomeCompleto("Ana S"), false);
    assert.equal(nomeCompleto(""), false);
  });
});

describe("código de confirmação por e-mail", () => {
  it("6 dígitos, com zeros à esquerda; o sorteio rejeita o topo (sem viés)", () => {
    for (let i = 0; i < 200; i++) assert.match(gerarCodigo(), /^\d{6}$/);
    let n = 0;
    const falso = (b: Uint32Array) => {
      b[0] = n++ === 0 ? 4_294_967_295 : 42;
      return b;
    };
    assert.equal(gerarCodigo(falso), "000042");
    assert.equal(n, 2);
  });

  it("reenvio só depois do cronômetro", () => {
    const t = Date.parse("2026-09-30T12:00:00.000Z");
    assert.equal(esperaReenvio("2026-09-30T12:00:00.000Z", t), REENVIO_CODIGO_S);
    assert.equal(esperaReenvio("2026-09-30T12:00:00.000Z", t + 59_500), 1);
    assert.equal(esperaReenvio("2026-09-30T12:00:00.000Z", t + 60_000), 0);
    assert.equal(esperaReenvio("lixo", t), 0);
  });

  it("confere: certo, errado, expirado, bloqueado e inexistente; amarrado ao e-mail e à finalidade", async () => {
    const agora = Date.parse("2026-09-30T12:00:00.000Z");
    const reg = { codigoHash: await hashCodigo("a@x.com", "cadastro", "123456"), tentativas: 0, expiraEm: "2026-09-30T12:10:00.000Z" };
    assert.equal(await conferirCodigoRegistro(reg, "a@x.com", "cadastro", "123456", agora), "ok");
    assert.equal(await conferirCodigoRegistro(reg, " A@X.COM", "cadastro", "123456", agora), "ok");
    assert.equal(await conferirCodigoRegistro(reg, "a@x.com", "cadastro", "123457", agora), "incorreto");
    assert.equal(await conferirCodigoRegistro(reg, "a@x.com", "senha", "123456", agora), "incorreto");
    assert.equal(await conferirCodigoRegistro(reg, "b@x.com", "cadastro", "123456", agora), "incorreto");
    assert.equal(await conferirCodigoRegistro(reg, "a@x.com", "cadastro", "123456", agora + 11 * 60_000), "expirado");
    assert.equal(await conferirCodigoRegistro({ ...reg, tentativas: MAX_TENTATIVAS_CODIGO }, "a@x.com", "cadastro", "123456", agora), "bloqueado");
    assert.equal(await conferirCodigoRegistro(null, "a@x.com", "cadastro", "123456", agora), "inexistente");
  });

  it("e-mail do código: o código em destaque (escapado) e a validade", () => {
    const c = emailCodigo({ codigo: "012345", finalidade: "cadastro", validadeMin: 10 }, { urlSistema: "https://x", nomeSistema: "PCA" });
    assert.match(c.assunto, /^012345/);
    assert.match(c.html, /012345/);
    assert.match(c.texto, /10 minutos/);
  });
});

describe("destino dos avisos por e-mail", () => {
  it("institucional por padrão; a conta Google só quando escolhida E vinculada", () => {
    assert.equal(lerPrefsEmail(null).destino, "institucional");
    assert.equal(lerPrefsEmail({ destino: "google" }).destino, "google");
    assert.equal(lerPrefsEmail({ destino: "outro" }).destino, "institucional");
    assert.equal(enderecoDosAvisos(lerPrefsEmail({ destino: "google" }), "a@rioverde.go.gov.br", "a@gmail.com"), "a@gmail.com");
    assert.equal(enderecoDosAvisos(lerPrefsEmail({ destino: "google" }), "a@rioverde.go.gov.br", null), "a@rioverde.go.gov.br");
    assert.equal(enderecoDosAvisos(lerPrefsEmail(null), "a@rioverde.go.gov.br", "a@gmail.com"), "a@rioverde.go.gov.br");
  });
});
