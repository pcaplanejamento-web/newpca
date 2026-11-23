import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { type ArquivoSaida, lerConfigCenti, lerOpcoesSaida, type TarefaCenti } from "../src/lib/automacao-centi-core.ts";
import type { LinhaDfd } from "../src/lib/automacao-dfds-estado.ts";
import { type DepsExecucao, executarDfds } from "../src/lib/automacao-dfds-motor.ts";

/* Regressões da auditoria do motor do Baixar/anexar DFDs (extensão e servidor falsos). */

type Chamada = { url: string; metodo: string; corpo: unknown };
const fetchOriginal = globalThis.fetch;

function servidorFalso() {
  const chamadas: Chamada[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ url: String(url), metodo: init?.method ?? "GET", corpo });
    const resp = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
    if (String(url).endsWith("/execucoes") && init?.method === "POST") return resp({ ok: true, id: 7 });
    if (String(url).includes("/autorizar")) return resp({ ok: true, token: "t" });
    if (String(url).includes("/registros") && (init?.method ?? "GET") === "GET") return resp({ ok: true, registros: [] });
    return resp({ ok: true });
  }) as typeof fetch;
  return chamadas;
}

let PDF = "";
before(async () => {
  // Um PDF de verdade: o arquivo unido passa pelo pdf-lib.
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  PDF = Buffer.from(await doc.save()).toString("base64");
});
const tarefa = (n: number): TarefaCenti => ({ chave: `k${n}`, id: String(100 + n), dfd: String(n), orgao: "7", orgaoNome: "AMAE", grupo: "P" });
const LOAD_OK = { Entity: { Fields: [{ Key: "IdPlanejamentoAssinaturaDFD", Value: { Fields: [{ Key: "Id", Value: 900 }] } }] } };

function montar(pedirExt: (acao: string, dados: unknown) => unknown = () => undefined) {
  const linhas = new Map<string, LinhaDfd>();
  const pedidos: string[] = [];
  const d: DepsExecucao = {
    pedir: async (acao, dados) => {
      pedidos.push(acao);
      const r = pedirExt(acao, dados);
      if (r !== undefined) return r as never;
      if (acao === "protocolo") return { ok: true, protocolo: { id: "9", numero: "156844", ano: "2026", assunto: "", descricao: "", documentos: 0 } };
      if (acao === "ler") return { ok: true, j: LOAD_OK } as never;
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
    },
    marcarVarias: (f) => {
      for (const [k, l] of linhas) {
        const m = f(l);
        if (m) linhas.set(k, { ...l, ...m });
      }
    },
  };
  return { d, linhas, pedidos };
}

describe("auditoria — motor do Baixar/anexar DFDs", () => {
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });
  const alvo = { id: "9", numero: "156844", ano: "2026" };

  it("PDF unido com um DFD que falhou NÃO é anexado (o parcial passaria por 'já estava' depois)", async () => {
    const chamadas = servidorFalso();
    const plano: ArquivoSaida[] = [{ pastas: [], nome: "Protocolo 156844.pdf", partes: [tarefa(1), tarefa(2), tarefa(3)] }];
    // O 2º planejamento não abre na Centi (falha só dele, sem parar o lote).
    const m = montar((acao, dados) => (acao === "ler" && JSON.stringify(dados).includes("102") ? { ok: true, j: { Entity: null, Message: "Sem acesso" } } : undefined));
    for (const t of plano[0].partes) m.linhas.set(t.chave, { ...t, estado: "fila" });
    const saida = lerOpcoesSaida({ destino: "protocolo", formato: "protocolo", conferir: false });
    await executarDfds(plano, saida, alvo, m.d);
    assert.ok(!m.pedidos.includes("anexar"), "nada é anexado com a união incompleta");
    assert.equal(m.linhas.get("k1")?.estado, "falha");
    assert.match(m.linhas.get("k1")?.erro ?? "", /incompleto/);
    assert.equal(m.linhas.get("k3")?.estado, "falha");
    const passos = chamadas.filter((c) => c.url.endsWith("/passos")).flatMap((c) => (c.corpo as { passos: { estado: string }[] }).passos);
    assert.ok(passos.some((p) => p.estado === "falhou"), "o passo do arquivo é concluído como falhou");
  });

  it("falha passageira no último passo: a 1ª falha não conclui o passo antes da nova tentativa", async () => {
    const chamadas = servidorFalso();
    let n = 0;
    const m = montar((acao) => (acao === "anexar" ? (++n === 1 ? { ok: false, erro: "Tempo esgotado na extensão." } : { ok: true, sequencial: "5" }) : undefined));
    const plano: ArquivoSaida[] = [{ pastas: [], nome: "Planejamento 101.pdf", partes: [tarefa(1)] }];
    m.linhas.set("k1", { ...tarefa(1), estado: "fila" });
    await executarDfds(plano, lerOpcoesSaida({ destino: "protocolo", formato: "separados", conferir: false }), alvo, m.d);
    const falhou = chamadas.filter((c) => c.url.endsWith("/passos")).flatMap((c) => (c.corpo as { passos: { estado: string }[] }).passos).filter((p) => p.estado === "falhou");
    assert.equal(falhou.length, 0, "nenhum passo 'falhou' (a execução seguiria rodando para a 2ª autorização)");
    assert.equal(m.linhas.get("k1")?.estado, "ok");
  });

  it("falha não passageira: o passo é concluído como falhou UMA vez", async () => {
    const chamadas = servidorFalso();
    const m = montar((acao) => (acao === "anexar" ? { ok: false, erro: "Protocolo não confere." } : undefined));
    const plano: ArquivoSaida[] = [{ pastas: [], nome: "Planejamento 101.pdf", partes: [tarefa(1)] }];
    m.linhas.set("k1", { ...tarefa(1), estado: "fila" });
    await executarDfds(plano, lerOpcoesSaida({ destino: "protocolo", formato: "separados", conferir: false }), alvo, m.d);
    const falhou = chamadas.filter((c) => c.url.endsWith("/passos")).flatMap((c) => (c.corpo as { passos: { estado: string }[] }).passos).filter((p) => p.estado === "falhou");
    assert.equal(falhou.length, 1);
  });
});
