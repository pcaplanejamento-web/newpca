import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  CHAVE_PREF_EMAIL,
  emailAcessoLiberado,
  emailCadastroPendente,
  emailDaNotificacao,
  escaparHtml,
  lerPrefsEmail,
  querEmail,
  TIPOS_EMAIL_PADRAO,
  urlAbsoluta,
} from "../src/lib/email-core.ts";
import { comandoDevolverEmails, comandoReservarEmails, consultaPendentesEmail } from "../src/lib/email-sql.ts";
import { coerceIntegracoes, dominioDoRemetente, emailDoRemetente, resendConfigurado, toView } from "../src/lib/integracoes-core.ts";
import { integracoesSchema } from "../src/lib/integracoes-validation.ts";
import { clienteResend, ErroResend, HOST_RESEND } from "../src/lib/resend-api.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const falso = (respostas: Response[]) => {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    const r = respostas.shift();
    if (!r) throw new Error("sem rede");
    return r;
  };
  return { fetch, chamadas };
};
const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", ...headers } });

const ctx = { urlSistema: "https://governarv.com.br", nomeSistema: "Plataforma PCA" };

describe("resend — cliente", () => {
  it("host fixo, chave no cabeçalho Bearer (nunca na URL), redirect manual; envia e lê domínios", async () => {
    const f = falso([json({ id: "e1" }), json({ data: [{ id: "d1", name: "governarv.com.br", status: "verified" }] })]);
    const c = clienteResend({ apiKey: "re_abc", fetch: f.fetch });
    assert.equal(await c.enviar({ from: "A <a@x.com>", to: ["b@y.com"], subject: "S", html: "<p>", text: "t" }), "e1");
    assert.equal(f.chamadas[0].url, `${HOST_RESEND}/emails`);
    const cabecalhos = new Headers(f.chamadas[0].init?.headers);
    assert.equal(cabecalhos.get("Authorization"), "Bearer re_abc");
    assert.equal(f.chamadas[0].init?.redirect, "manual");
    assert.equal(f.chamadas[0].url.includes("re_abc"), false);
    const d = await c.dominios();
    assert.equal(d[0].status, "verified");
  });

  it("lote: ids na ordem; vazio não chama; mais de 100 recusa", async () => {
    const f = falso([json({ data: [{ id: "a" }, { id: "b" }] })]);
    const c = clienteResend({ apiKey: "re_x", fetch: f.fetch });
    const e = { from: "a@x.com", to: ["b@y.com"], subject: "S", html: "h", text: "t" };
    assert.deepEqual(await c.enviarLote([]), []);
    assert.deepEqual(await c.enviarLote([e, e]), ["a", "b"]);
    assert.equal(f.chamadas[0].url, `${HOST_RESEND}/emails/batch`);
    await assert.rejects(() => c.enviarLote(Array(101).fill(e)), ErroResend);
  });

  it("erros: 401 = chave; 422 com o motivo do Resend; 429 transitório com espera; rede = 0", async () => {
    const f = falso([
      json({ statusCode: 401, message: "API key is invalid" }, 401),
      json({ statusCode: 422, message: "The domain is not verified" }, 422),
      json({ message: "Too many" }, 429, { "retry-after": "3" }),
    ]);
    const c = clienteResend({ apiKey: "re_x", fetch: f.fetch });
    const e = { from: "a@x.com", to: ["b@y.com"], subject: "S", html: "h", text: "t" };
    await assert.rejects(() => c.enviar(e), (err: ErroResend) => err.status === 401 && /chave de API/.test(err.message));
    await assert.rejects(() => c.enviar(e), (err: ErroResend) => err.status === 422 && /not verified/.test(err.message));
    await assert.rejects(() => c.enviar(e), (err: ErroResend) => err.transitorio && err.esperarS === 3);
    await assert.rejects(() => c.enviar(e), (err: ErroResend) => err.status === 0 && err.transitorio);
  });
});

describe("resend — configuração", () => {
  it("remetente: 'Nome <e-mail>' ou só o e-mail; o domínio sai do endereço", () => {
    assert.equal(emailDoRemetente("Plataforma PCA <Avisos@GovernaRV.com.br>"), "avisos@governarv.com.br");
    assert.equal(emailDoRemetente("avisos@governarv.com.br"), "avisos@governarv.com.br");
    assert.equal(emailDoRemetente("sem email"), "");
    assert.equal(dominioDoRemetente("PCA <avisos@governarv.com.br>"), "governarv.com.br");
  });

  it("config tolerante, write-only e 'configurado' = ativo + chave + remetente válido", () => {
    const i = coerceIntegracoes({ resend: { ativo: true, apiKey: "iv:ct", remetente: "PCA <a@governarv.com.br>", dominio: "governarv.com.br", verificado: true } });
    assert.equal(resendConfigurado(i), true);
    const v = toView(i, true);
    assert.equal((v.resend as Record<string, unknown>).apiKey, undefined);
    assert.equal(v.resend.apiKeyDefinida, true);
    assert.equal(v.resend.urlSistema, "https://governarv.com.br");
    assert.equal(resendConfigurado(coerceIntegracoes({ resend: { ativo: true, apiKey: "iv:ct", remetente: "x" } })), false);
    assert.equal(coerceIntegracoes(undefined).resend?.ativo, false);
  });

  it("schema: chave re_…, remetente e endereço https validados; vazio = manter", () => {
    assert.equal(integracoesSchema.parse({}).resend.ativo, false);
    assert.equal(integracoesSchema.safeParse({ resend: { apiKey: "sk_123" } }).success, false);
    assert.equal(integracoesSchema.safeParse({ resend: { apiKey: "re_ABC_123" } }).success, true);
    assert.equal(integracoesSchema.safeParse({ resend: { remetente: "sem arroba" } }).success, false);
    assert.equal(integracoesSchema.safeParse({ resend: { urlSistema: "http://x.com" } }).success, false);
    assert.equal(integracoesSchema.safeParse({ resend: { urlSistema: "https://governarv.com.br/" } }).success, true);
  });
});

