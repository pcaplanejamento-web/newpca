// Segurança da extensão da Automação (simulada em vm, com um `chrome` falso): a escrita na Centi ("anexar") só passa com
// a autorização de USO ÚNICO consumida no sistema para o MESMO alvo e com a confirmação na janela da extensão.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { COMPRAS, servicoFalso } from "./fixtures/chrome-falso.ts";

const fonte = (n: string) => readFileSync(new URL(`../extensao-centi/${n}`, import.meta.url), "utf8");
// O serviço com a ABA DA AUTOMAÇÃO já aberta (id 1) e a janela de confirmação respondendo `respostaJanela`.
function serviço(respostaJanela: boolean | null) {
  const s = servicoFalso({
    confirmacao: respostaJanela,
    abas: [{ id: 1, url: COMPRAS }],
    sessao: { abaAutomacao: 1 },
  });
  const anexos = () => s.enviados.filter((e) => e.m.alvo === "centi" && e.m.acao === "anexar");
  return {
    pedir: (msg: unknown) => s.pedir(msg),
    get enviados() {
      return anexos();
    },
    janelas: () => s.janelas.filter((u) => u.includes("confirmar.html")).length,
  };
}

const DADOS = { id: "2332778", numero: "156844", ano: "2026", descricao: "Planejamento 1 - DFD 2", pdf: "JVBER" };
const AUT = { execucaoId: 5, chave: "arquivo-1", id: "2332778", numero: "156844", ano: "2026", descricao: "Planejamento 1 - DFD 2" };

test("background: anexar sem a autorização do sistema é recusado", async () => {
  const s = serviço(true);
  const r = (await s.pedir({ acao: "anexar", dados: DADOS })) as { ok: boolean };
  assert.equal(r.ok, false);
  assert.equal(s.enviados.length, 0);
});

test("background: autorização de OUTRO alvo é recusada", async () => {
  const s = serviço(true);
  const r = (await s.pedir({ acao: "anexar", dados: { ...DADOS, id: "999" }, autorizado: AUT })) as { ok: boolean };
  assert.equal(r.ok, false);
  assert.equal(s.enviados.length, 0);
  assert.equal(s.janelas(), 0);
});

test("background: recusar ou fechar a janela de confirmação não grava", async () => {
  for (const resp of [false, null]) {
    const s = serviço(resp);
    const r = (await s.pedir({ acao: "anexar", dados: DADOS, autorizado: AUT })) as { ok: boolean; erro: string };
    assert.equal(r.ok, false);
    assert.match(r.erro, /não confirmado/);
    assert.equal(s.enviados.length, 0);
  }
});

test("background: confirmado grava, e a janela abre UMA vez por execução e protocolo", async () => {
  const s = serviço(true);
  const r1 = (await s.pedir({ acao: "anexar", dados: DADOS, autorizado: AUT })) as { ok: boolean };
  const r2 = (await s.pedir({ acao: "anexar", dados: { ...DADOS, descricao: "X" }, autorizado: { ...AUT, descricao: "X" } })) as { ok: boolean };
  assert.equal(r1.ok && r2.ok, true);
  assert.equal(s.enviados.length, 2);
  assert.equal(s.janelas(), 1);
  await s.pedir({ acao: "anexar", dados: DADOS, autorizado: { ...AUT, execucaoId: 6 } });
  assert.equal(s.janelas(), 2);
});

test("extensão: sem localhost em produção (só o site do sistema fala com ela)", () => {
  assert.ok(!fonte("background.js").includes("localhost"));
  assert.ok(!fonte("manifest.json").includes("localhost"));
});

function ponte(respostaServidor: { status: number; corpo: unknown }) {
  const ouvintes: ((e: unknown) => void)[] = [];
  const postados: unknown[] = [];
  const enviados: unknown[] = [];
  const pedidos: { url: string; corpo: unknown }[] = [];
  const window: Record<string, unknown> = {
    location: { origin: "https://governarv.com.br" },
    addEventListener: (_t: string, f: (e: unknown) => void) => ouvintes.push(f),
    postMessage: (m: unknown) => postados.push(m),
  };
  const chrome = {
    runtime: {
      getManifest: () => ({ version: "1.4.0" }),
      sendMessage: (m: unknown, f: (r: unknown) => void) => {
        enviados.push(m);
        f({ ok: true });
      },
      lastError: undefined,
    },
  };
  const fetch = async (url: URL, init: { body: string }) => {
    pedidos.push({ url: String(url), corpo: JSON.parse(init.body) });
    return { ok: respostaServidor.status === 200, status: respostaServidor.status, json: async () => respostaServidor.corpo };
  };
  vm.runInNewContext(fonte("sistema-ponte.js"), { window, chrome, fetch, URL, JSON, Promise });
  const enviar = async (dados: unknown) => {
    for (const f of ouvintes) f({ source: window, origin: "https://governarv.com.br", data: { fonte: "pca-automacao", v: "1.4.0", id: 1, acao: "anexar", dados } });
    await new Promise((ok) => setTimeout(ok, 5));
  };
  return { enviar, postados, enviados, pedidos };
}

test("ponte do sistema: sem token não chega à extensão", async () => {
  const p = ponte({ status: 200, corpo: { ok: true } });
  await p.enviar(DADOS);
  assert.equal(p.enviados.length, 0);
  assert.equal(p.pedidos.length, 0);
});

test("ponte do sistema: consome a autorização para o alvo do PRÓPRIO pedido e leva sem o token", async () => {
  const p = ponte({ status: 200, corpo: { ok: true, execucaoId: 5, chave: "arquivo-1" } });
  await p.enviar({ ...DADOS, autorizacao: { token: "a".repeat(64) } });
  assert.equal(p.pedidos.length, 1);
  assert.match(p.pedidos[0].url, /\/api\/admin\/automacao\/autorizacoes\/consumir$/);
  assert.deepEqual((p.pedidos[0].corpo as { alvo: unknown }).alvo, { id: "2332778", numero: "156844", ano: "2026", descricao: "Planejamento 1 - DFD 2" });
  const m = p.enviados[0] as { dados: Record<string, unknown>; autorizado: { execucaoId: number } };
  assert.equal("autorizacao" in m.dados, false);
  assert.equal(m.autorizado.execucaoId, 5);
});

test("ponte do sistema: autorização recusada pelo servidor não chega à extensão", async () => {
  const p = ponte({ status: 403, corpo: { ok: false, error: "Autorização inválida, já usada ou vencida." } });
  await p.enviar({ ...DADOS, autorizacao: { token: "a".repeat(64) } });
  assert.equal(p.enviados.length, 0);
  const resp = p.postados.find((x) => (x as { resposta?: unknown }).resposta) as { resposta: { ok: boolean; erro: string } };
  assert.equal(resp.resposta.ok, false);
  assert.match(resp.resposta.erro, /já usada/);
});
