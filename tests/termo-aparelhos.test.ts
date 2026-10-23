import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { aparelhosPresentes, lerListaMensagem } from "../src/lib/presenca-core.ts";
import {
  ACESSO_CONTA_PADRAO,
  canalRecusado,
  aparelhosValemPara,
  destinoBloqueio,
  hashDoAparelho,
  iniciais,
  lerConfigAcessoConta,
  limiteEfetivo,
  nomeAparelhoValido,
  regrasValemPara,
  repeteAoEntrar,
  situacaoNovoAparelho,
} from "../src/lib/acesso-conta-core.ts";
import {
  comandoContaAparelhos,
  comandosLigarConhecido,
  comandosNomearAparelho,
  comandosRetirarAparelhos,
  comandosTrocarAparelho,
  consultaAparelhos,
} from "../src/lib/aparelhos-sql.ts";
import {
  assinaturaClausulas,
  blocosComprovante,
  clausulasAutomaticas,
  codigoDeBytes,
  codigoNormal,
  type ContextoClausulas,
  estadoTermo,
  fraseConfere,
  hashTexto,
  modeloTermo,
  montarTermo,
  rotuloVersaoTermo,
  seloAceite,
} from "../src/lib/termo-uso-core.ts";
import { comandoExcluirTermo, comandoLimparHistoricoTermo, comandosLimparMencoesTermo, comandoPendenciaJa, comandoPendencias, comandoPublicar, comandosAceitar, comandosLimparTesteTermo } from "../src/lib/termos-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

function banco() {
  const db = new DatabaseSync(":memory:");
  const dir = join(process.cwd(), "drizzle");
  for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`INSERT INTO usuarios (id, email, nome, senha_hash, status) VALUES (1, 'a@x', 'Ana', 'x', 'ativo'), (2, 'b@x', 'Bruno', 'x', 'ativo'), (3, 'c@x', 'Caio', 'x', 'pendente')`);
  return { db, orm: drizzle(d1Sobre(db) as never, { schema }) };
}
const sessao = (db: DatabaseSync, usuarioId: number, id: number) =>
  db.exec(`INSERT INTO sessoes (id, token_hash, usuario_id, expira_em) VALUES (${id}, 't${id}', ${usuarioId}, '2099-01-01')`);
const ap = (usuarioId: number, hash: string, limite: number) => ({ usuarioId, hash, nome: `Ap ${hash}`, navegador: "Chrome", ip: "1.1.1.1", em: "2026-10-22T10:00:00Z", teste: false, limite });

