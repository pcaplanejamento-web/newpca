import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  base64Url,
  clientIdValido,
  decidirLoginGoogle,
  desafioPkce,
  iguaisTexto,
  lerContaLembrada,
  lerCookieGoogle,
  lerIdToken,
  mensagemErroLogin,
  podeVincular,
  redirectUri,
  SENHA_INUTILIZAVEL,
  urlAutorizacao,
  valorCookieGoogle,
} from "../src/lib/google-oauth-core.ts";
import { coerceIntegracoes, googleConfigurado, toView } from "../src/lib/integracoes-core.ts";
import { integracoesSchema } from "../src/lib/integracoes-validation.ts";
import { verificarSenha } from "../src/lib/password.ts";

const CID = "123-abc.apps.googleusercontent.com";
const jwt = (p: Record<string, unknown>) => `x.${base64Url(new TextEncoder().encode(JSON.stringify(p)))}.y`;
const base = { iss: "https://accounts.google.com", aud: CID, exp: 2000, sub: "42", email: "Ana@Gmail.com", email_verified: true, name: "Ana  Souza" };

describe("login com Google — núcleo", () => {
  it("URL de autorização: code + PKCE S256 + state + select_account; URI de volta sem barra dupla", () => {
    const u = new URL(urlAutorizacao({ clientId: CID, redirectUri: redirectUri("https://g.com/"), state: "s", desafio: "d" }));
    assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(u.searchParams.get("redirect_uri"), "https://g.com/api/auth/google/callback");
    assert.equal(u.searchParams.get("response_type"), "code");
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.equal(u.searchParams.get("scope"), "openid email profile");
    assert.equal(u.searchParams.get("state"), "s");
  });

  it("conta lembrada: entra direto nela (login_hint, sem escolher); sem ela, escolher a conta", () => {
    const com = new URL(urlAutorizacao({ clientId: CID, redirectUri: "https://g.com/cb", state: "s", desafio: "d", dica: "ana@gmail.com" }));
    assert.equal(com.searchParams.get("login_hint"), "ana@gmail.com");
    assert.equal(com.searchParams.get("prompt"), null);
    assert.equal(lerContaLembrada(" Ana@Gmail.com "), "ana@gmail.com");
    assert.equal(lerContaLembrada("<script>@x"), null);
    assert.equal(lerContaLembrada(undefined), null);
  });

  it("quem entra: a conta VINCULADA (mesmo com outro e-mail) › o mesmo e-mail (e vincula) › outra conta = recusa › novo", () => {
    assert.deepEqual(decidirLoginGoogle("42", { id: 7, googleSub: "42" }, null), { tipo: "entrar", id: 7, vincular: false });
    assert.deepEqual(decidirLoginGoogle("42", null, { id: 3, googleSub: null }), { tipo: "entrar", id: 3, vincular: true });
    assert.deepEqual(decidirLoginGoogle("42", null, { id: 3, googleSub: "42" }), { tipo: "entrar", id: 3, vincular: false });
    assert.deepEqual(decidirLoginGoogle("42", null, { id: 3, googleSub: "99" }), { tipo: "outra-conta" });
    assert.deepEqual(decidirLoginGoogle("42", null, null), { tipo: "novo" });
    assert.equal(podeVincular(3, null), true);
    assert.equal(podeVincular(3, { id: 3, googleSub: "42" }), true);
    assert.equal(podeVincular(3, { id: 9, googleSub: "42" }), false);
  });

  it("PKCE: o desafio do RFC 7636 (exemplo do apêndice B)", async () => {
    assert.equal(await desafioPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("cookie curto: ida e volta; lixo = nulo; state em tempo constante", () => {
    const s = "a".repeat(43);
    const v = "b".repeat(43);
    assert.deepEqual(lerCookieGoogle(valorCookieGoogle(s, v)), { state: s, verificador: v, modo: "entrar" });
    assert.deepEqual(lerCookieGoogle(valorCookieGoogle(s, v, "vincular")), { state: s, verificador: v, modo: "vincular" });
    // o formato antigo (sem o modo) segue valendo como "entrar"
    assert.deepEqual(lerCookieGoogle(`${s}.${v}`), { state: s, verificador: v, modo: "entrar" });
    assert.equal(lerCookieGoogle("x.y"), null);
    assert.equal(lerCookieGoogle(undefined), null);
    assert.equal(iguaisTexto("abc", "abc"), true);
    assert.equal(iguaisTexto("abc", "abd"), false);
  });

  it("id_token: aceita o válido (e-mail minúsculo, nome limpo) e recusa emissor, público, vencido e e-mail não verificado", () => {
    const r = lerIdToken(jwt(base), CID, 1990);
    assert.deepEqual(r, { ok: true, identidade: { sub: "42", email: "ana@gmail.com", nome: "Ana Souza" } });
    assert.equal(lerIdToken(jwt({ ...base, iss: "https://mal.com" }), CID, 1990).ok, false);
    assert.equal(lerIdToken(jwt({ ...base, aud: "outro" }), CID, 1990).ok, false);
    assert.equal(lerIdToken(jwt(base), CID, 2100).ok, false);
    assert.equal(lerIdToken(jwt({ ...base, email_verified: false }), CID, 1990).ok, false);
    assert.equal(lerIdToken("nada", CID, 1990).ok, false);
  });

  it("a senha de quem entrou pelo Google nunca confere", async () => {
    assert.equal(await verificarSenha("", SENHA_INUTILIZAVEL), false);
    assert.equal(await verificarSenha("google$sem-senha", SENHA_INUTILIZAVEL), false);
  });

  it("mensagens da volta: conhecidas e desconhecidas", () => {
    assert.match(mensagemErroLogin("pendente-novo") ?? "", /pendente/);
    assert.equal(mensagemErroLogin("<script>"), null);
    assert.equal(mensagemErroLogin(undefined), null);
  });
});

describe("login com Google — configuração", () => {
  it("write-only e 'configurado' = ativo + client ID + segredo", () => {
    const i = coerceIntegracoes({ google: { ativo: true, clientId: CID, clientSecret: "iv:ct" } });
    assert.equal(googleConfigurado(i), true);
    const v = toView(i, true);
    assert.equal((v.google as Record<string, unknown>).clientSecret, undefined);
    assert.equal(v.google.clientSecretDefinido, true);
    assert.equal(googleConfigurado(coerceIntegracoes({ google: { ativo: true, clientId: CID } })), false);
    assert.equal(coerceIntegracoes(undefined).google?.ativo, false);
  });

  it("schema: client ID no formato do Google; vazio = manter", () => {
    assert.equal(integracoesSchema.parse({}).google.ativo, false);
    assert.equal(clientIdValido(CID), true);
    assert.equal(integracoesSchema.safeParse({ google: { clientId: "abc" } }).success, false);
    assert.equal(integracoesSchema.safeParse({ google: { clientId: CID, clientSecret: "GOCSPX-x" } }).success, true);
  });
});
