import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { type ArquivoSaida, lerConfigCenti, lerOpcoesSaida, type TarefaCenti } from "../src/lib/automacao-centi-core.ts";
import { andamentoDfds, conferenciaAnexos, contagemDfds, entidadePrevista, type LinhaDfd, resumoConferencia, textoContagem, visualEstadoDfd } from "../src/lib/automacao-dfds-estado.ts";
import { type DepsExecucao, executarDfds } from "../src/lib/automacao-dfds-motor.ts";
import { comandoAtualizarPasso, comandoRecontar, comandosPassos, comandosReconciliarExecucoes, limiteAbandono, MSG_ABANDONO } from "../src/lib/automacao-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const linha = (chave: string, estado: LinhaDfd["estado"]): LinhaDfd => ({ chave, id: chave, dfd: null, orgao: null, orgaoNome: null, grupo: "", estado });

describe("estados e contagem dos DFDs (a barra, o painel e o ícone)", () => {
  it("total = concluídas + em curso + fila; pulados/repetidos fora; já estava separado de anexado", () => {
    const ls = [
      linha("a", "ok"),
      linha("b", "ja"),
      linha("c", "falha"),
      linha("d", "interrompido"),
      linha("e", "anexando"),
      linha("f", "emitindo"),
      linha("g", "fila"),
      linha("h", "pulado"),
      linha("i", "repetido"),
    ];
    const c = contagemDfds(ls);
    assert.deepEqual({ ...c, atual: c.atual?.chave }, { total: 7, concluidas: 4, emCurso: 2, fila: 1, ok: 1, ja: 1, falhas: 1, interrompidas: 1, atual: "e" });
    assert.equal(textoContagem(c, true), "1 anexado(s) · 1 já estava(m) · 1 falhou(aram) · 1 interrompido(s) — 4 de 7");
    const a = andamentoDfds(ls, true);
    assert.equal(a.feito, c.concluidas, "o painel de segundo plano usa a MESMA conta da barra");
    assert.equal(a.total, c.total);
    assert.equal(a.itens.length, 7, "o painel não lista pulados/repetidos como feitos");
    assert.match(a.atual ?? "", /^Anexando na Centi · Planej\. e$/);
  });

  it("cada estado tem rótulo próprio — 'Anexado' só no destino da Centi", () => {
    assert.equal(visualEstadoDfd("ok", true).rotulo, "Anexado");
    assert.equal(visualEstadoDfd("ok", false).rotulo, "Salvo");
    assert.equal(visualEstadoDfd("aguardando", true).rotulo, "Aguardando sua confirmação");
    assert.equal(visualEstadoDfd("ja", true).rotulo, "Já estava");
  });

  it("entidade prevista: cadastrada no órgão (no formato da aberta) › mapa › aberta", () => {
    const fmt = (v: string, ab: string | null) => (ab ? v.padStart(ab.length, "0") : v);
    assert.equal(entidadePrevista("7", { 7: "4" }, { 7: "9" }, "24", fmt), "04");
    assert.equal(entidadePrevista("7", {}, { 7: "9" }, "24", fmt), "9");
    assert.equal(entidadePrevista("7", {}, {}, "24", fmt), "24");
    assert.equal(entidadePrevista(null, {}, {}, null, fmt), null);
  });
});

/* ── O motor de ponta a ponta (dependências falsas: a extensão e o servidor) ─────────────────────────────────────── */

type Chamada = { url: string; metodo: string; corpo: unknown };
const fetchOriginal = globalThis.fetch;

function servidorFalso(registros: { centiAlvo: string; descricao: string }[] = []) {
  const chamadas: Chamada[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ url: String(url), metodo: init?.method ?? "GET", corpo });
    const resp = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
    if (String(url).endsWith("/execucoes") && init?.method === "POST") return resp({ ok: true, id: 7 });
    if (String(url).includes("/autorizar")) return resp({ ok: true, token: "t" });
    if (String(url).includes("/registros") && (init?.method ?? "GET") === "GET") return resp({ ok: true, registros: registros.map((r) => ({ centiDocumento: "77", criadoEm: null, usuarioNome: "A", ...r })) });
    return resp({ ok: true });
  }) as typeof fetch;
  return chamadas;
}