describe("configuração de acesso da conta", () => {
  it("lê com segurança e decide para quem vale", () => {
    assert.deepEqual(lerConfigAcessoConta(null), ACESSO_CONTA_PADRAO);
    assert.equal(lerConfigAcessoConta({ fecharAceiteS: 30 }).fecharAceiteS, 30);
    assert.equal(lerConfigAcessoConta({ fecharAceiteS: 0 }).fecharAceiteS, 0);
    assert.equal(lerConfigAcessoConta({ fecharAceiteS: 7 }).fecharAceiteS, ACESSO_CONTA_PADRAO.fecharAceiteS);
    const c = lerConfigAcessoConta({ modo: "teste", testadores: [2, "2", -1, 5], limite: 99, trocaDias: 7, porPapel: { 3: 4, x: 2, 9: 50 } });
    assert.deepEqual(c.testadores, [2, 5]);
    assert.equal(c.limite, 2);
    assert.deepEqual(c.porPapel, { 3: 4 });
    assert.equal(regrasValemPara(c, { id: 2, admin: false }), true);
    assert.equal(regrasValemPara(c, { id: 1, admin: false }), false);
    assert.equal(regrasValemPara(ACESSO_CONTA_PADRAO, { id: 2, admin: false }), false);
    // ADM isento no ativo, mas o ADM testador segue as regras
    const ativo = { ...c, modo: "ativo" as const };
    assert.equal(aparelhosValemPara(ativo, { id: 9, admin: true }), false);
    assert.equal(aparelhosValemPara({ ...c, testadores: [9] }, { id: 9, admin: true }), true);
    assert.equal(repeteAoEntrar({ ...c, repetirAoEntrar: true }, { id: 2, admin: false }), true);
    assert.equal(repeteAoEntrar({ ...ativo, repetirAoEntrar: true }, { id: 2, admin: false }), false);
  });
  it("limite, trava e nome", () => {
    const c = lerConfigAcessoConta({ limite: 3, porPapel: { 7: 1 } });
    assert.equal(limiteEfetivo(c, 7, null), 1);
    assert.equal(limiteEfetivo(c, 7, 5), 5);
    assert.equal(limiteEfetivo(c, 8, null), 3);
    const agora = Date.parse("2026-10-22T00:00:00Z");
    assert.deepEqual(situacaoNovoAparelho({ total: 1, limite: 2, trocaAte: null, agoraMs: agora }), { tipo: "livre" });
    assert.deepEqual(situacaoNovoAparelho({ total: 2, limite: 2, trocaAte: null, agoraMs: agora }), { tipo: "lotado" });
    // em trava, nem com vaga
    assert.equal(situacaoNovoAparelho({ total: 1, limite: 2, trocaAte: "2026-11-01T00:00:00Z", agoraMs: agora }).tipo, "trava");
    assert.equal(situacaoNovoAparelho({ total: 1, limite: 2, trocaAte: "2026-11-01T00:00:00Z", agoraMs: agora, semTrava: true }).tipo, "livre");
    assert.equal(situacaoNovoAparelho({ total: 0, limite: 2, trocaAte: "2026-11-01T00:00:00Z", agoraMs: agora }).tipo, "livre");
    assert.equal(nomeAparelhoValido("  Notebook​ da   sala "), "Notebook da sala");
    assert.equal(nomeAparelhoValido("a"), null);
    assert.equal(iniciais("Ana Maria de Souza"), "A. M. S.");
    assert.equal(destinoBloqueio({ nomearAparelho: true, termo: "pendente", aparelhoId: null }), "aparelho");
    assert.equal(destinoBloqueio({ nomearAparelho: false, termo: "pendente", aparelhoId: 1 }), "termo");
    assert.equal(destinoBloqueio({ nomearAparelho: false, termo: "ok", aparelhoId: 1 }), null);
  });
  it("hash do aparelho é estável e não revela o cookie", async () => {
    const h = await hashDoAparelho("0123456789abcdef0123456789abcdef");
    assert.equal(h.length, 40);
    assert.equal(h, await hashDoAparelho("0123456789abcdef0123456789abcdef"));
    assert.ok(!h.includes("0123456789abcdef"));
  });
});