describe("e-mails — modelos e preferências", () => {
  it("escapa o que vem dos dados e monta o link absoluto", () => {
    const c = emailDaNotificacao({ tipo: "atribuida", titulo: "Tarefa <b>x</b> & y", texto: "#12 Teste", link: "/painel/tarefas/3?tarefa=9", atorNome: "Ana" }, ctx);
    assert.equal(c.html.includes("<b>x</b>"), false);
    assert.ok(c.html.includes("Tarefa &lt;b&gt;x&lt;/b&gt; &amp; y"));
    assert.ok(c.html.includes("https://governarv.com.br/painel/tarefas/3?tarefa=9"));
    assert.ok(c.texto.includes("Por Ana."));
    assert.equal(escaparHtml(`"'`), "&quot;&#39;");
  });

  it("link externo ou de protocolo relativo não vira link: volta ao painel", () => {
    assert.equal(urlAbsoluta("https://g.com/", "https://mal.com"), "https://g.com/painel");
    assert.equal(urlAbsoluta("https://g.com", "//mal.com"), "https://g.com/painel");
    assert.equal(urlAbsoluta("https://g.com", null), "https://g.com/painel");
  });

  it("cadastro e liberação levam aos lugares certos", () => {
    assert.ok(emailCadastroPendente({ nome: "Bia", email: "bia@x.com" }, ctx).html.includes("/painel/usuarios"));
    assert.ok(emailAcessoLiberado({ nome: "Bia" }, ctx).texto.includes("https://governarv.com.br/login"));
  });

  it("preferências: padrão ligado com os tipos que pedem ação; JSON solto é tolerado", () => {
    const p = lerPrefsEmail(null);
    assert.equal(p.ligado, true);
    assert.deepEqual(p.tipos, [...TIPOS_EMAIL_PADRAO]);
    assert.equal(querEmail(p, "atribuida"), true);
    assert.equal(querEmail(p, "comentario"), false);
    const q = lerPrefsEmail({ ligado: false, tipos: ["comentario", "invalido"] });
    assert.deepEqual(q.tipos, ["comentario"]);
    assert.equal(querEmail(q, "comentario"), false);
    assert.equal(lerPrefsEmail("x").ligado, true);
  });
});

describe("e-mails — pendentes no D1 (builders no driver real)", () => {
  function banco() {
    const db = new DatabaseSync(":memory:");
    for (const arq of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(process.cwd(), "drizzle", arq), "utf8"));
    db.exec("INSERT INTO usuarios (id, email, nome, senha_hash, role, status) VALUES (901, 'ana@x.com', 'Ana', 'h', 'membro', 'ativo')");
    return { db, orm: drizzle(d1Sobre(db) as never, { schema }) };
  }

  it("a migração não transforma o histórico em e-mail; as novas ficam pendentes com a preferência da pessoa", async () => {
    const { db, orm } = banco();
    db.exec("INSERT INTO notificacoes (usuario_id, tipo, titulo) VALUES (901, 'atribuida', 'Nova')");
    db.exec("INSERT INTO notificacoes (usuario_id, tipo, titulo, criado_em) VALUES (901, 'atribuida', 'Velha', datetime('now', '-5 days'))");
    db.exec(`INSERT INTO preferencias_tabela (usuario_id, chave, valor) VALUES (901, '${CHAVE_PREF_EMAIL}', '{"ligado":false}')`);
    const p = await consultaPendentesEmail(orm, 10);
    assert.deepEqual(
      p.map((x) => x.titulo),
      ["Nova"],
    );
    assert.equal(p[0].email, "ana@x.com");
    assert.equal(p[0].prefs, '{"ligado":false}');
  });

  it("reservar é compare-and-set (duas passadas não repetem); devolver soma tentativa e desiste após 3", async () => {
    const { db, orm } = banco();
    db.exec("INSERT INTO notificacoes (id, usuario_id, tipo, titulo) VALUES (1, 901, 'atribuida', 'A')");
    assert.deepEqual(await comandoReservarEmails(orm, [1]), [{ id: 1 }]);
    assert.deepEqual(await comandoReservarEmails(orm, [1]), []);
    for (let i = 0; i < 3; i++) {
      await comandoDevolverEmails(orm, [1]);
      if (i < 2) assert.equal((await comandoReservarEmails(orm, [1])).length, 1);
    }
    assert.equal((await consultaPendentesEmail(orm, 10)).length, 0);
    assert.equal((db.prepare("SELECT email_tentativas AS n FROM notificacoes WHERE id = 1").get() as { n: number }).n, 3);
  });
});