const PDF = Buffer.from("%PDF-1.4 teste").toString("base64");
const tarefa = (n: number): TarefaCenti => ({ chave: `k${n}`, id: String(100 + n), dfd: String(n), orgao: "7", orgaoNome: "AMAE", grupo: "P" });

function montar(over: Partial<DepsExecucao> & { pedirExt?: (acao: string, dados: unknown) => unknown } = {}) {
  const linhas = new Map<string, LinhaDfd>();
  const historico = new Map<string, string[]>();
  const pedidos: string[] = [];
  const d: DepsExecucao = {
    pedir: async (acao, dados) => {
      pedidos.push(acao);
      const r = over.pedirExt?.(acao, dados);
      if (r !== undefined) return r as never;
      if (acao === "protocolo") return { ok: true, protocolo: { id: "9", numero: "156844", ano: "2026", assunto: "", descricao: "", documentos: 0 } };
      if (acao === "ler") return { ok: true, j: {} } as never;
      if (acao === "pedir") return { ok: true, b64: PDF, status: 200 };
      if (acao === "anexar") return { ok: true, sequencial: "5" };
      return { ok: true };
    },
    cfg: () => lerConfigCenti(null),
    aplicarOperacao: () => false,
    mapa: () => ({}),
    cadastradas: () => ({ 7: "24" }),
    definirEntidade: () => {},
    lote: { current: "L1" },
    interrompido: () => false,
    atual: "24",
    confirmar: async () => true,
    pasta: null,
    protocolos: [],
    marcar: (chave, l) => {
      const ant = linhas.get(chave);
      if (ant) linhas.set(chave, { ...ant, ...l });
      if (l.estado) historico.set(chave, [...(historico.get(chave) ?? []), l.estado]);
    },
    marcarVarias: (f) => {
      for (const [k, l] of linhas) {
        const m = f(l);
        if (m) {
          linhas.set(k, { ...l, ...m });
          if (m.estado) historico.set(k, [...(historico.get(k) ?? []), m.estado]);
        }
      }
    },
    ...over,
  };
  return { d, linhas, historico, pedidos };
}

function plano(n: number): ArquivoSaida[] {
  return Array.from({ length: n }, (_, i) => ({ pastas: [], nome: `Planejamento ${101 + i}.pdf`, partes: [tarefa(i + 1)] }));
}

