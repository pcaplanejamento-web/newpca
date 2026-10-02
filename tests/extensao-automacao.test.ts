// A ABA PRÓPRIA da automação, o ANDAMENTO (selo/cartão/popup) e o INTERROMPER pela extensão (serviço em vm, `chrome` falso).
import assert from "node:assert/strict";
import test from "node:test";
import { INICIO_CENTI, pausa, servicoFalso, TELA } from "./fixtures/chrome-falso.ts";

const POPUP = { url: "chrome-extension://ext/popup.html" };

test("aba própria: abre UMA vez no grupo 'Automação PCA' e a reaproveita; as abas da Centi do usuário não são usadas", async () => {
  const s = servicoFalso({ abas: [{ id: 5, url: `${INICIO_CENTI}minha` }] });
  const [a, b] = (await Promise.all([s.pedir({ acao: "estado", dados: { abrir: true } }), s.pedir({ acao: "estado", dados: { abrir: true } })])) as {
    ok: boolean;
  }[];
  assert.equal(a.ok && b.ok, true);
  const criadas = s.abas.filter((x) => x.id > 100);
  assert.equal(criadas.length, 1);
  assert.equal(s.grupos.find((g) => g.id === criadas[0].groupId)?.title, "Automação PCA");
  assert.ok(s.enviados.every((e) => e.tabId !== 5));
  await s.pedir({ acao: "pedir", dados: {} });
  assert.equal(s.abas.filter((x) => x.id > 100).length, 1);
  assert.ok(s.enviados.some((e) => e.tabId === criadas[0].id && e.m.acao === "pedir"));
});

test("aba própria: fechada pelo usuário, a conferência a cada 20 s não reabre; Verificar e os pedidos reabrem", async () => {
  const s = servicoFalso({ abas: [{ id: 1, url: INICIO_CENTI }], sessao: { abaAutomacao: 1 } });
  s.fecharAba(1);
  await pausa(5);
  const r = (await s.pedir({ acao: "estado" })) as { ok: boolean; motivo: string };
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "semAba");
  assert.equal(s.abas.length, 0);
  const v = (await s.pedir({ acao: "estado", dados: { abrir: true } })) as { ok: boolean };
  assert.equal(v.ok, true);
  assert.equal(s.abas.length, 1);
});

test("aba própria: depois de reabrir o Chrome, é achada pelo grupo 'Automação PCA'", async () => {
  const s = servicoFalso({ abas: [{ id: 8, url: INICIO_CENTI, groupId: 3 }, { id: 9, url: INICIO_CENTI }], grupos: [{ id: 3, title: "Automação PCA" }] });
  const r = (await s.pedir({ acao: "estado" })) as { ok: boolean };
  assert.equal(r.ok, true);
  assert.equal(s.abas.length, 2);
  assert.equal(s.sessao.abaAutomacao, 8);
});

test("andamento: o selo do ícone conta os DFDs e o cartão da aba recebe o passo", async () => {
  const s = servicoFalso({ abas: [{ id: 1, url: INICIO_CENTI }], sessao: { abaAutomacao: 1 } });
  const ini = (await s.pedir({ acao: "lote", dados: { fase: "inicio", titulo: "Baixar DFDs da Centi", total: 15 } })) as { loteId: string };
  await s.pedir({ acao: "lote", dados: { fase: "passo", loteId: ini.loteId, texto: "Emitindo planejamento 7", feito: 3, total: 15 } });
  assert.equal(s.selos.at(-1), "3/15");
  const painel = s.enviados.filter((e) => e.m.alvo === "painel").at(-1)?.m.atividade as { passo: string };
  assert.equal(painel.passo, "Emitindo planejamento 7");
  await s.pedir({ acao: "lote", dados: { fase: "fim", loteId: ini.loteId, resumo: "Lote terminado." } });
  assert.equal(s.selos.at(-1), "OK");
});

test("interromper: pelo popup, os pedidos DO LOTE param (os de fora dele seguem) até um lote novo", async () => {
  const s = servicoFalso({ abas: [{ id: 1, url: INICIO_CENTI }], sessao: { abaAutomacao: 1 } });
  const ini = (await s.pedir({ acao: "lote", dados: { fase: "inicio", titulo: "Anexar", total: 2 } })) as { loteId: string };
  await s.pedir({ tipo: "interromper" }, POPUP);
  assert.equal(s.selos.at(-1), "X");
  const r = (await s.pedir({ acao: "pedir", dados: {}, lote: ini.loteId })) as { ok: boolean; interrompido: boolean };
  assert.equal(r.ok, false);
  assert.equal(r.interrompido, true);
  assert.ok(!s.enviados.some((e) => e.m.acao === "pedir"));
  const fora = (await s.pedir({ acao: "protocolo", dados: {} })) as { ok: boolean };
  assert.equal(fora.ok, true);
  const novo = (await s.pedir({ acao: "lote", dados: { fase: "inicio", titulo: "Anexar", total: 1 } })) as { loteId: string };
  const ok = (await s.pedir({ acao: "pedir", dados: {}, lote: novo.loteId })) as { ok: boolean };
  assert.equal(ok.ok, true);
});

test("interromper: só o popup, o banner e o cartão da ABA DA AUTOMAÇÃO podem; outra aba da Centi ou uma página de fora não", async () => {
  const s = servicoFalso({ abas: [{ id: 1, url: INICIO_CENTI }, { id: 2, url: INICIO_CENTI }], sessao: { abaAutomacao: 1 } });
  await s.pedir({ acao: "lote", dados: { fase: "inicio", titulo: "Anexar", total: 2 } });
  await s.pedir({ tipo: "interromper" }, { url: INICIO_CENTI, tab: { id: 2 } });
  await s.pedir({ tipo: "interromper" }, { url: "https://exemplo.com/", tab: { id: 3 } });
  assert.equal((s.sessao.atividade as { estado: string }).estado, "rodando");
  await s.pedir({ tipo: "interromper" }, { url: INICIO_CENTI, tab: { id: 1 } });
  assert.equal((s.sessao.atividade as { estado: string }).estado, "interrompido");
});

test("F5 na tela do sistema: o lote que ela dirigia é marcado como parado (a extensão não segue sozinha)", async () => {
  const s = servicoFalso({ abas: [{ id: 1, url: INICIO_CENTI }, { id: 50, url: TELA }], sessao: { abaAutomacao: 1 } });
  await s.pedir({ acao: "lote", dados: { fase: "inicio", titulo: "Baixar", total: 4 } });
  s.atualizarAba(50, { status: "loading" });
  await pausa(10);
  const a = s.sessao.atividade as { estado: string; passo: string };
  assert.equal(a.estado, "parado");
  assert.match(a.passo, /recarregada/);
  const e = (await s.pedir({ acao: "estado" })) as { atividade: { estado: string } };
  assert.equal(e.atividade.estado, "parado");
});