describe("termo de uso — núcleo", () => {
  const ctx: ContextoClausulas = {
    nomeSistema: "PCA",
    acesso: lerConfigAcessoConta({ limite: 3, trocaDias: 15, encarregado: { nome: "Fulano", email: "dpo@x" } }),
    inatividadeMin: 30,
    protecao: { ligada: true, copia: true, impressao: false, ocultar: false, marcaDagua: true },
    presenca: true,
    chat: false,
    email: true,
    google: false,
  };
  it("cláusulas automáticas seguem as configurações", async () => {
    const cl = clausulasAutomaticas(ctx);
    const ids = cl.map((c) => c.id);
    assert.deepEqual(ids, ["aparelhos", "sessao", "registros", "protecao", "presenca", "email", "lgpd", "aceite"]);
    assert.match(cl[0].texto, /no máximo 3 aparelhos/);
    assert.match(cl[0].texto, /15 dias/);
    assert.match(cl[1].texto, /30 minutos/);
    assert.match(cl.find((c) => c.id === "lgpd")?.texto ?? "", /Fulano · dpo@x/);
    const sem = clausulasAutomaticas({ ...ctx, protecao: { ...ctx.protecao, ligada: false }, presenca: false, email: false });
    assert.deepEqual(sem.map((c) => c.id), ["aparelhos", "sessao", "registros", "lgpd", "aceite"]);
    assert.notEqual(await assinaturaClausulas(cl), await assinaturaClausulas(sem));
  });
  it("monta, faz hash e sela", async () => {
    const texto = montarTermo({ versao: 2, publicadoEm: "2026-10-22T12:00:00Z", textoAdm: modeloTermo("PCA"), clausulas: clausulasAutomaticas(ctx) });
    assert.match(texto, /^# Termo de Uso\n\nVersão 2 — publicada em 22\/10\/2026 09:00 \(horário de Brasília\)/);
    assert.match(texto, /### A\.1\. Aparelhos vinculados/);
    assert.equal(await hashTexto("a\r\nb"), await hashTexto("a\nb"));
    const d = { codigo: "X", versao: 2, hash: "h", usuarioId: 1, nome: "Ana", matricula: "1", cargo: "", unidade: "", email: "a@x", ip: "", navegador: "", aparelho: "", metodo: "senha", em: "2026", teste: false };
    const s = await seloAceite(d);
    assert.equal(s, await seloAceite({ ...d }));
    assert.notEqual(s, await seloAceite({ ...d, nome: "Ana B" }));
    const blocos = blocosComprovante(texto, { ...d, selo: s, urlVerificacao: "https://x/termo/verificar/X" });
    assert.ok(blocos.some((b) => b.tipo === "secao" && b.texto === "Registro de assinatura eletrônica"));
    assert.ok(!blocosComprovante(texto, { ...d, selo: s, urlVerificacao: "u" }).some((b) => b.tipo === "nota" && /TESTE/.test(b.texto)));
    assert.ok(blocosComprovante(texto, { ...d, teste: true, selo: s, urlVerificacao: "u" }).some((b) => b.tipo === "nota" && /TESTE/.test(b.texto)));
  });
  it("código, estado e frase", () => {
    const c = codigoDeBytes(new Uint8Array(16).fill(255));
    assert.match(c, /^[A-Z2-9]{4}(-[A-Z2-9]{1,4})+$/);
    assert.equal(codigoNormal(c.toLowerCase().replace(/-/g, "")), c);
    assert.equal(codigoNormal("abc"), null);
    assert.equal(estadoTermo(null), "ok");
    assert.equal(estadoTermo("2026-10-25T00:00:00Z"), "pendente", "obrigatório: qualquer pendência bloqueia");
    assert.equal(fraseConfere(" li e  concordo "), true);
    assert.equal(fraseConfere("concordo"), false);
  });
});

describe("aparelhos no D1 real", () => {
  it("nomear respeita o limite NO COMANDO e liga a sessão", async () => {
    const { db, orm } = banco();
    sessao(db, 1, 10);
    sessao(db, 1, 11);
    sessao(db, 1, 12);
    let [r] = await orm.batch(comandosNomearAparelho(orm, ap(1, "h1", 2), 10));
    assert.equal(r.length, 1);
    [r] = await orm.batch(comandosNomearAparelho(orm, ap(1, "h2", 2), 11));
    assert.equal(r.length, 1);
    [r] = await orm.batch(comandosNomearAparelho(orm, ap(1, "h3", 2), 12));
    assert.equal(r.length, 0, "lotado: não entra");
    assert.equal((db.prepare("SELECT aparelho_id FROM sessoes WHERE id = 12").get() as { aparelho_id: number | null }).aparelho_id, null);
    assert.ok((db.prepare("SELECT aparelho_id FROM sessoes WHERE id = 10").get() as { aparelho_id: number }).aparelho_id);
    // o mesmo hash não entra de novo; o conhecido só liga e renomeia
    await orm.batch(comandosLigarConhecido(orm, 1, "h1", 12, "Novo nome", "2026-10-23"));
    assert.equal((await consultaAparelhos(orm, 1)).find((a) => a.nome === "Novo nome")?.id, (db.prepare("SELECT aparelho_id FROM sessoes WHERE id = 12").get() as { aparelho_id: number }).aparelho_id);
  });
  it("troca atômica: retira, encerra as sessões, registra e trava — nunca o aparelho da própria sessão", async () => {
    const { db, orm } = banco();
    sessao(db, 1, 10);
    sessao(db, 1, 11);
    sessao(db, 1, 20);
    await orm.batch(comandosNomearAparelho(orm, ap(1, "h1", 2), 10));
    await orm.batch(comandosNomearAparelho(orm, ap(1, "h2", 2), 11));
    const [a1, a2] = (await consultaAparelhos(orm, 1)).sort((x, y) => x.id - y.id);
    // tentar retirar o aparelho da PRÓPRIA sessão (10 → h1) não faz nada
    await orm.batch(comandosTrocarAparelho(orm, ap(1, "h3", 2), 10, [a1.id], "2026-11-21T00:00:00Z"));
    assert.equal((await consultaAparelhos(orm, 1)).length, 2);
    // a sessão 20 (sem aparelho) troca h2 por h3
    await orm.batch(comandosTrocarAparelho(orm, ap(1, "h3", 2), 20, [a2.id], "2026-11-21T00:00:00Z"));
    const depois = await consultaAparelhos(orm, 1);
    assert.deepEqual(depois.map((a) => a.nome).sort(), ["Ap h1", "Ap h3"]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessoes WHERE id = 11").get()?.n, 0, "a sessão do aparelho retirado foi encerrada");
    assert.equal(db.prepare("SELECT troca_ate FROM aparelhos_conta WHERE usuario_id = 1").get()?.troca_ate, "2026-11-21T00:00:00Z");
    // limite baixado: retirar 1 não abre vaga → nada acontece
    await orm.batch(comandosTrocarAparelho(orm, ap(1, "h4", 1), 20, [depois.find((a) => a.nome === "Ap h1")?.id as number], null));
    assert.equal((await consultaAparelhos(orm, 1)).length, 2);
  });
  it("retirar e o limite próprio", async () => {
    const { db, orm } = banco();
    sessao(db, 2, 30);
    sessao(db, 2, 31);
    await orm.batch(comandosNomearAparelho(orm, ap(2, "x1", 3), 30));
    await orm.batch(comandosNomearAparelho(orm, ap(2, "x2", 3), 31));
    const lista = await consultaAparelhos(orm, 2);
    const meu = (db.prepare("SELECT aparelho_id FROM sessoes WHERE id = 30").get() as { aparelho_id: number }).aparelho_id;
    const [, r] = await orm.batch(comandosRetirarAparelhos(orm, 2, lista.map((a) => a.id), meu));
    assert.equal(r.length, 1, "o da própria sessão fica");
    await comandoContaAparelhos(orm, 2, { limite: 5 }).run();
    await comandoContaAparelhos(orm, 2, { liberarTroca: true }).run();
    assert.deepEqual({ ...db.prepare("SELECT limite, troca_ate FROM aparelhos_conta WHERE usuario_id = 2").get() }, { limite: 5, troca_ate: null });
  });
});

describe("termo no D1 real", () => {
  it("publica uma vez, cria as pendências, aceita e repete no teste", async () => {
    const { db, orm } = banco();
    db.exec(`INSERT INTO termos_uso (id, versao, titulo, texto_adm) VALUES (1, 1, 'Termo', 'texto')`);
    const pub = { textoFinal: "final", hash: "h", clausulas: "[]", em: "2026-10-22", por: "ADM" };
    assert.equal((await orm.batch([comandoPublicar(orm, 1, pub)]))[0].length, 1);
    assert.equal((await orm.batch([comandoPublicar(orm, 1, pub)]))[0].length, 0, "não publica duas vezes");
    await comandoPendencias(orm, 1, { todos: true }, "2026-10-30").run();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM termos_pendencias").get()?.n, 2, "só os ativos");
    await comandoPendencias(orm, 1, { ids: [2] }, "2026-11-30").run();
    assert.equal(db.prepare("SELECT prazo FROM termos_pendencias WHERE usuario_id = 2").get()?.prazo, "2026-11-30");
    const aceite = { usuarioId: 2, termoId: 1, versao: 1, hash: "h", nome: "Bruno", email: "b@x", metodo: "senha", codigo: "C1", selo: "s", em: "2026-10-22", teste: true };
    const [, ins] = await orm.batch(comandosAceitar(orm, aceite));
    assert.equal(ins.length, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM termos_pendencias WHERE usuario_id = 2").get()?.n, 0);
    // repetir a cada login: a pendência volta e o novo aceite de teste substitui o anterior
    await comandoPendenciaJa(orm, 2, 1, "2026-10-22").run();
    await orm.batch(comandosAceitar(orm, { ...aceite, codigo: "C2" }));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM termos_aceites WHERE usuario_id = 2").get()?.n, 1);
    // aceite oficial não se repete; o de teste sai ao passar ao ativo
    await orm.batch(comandosLimparTesteTermo(orm));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM termos_aceites").get()?.n, 0);
    await orm.batch(comandosAceitar(orm, { ...aceite, codigo: "C3", teste: false }));
    const [, de2] = await orm.batch(comandosAceitar(orm, { ...aceite, codigo: "C4", teste: false }));
    assert.equal(de2.length, 0, "o oficial não é refeito");
    await comandoPendencias(orm, 1, { todos: true }, "2026-12-01").run();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM termos_pendencias WHERE usuario_id = 2").get()?.n, 0, "quem já aceitou não volta a dever");
    assert.equal((await orm.batch([comandoExcluirTermo(orm, 1)]))[0].length, 0, "versão aceita nunca é excluída");
    db.exec(`INSERT INTO termos_uso (id, versao, titulo, texto_adm) VALUES (2, 2, 'Termo', 'texto')`);
    await comandoPendencias(orm, 2, { todos: true }, "2026-12-01").run();
    assert.equal((await orm.batch([comandoExcluirTermo(orm, 2)]))[0].length, 1, "sem aceite sai");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM termos_pendencias WHERE termo_id = 2").get()?.n, 0, "as pendências saem junto");
    // versão usada SÓ EM TESTE: sai com os aceites de teste, as pendências e o histórico dela
    db.exec(`INSERT INTO termos_uso (id, versao, titulo, texto_adm) VALUES (3, 3, 'Termo', 'texto')`);
    await orm.batch(comandosAceitar(orm, { ...aceite, termoId: 3, versao: 3, codigo: "T3", teste: true }));
    await comandoPendencias(orm, 3, { todos: true }, "2026-12-01").run();
    db.exec(`INSERT INTO auditoria (usuario_nome, acao, entidade, entidade_id, resumo) VALUES ('ADM', 'criar', 'termo_uso', 3, 'publicado'), ('ADM', 'criar', 'termo_uso', 1, 'outra'), ('Bia', 'criar', 'usuario', 9, 'Bia criou uma conta (ativa) — Termo de Uso versão 3 aceito (código T3)'), ('Rui', 'criar', 'usuario', 8, 'Rui criou uma conta (ativa) — Termo de Uso versão 1 aceito (código R1)')`);
    const [saiu, hist] = await orm.batch([comandoExcluirTermo(orm, 3), comandoLimparHistoricoTermo(orm, 3), ...comandosLimparMencoesTermo(orm, 3, 3, ["T3"])]);
    assert.equal(db.prepare("SELECT resumo FROM auditoria WHERE usuario_nome = 'Bia'").get()?.resumo, "Bia criou uma conta (ativa)", "a menção no cadastro sai");
    assert.match(String(db.prepare("SELECT resumo FROM auditoria WHERE usuario_nome = 'Rui'").get()?.resumo), /código R1/, "a de outra versão fica");
    assert.equal(saiu.length, 1, "só teste sai");
    assert.equal(hist.length, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM termos_aceites WHERE termo_id = 3").get()?.n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM termos_pendencias WHERE termo_id = 3").get()?.n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidade = 'termo_uso'").get()?.n, 1, "o histórico de outra versão fica");
    // com aceite real, nada é apagado — nem o histórico
    const [n1, n2] = await orm.batch([comandoExcluirTermo(orm, 1), comandoLimparHistoricoTermo(orm, 1)]);
    assert.equal(n1.length + n2.length, 0);
  });
});

describe("canais ao vivo e o aparelho no online", () => {
  it("o canal recusa a sessão sem aparelho ou com o termo pendente — só com as regras valendo", () => {
    const base = { id: 2, admin: false, aparelhoId: null, termoPrazo: null };
    assert.equal(canalRecusado({ ...base, cfgJson: null }), null);
    assert.equal(canalRecusado({ ...base, cfgJson: '{"modo":"ativo"}' }), "Aparelho sem nome.");
    assert.equal(canalRecusado({ ...base, cfgJson: '{"modo":"ativo"}', aparelhoId: 3 }), null);
    assert.equal(canalRecusado({ ...base, cfgJson: '{"modo":"ativo"}', aparelhoId: 3, termoPrazo: "2026-10-01" }), "Termo de Uso pendente.");
    assert.equal(canalRecusado({ ...base, cfgJson: '{"modo":"teste","testadores":[9]}' }), null);
    assert.equal(canalRecusado({ ...base, admin: true, cfgJson: '{"modo":"ativo"}', termoPrazo: null }), null, "ADM isento do aparelho");
    assert.equal(canalRecusado({ ...base, admin: true, cfgJson: '{"modo":"ativo"}', termoPrazo: "2026-10-01" }), "Termo de Uso pendente.", "o termo vale também para o ADM");
    assert.equal(canalRecusado({ ...base, cfgJson: "{inválido" }), null);
  });
  it("os aparelhos de cada pessoa presente chegam à tela", () => {
    const ap = aparelhosPresentes([
      { id: 1, estado: "online", invisivel: false, aparelho: "PC" },
      { id: 1, estado: "online", invisivel: false, aparelho: "Celular" },
      { id: 1, estado: "online", invisivel: false, aparelho: "PC" },
      { id: 2, estado: "online", invisivel: true, aparelho: "Oculto" },
      { id: 3, estado: "online", invisivel: false },
    ]);
    assert.deepEqual(ap, [[1, ["PC", "Celular"]]]);
    const l = lerListaMensagem(JSON.stringify({ t: "presenca", p: [[1, "o"]], v: [], d: [], ap }));
    assert.deepEqual(l?.estados.get(1)?.aparelhos, ["PC", "Celular"]);
  });
});

it("aparelho: o cookie copiado para OUTRO navegador não é o mesmo aparelho", async () => {
  const { mesmoNavegador } = await import("../src/lib/acesso-conta-core.ts");
  assert.equal(mesmoNavegador("Chrome no Windows", "Chrome no Windows"), true);
  assert.equal(mesmoNavegador("", "Firefox no Linux"), true);
  assert.equal(mesmoNavegador("Chrome no Windows", "Firefox no Linux"), false);
});

describe("versão do termo sem título", () => {
  it("identifica pela versão e pela data/hora de Brasília", () => {
    assert.equal(rotuloVersaoTermo(3, "2026-10-23T17:05:00Z"), "Termo de Uso — versão 3 · 23/10/2026 14:05");
    assert.equal(rotuloVersaoTermo(4, null), "Termo de Uso — versão 4 (rascunho)");
  });
});

describe("cláusulas automáticas desligadas pelo ADM", () => {
  it("saem do termo e só ids conhecidos valem", async () => {
    const { clausulasAutomaticas } = await import("../src/lib/termo-uso-core.ts");
    const acesso = lerConfigAcessoConta({ clausulasOff: ["registros", "xpto", "registros"] });
    assert.deepEqual(acesso.clausulasOff, ["registros"]);
    const ctx = { nomeSistema: "S", acesso, inatividadeMin: 0, protecao: { ligada: false, copia: false, impressao: false, ocultar: false, marcaDagua: false }, presenca: false, chat: false, email: false, google: false };
    const ids = clausulasAutomaticas(ctx).map((c) => c.id);
    assert.equal(ids.includes("registros"), false);
    assert.equal(ids.includes("aparelhos"), true);
  });
});

it("acessoConta: tela de aceite e baixar comprovante ligados por padrão; desligáveis", () => {
  assert.equal(lerConfigAcessoConta({}).telaAceito, true);
  assert.equal(lerConfigAcessoConta({}).baixarComprovante, true);
  assert.equal(lerConfigAcessoConta({ telaAceito: false, baixarComprovante: false }).telaAceito, false);
  assert.equal(lerConfigAcessoConta({ baixarComprovante: false }).baixarComprovante, false);
  assert.equal(lerConfigAcessoConta({ baixarComprovante: "x" }).baixarComprovante, true);
});

it("ativo com pessoas escolhidas: só os escolhidos (e testadores) são travados; todos = todos", async () => {
  const { lerConfigAcessoConta, regrasValemPara, pessoasDasRegras } = await import("../src/lib/acesso-conta-core.ts");
  const todos = lerConfigAcessoConta({ modo: "ativo" });
  assert.equal(todos.alcance, "todos");
  assert.equal(regrasValemPara(todos, { id: 9, admin: false }), true);
  assert.equal(pessoasDasRegras(todos), null);
  const esc = lerConfigAcessoConta({ modo: "ativo", alcance: "escolhidos", exigidos: [2, 2, 3], testadores: [5] });
  assert.deepEqual(esc.exigidos, [2, 3]);
  assert.equal(regrasValemPara(esc, { id: 2, admin: false }), true);
  assert.equal(regrasValemPara(esc, { id: 5, admin: false }), true);
  assert.equal(regrasValemPara(esc, { id: 9, admin: true }), false);
  assert.deepEqual(pessoasDasRegras(esc), [2, 3, 5]);
  assert.deepEqual(pessoasDasRegras(lerConfigAcessoConta({ modo: "desligado" })), []);
});