describe("executarDfds — o passo REAL de cada linha e a execução sempre finalizada", () => {
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });
  const saida = lerOpcoesSaida({ destino: "protocolo", formato: "separados", conferir: false });
  const alvo = { id: "9", numero: "156844", ano: "2026" };

  it("anexar: emitindo → anexando → Anexado; a entidade prevista aparece antes; o ícone conta os CONCLUÍDOS", async () => {
    const chamadas = servidorFalso();
    const p = plano(2);
    const m = montar();
    for (const a of p) for (const t of a.partes) m.linhas.set(t.chave, { ...t, estado: "fila" });
    const lotes: { feito: number; total: number }[] = [];
    m.d.pedir = ((orig) => async (acao, dados, ms) => {
      if (acao === "lote") lotes.push(dados as { feito: number; total: number });
      return orig(acao, dados, ms);
    })(m.d.pedir);
    const fim = await executarDfds(p, saida, alvo, m.d);
    assert.equal(fim.ok, 2);
    assert.deepEqual(m.historico.get("k1"), ["emitindo", "anexando", "ok"]);
    assert.equal(m.linhas.get("k1")?.entidade, "24");
    assert.equal(m.linhas.get("k1")?.entidadePrevista, false, "a emissão confirma a entidade real");
    assert.equal(m.linhas.get("k1")?.erro, "Documento 5 do protocolo.");
    assert.equal(lotes[0].feito, 0, "o 1º DFD em curso não conta como feito");
    assert.equal(lotes.at(-1)?.feito, 2);
    assert.ok(lotes.every((l) => l.total === 2));
    // Cada arquivo registrado (ok) — a execução se encerra sozinha no servidor.
    assert.equal(chamadas.filter((c) => c.url.includes("/registros") && c.metodo === "POST").length, 2);
    assert.ok(!chamadas.some((c) => c.metodo === "PATCH" && (c.corpo as { estado?: string })?.estado === "cancelada"));
  });

  it("a pergunta da Centi: a linha mostra 'aguardando' e, recusada, falha com o motivo e o lote para", async () => {
    servidorFalso();
    const p = plano(2);
    const m = montar({ pedirExt: (acao) => (acao === "anexar" ? { ok: false, confirmar: "Deseja salvar?" } : undefined), confirmar: async () => false });
    for (const a of p) for (const t of a.partes) m.linhas.set(t.chave, { ...t, estado: "fila" });
    const fim = await executarDfds(p, saida, alvo, m.d);
    assert.deepEqual(m.historico.get("k1"), ["emitindo", "anexando", "aguardando", "falha"]);
    assert.match(m.linhas.get("k1")?.erro ?? "", /confirmação recusada/);
    assert.equal(m.linhas.get("k2")?.estado, "falha", "os próximos não ficam 'na fila' para sempre");
    assert.equal(fim.parou, true);
  });

  it("já anexado (pelo servidor) = 'Já estava', não 'Anexado'", async () => {
    servidorFalso();
    const p = plano(1);
    const m = montar({ pedirExt: (acao) => (acao === "anexar" ? { ok: true, jaAnexado: true, sequencial: "3" } : undefined) });
    for (const a of p) for (const t of a.partes) m.linhas.set(t.chave, { ...t, estado: "fila" });
    const fim = await executarDfds(p, saida, alvo, m.d);
    assert.equal(m.linhas.get("k1")?.estado, "ja");
    assert.deepEqual({ ok: fim.ok, ja: fim.ja }, { ok: 0, ja: 1 });
  });

  it("a CENTI decide o 'já estava': registrado no sistema mas ausente no protocolo = enviado de novo (sem o jaFeito)", async () => {
    const chamadas = servidorFalso([{ centiAlvo: "9", descricao: "PLANEJAMENTO 101" }, { centiAlvo: "9", descricao: "PLANEJAMENTO 102" }]);
    const p = plano(2);
    const docs = [{ descricao: "Planejamento 102", sequencial: "61", id: "5001" }];
    const m = montar({ pedirExt: (acao) => (acao === "protocolo" ? { ok: true, protocolo: { id: "9", numero: "156844", ano: "2026", assunto: "", descricao: "", documentos: 1, docs } } : undefined) });
    for (const a of p) for (const t of a.partes) m.linhas.set(t.chave, { ...t, estado: "fila" });
    const fim = await executarDfds(p, saida, alvo, m.d);
    assert.equal(m.linhas.get("k1")?.estado, "ok", "registrado mas ausente na Centi: anexado de novo");
    assert.equal(m.linhas.get("k2")?.estado, "ja");
    assert.match(m.linhas.get("k2")?.erro ?? "", /Já está no protocolo da Centi \(documento 61\)/);
    assert.deepEqual({ ok: fim.ok, ja: fim.ja }, { ok: 1, ja: 1 });
    const aut = chamadas.filter((c) => c.url.includes("/autorizar"));
    assert.equal(aut.length, 1);
    assert.equal((aut[0].corpo as { ausenteNaCenti?: boolean }).ausenteNaCenti, true, "o registro não impede reenviar o que a Centi não tem");
  });

  it("interromper: as linhas em curso/na fila viram 'interrompido' e a execução é CANCELADA", async () => {
    const chamadas = servidorFalso();
    const p = plano(3);
    let n = 0;
    const m = montar({
      interrompido: () => n >= 1,
      pedirExt: (acao) => {
        if (acao === "anexar") n++;
        return undefined;
      },
    });
    for (const a of p) for (const t of a.partes) m.linhas.set(t.chave, { ...t, estado: "fila" });
    const fim = await executarDfds(p, saida, alvo, m.d);
    assert.equal(fim.interrompido, true);
    assert.equal(m.linhas.get("k1")?.estado, "ok");
    assert.equal(m.linhas.get("k2")?.estado, "interrompido");
    assert.equal(m.linhas.get("k3")?.estado, "interrompido");
    assert.ok(chamadas.some((c) => c.metodo === "PATCH" && (c.corpo as { estado?: string })?.estado === "cancelada"));
  });

  it("uma exceção no meio nunca deixa linha 'em curso' nem a execução rodando", async () => {
    const chamadas = servidorFalso();
    const p = plano(2);
    const m = montar({
      pedirExt: (acao) => {
        if (acao === "ler") throw new Error("boom");
        return undefined;
      },
    });
    for (const a of p) for (const t of a.partes) m.linhas.set(t.chave, { ...t, estado: "fila" });
    const fim = await executarDfds(p, saida, alvo, m.d);
    assert.match(fim.erro ?? "", /boom/);
    for (const l of m.linhas.values()) assert.equal(l.estado, "falha");
    const passos = chamadas.filter((c) => c.url.endsWith("/passos")).flatMap((c) => (c.corpo as { passos: { estado: string }[] }).passos);
    assert.equal(passos.filter((x) => x.estado === "falhou").length, 2, "cada arquivo é concluído no servidor com o motivo");
  });

  it("baixar: o resultado de TODOS os DFDs vai ao servidor (o que não foi emitido também)", async () => {
    const chamadas = servidorFalso();
    const p = plano(2);
    const m = montar({ pedirExt: (acao, dados) => (acao === "ler" && JSON.stringify(dados).includes("102") ? { ok: false, erro: "sessão encerrada" } : undefined) });
    for (const a of p) for (const t of a.partes) m.linhas.set(t.chave, { ...t, estado: "fila" });
    const sPasta = lerOpcoesSaida({ destino: "pasta", formato: "separados", conferir: false, escolherPasta: false });
    // O 2º DFD cai na sessão encerrada (o lote para); o 1º seria baixado pelo navegador (sem DOM aqui: falha na gravação).
    await executarDfds(p, sPasta, null, { ...m.d, pasta: null }).catch(() => null);
    const passos = chamadas.filter((c) => c.url.endsWith("/passos")).flatMap((c) => (c.corpo as { passos: { chave: string; estado: string }[] }).passos);
    assert.deepEqual(new Set(passos.map((x) => x.chave)), new Set(["k1", "k2"]));
  });
});

