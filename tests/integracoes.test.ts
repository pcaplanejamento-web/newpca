import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceIntegracoes,
  integracoesPadrao,
  monitoramentoAtivo,
  toView,
  turnstileConfigurado,
} from "../src/lib/integracoes-core.ts";
import { integracoesSchema } from "../src/lib/integracoes-validation.ts";

describe("integracoes-core", () => {
  it("padrão: tudo desligado / vazio", () => {
    const p = integracoesPadrao();
    assert.equal(p.turnstile.ativo, false);
    assert.equal(p.turnstile.secret, "");
    assert.equal(p.monitoramento.ativo, false);
  });

  it("coerceIntegracoes é tolerante a lixo e preenche defaults", () => {
    assert.deepEqual(coerceIntegracoes(undefined), integracoesPadrao());
    assert.deepEqual(coerceIntegracoes("nao-e-objeto"), integracoesPadrao());
    const c = coerceIntegracoes({ turnstile: { ativo: true, siteKey: "sk", secret: "cifra" } });
    assert.equal(c.turnstile.ativo, true);
    assert.equal(c.turnstile.siteKey, "sk");
    assert.equal(c.monitoramento.ativo, false);
  });

  it("toView NUNCA expõe o segredo (só `definido`)", () => {
    const v = toView(
      { turnstile: { ativo: true, siteKey: "sk", secret: "iv:ct" }, monitoramento: { ativo: true } },
      true,
    );
    assert.equal((v.turnstile as Record<string, unknown>).secret, undefined);
    assert.equal(v.turnstile.secretDefinido, true);
    assert.equal(v.temChaveMestra, true);
    // segredo vazio → definido = false
    assert.equal(toView(integracoesPadrao(), false).turnstile.secretDefinido, false);
  });

  it("turnstileConfigurado exige ativo + siteKey + secret; monitoramentoAtivo = flag", () => {
    assert.equal(turnstileConfigurado({ turnstile: { ativo: true, siteKey: "sk", secret: "c" }, monitoramento: { ativo: false } }), true);
    assert.equal(turnstileConfigurado({ turnstile: { ativo: true, siteKey: "sk", secret: "" }, monitoramento: { ativo: false } }), false);
    assert.equal(turnstileConfigurado({ turnstile: { ativo: false, siteKey: "sk", secret: "c" }, monitoramento: { ativo: false } }), false);
    assert.equal(monitoramentoAtivo({ turnstile: { ativo: false, siteKey: "", secret: "" }, monitoramento: { ativo: true } }), true);
  });
});

describe("integracoesSchema (PATCH)", () => {
  it("aceita vazio (defaults) e segredo opcional", () => {
    const r = integracoesSchema.parse({});
    assert.equal(r.turnstile.ativo, false);
    assert.equal(r.turnstile.secret, ""); // vazio = manter
    assert.equal(r.monitoramento.ativo, false);
  });
  it("aceita config completa do Turnstile", () => {
    const r = integracoesSchema.parse({
      turnstile: { ativo: true, siteKey: "sk", secret: "nova-secret" },
      monitoramento: { ativo: true },
    });
    assert.equal(r.turnstile.secret, "nova-secret");
    assert.equal(r.monitoramento.ativo, true);
  });
});