/* ── A reconciliação no servidor (driver D1 real) ────────────────────────────────────────────────────────────────── */

describe("reconciliação: execução ABANDONADA vira 'falhou' (nunca 'rodando' para sempre)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    db = new DatabaseSync(":memory:");
    for (const arq of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(process.cwd(), "drizzle", arq), "utf8"));
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO usuarios (id, email, nome, senha_hash) VALUES (1, 'a@x', 'A', 'x')");
    db.exec("INSERT INTO automacao_execucoes (id, receita, usuario_id, estado, atualizado_em) VALUES (1, 'anexar-dfds', 1, 'rodando', '2026-01-01 10:00:00'), (2, 'anexar-dfds', 1, 'rodando', '2026-01-01 11:00:00'), (3, 'anexar-dfds', 1, 'concluida', '2026-01-01 08:00:00')");
  });

  it("só a parada além do limite; os passos pendentes levam o motivo; os concluídos ficam; totais recontados", async () => {
    await orm.batch([...comandosPassos(orm, 1, [{ chave: "a", capacidade: "anexar", alvo: "x" }, { chave: "b", capacidade: "anexar", alvo: "y" }])] as never);
    await orm.batch([...comandosPassos(orm, 2, [{ chave: "a", capacidade: "anexar", alvo: "x" }])] as never);
    db.exec("UPDATE automacao_passos SET estado = 'ok' WHERE execucao_id = 1 AND chave = 'a'");
    assert.equal(limiteAbandono(Date.UTC(2026, 0, 1, 11, 0, 0), 30), "2026-01-01 10:30:00");
    await orm.batch(comandosReconciliarExecucoes(orm, "2026-01-01 10:30:00") as never);
    const e = db.prepare("SELECT id, estado, erro, feitos, falhas FROM automacao_execucoes ORDER BY id").all() as Record<string, unknown>[];
    assert.deepEqual(
      e.map((x) => ({ ...x })),
      [
        { id: 1, estado: "falhou", erro: MSG_ABANDONO, feitos: 1, falhas: 1 },
        { id: 2, estado: "rodando", erro: null, feitos: 0, falhas: 0 },
        { id: 3, estado: "concluida", erro: null, feitos: 0, falhas: 0 },
      ],
    );
    const ps = db.prepare("SELECT chave, estado FROM automacao_passos WHERE execucao_id = 1 ORDER BY chave").all() as Record<string, unknown>[];
    assert.deepEqual(ps.map((x) => ({ ...x })), [{ chave: "a", estado: "ok" }, { chave: "b", estado: "falhou" }]);
  });

  it("o SINAL DE VIDA ('executando') nunca faz um passo concluído voltar atrás", async () => {
    db.exec("UPDATE automacao_passos SET estado = 'ok' WHERE execucao_id = 2");
    await orm.batch([comandoAtualizarPasso(orm, 2, "a", { estado: "executando" }), comandoRecontar(orm, 2)] as never);
    assert.equal((db.prepare("SELECT estado FROM automacao_passos WHERE execucao_id = 2").get() as { estado: string }).estado, "ok");
    db.exec("INSERT INTO automacao_passos (execucao_id, ordem, chave, capacidade) VALUES (2, 1, 'b', 'anexar')");
    await orm.batch([comandoAtualizarPasso(orm, 2, "b", { estado: "executando" })] as never);
    assert.equal((db.prepare("SELECT estado FROM automacao_passos WHERE execucao_id = 2 AND chave = 'b'").get() as { estado: string }).estado, "executando");
  });
});

describe("conferência no protocolo (o que foi anexado e o que falta)", () => {
  it("a Centi é a verdade: anexado · falta · registrado mas ausente · sem protocolo", () => {
    const docs = new Map<string, { descricao: string; sequencial: string; id: string }[] | { erro: string }>([
      ["9", [{ descricao: "PMRV - PCA 2027 - (1)  - 2026", sequencial: "61", id: "5001" }]],
      ["8", { erro: "Não abriu." }],
    ]);
    const arq = (nome: string, alvoId: string | null, dfds = 2) => ({ nome: `${nome}.pdf`, descricao: nome, dfds, protocolo: "156844/2026", alvoId });
    const linhas = conferenciaAnexos(
      [arq("pmrv - pca 2027 - (1) - 2026", "9"), arq("FME - PCA 2027 - (2) - 2026", "9", 4), arq("FMS - PCA 2027 - (3) - 2026", "9", 3), arq("X", "8"), arq("Y", null)],
      docs,
      new Set(["9|FMS - PCA 2027 - (3) - 2026"]),
    );
    assert.deepEqual(
      linhas.map((l) => l.situacao),
      ["anexado", "falta", "ausente", "semProtocolo", "semProtocolo"],
    );
    assert.equal(linhas[0].documento?.sequencial, "61");
    assert.equal(linhas[3].erro, "Não abriu.");
    assert.deepEqual(resumoConferencia(linhas), { arquivos: 5, anexados: 1, faltam: 1, ausentes: 1, semProtocolo: 2, dfdsFaltando: 7 });
  });
});
