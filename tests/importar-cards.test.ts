import assert from "node:assert/strict";
import test from "node:test";
import type { ResumoCard } from "../src/lib/empenho-cards-core.ts";
import { proximaAtualizacaoMs, proximaDoCard, textoIntervalo } from "../src/lib/empenho-cards-core.ts";
import { anoMaisRecente, importarCards, type LinhaImportacao, ordemDeImportacao, perguntaDeQueda, prepararCards, resumoImportacao } from "../src/lib/importar-cards.ts";

// O EXECUTOR do "Importar tudo" e do "Importar agora" das KPIs da Execução: o que vai, em que ano e em que ordem.

const card = (id: number, o: Partial<ResumoCard> = {}): ResumoCard => ({ id, tipo: "empenhos", nome: `Card ${id}`, anos: [0], configuradoEm: "2026-01-01", vinculos: 1, parametros: "", ...o }) as ResumoCard;

test("prepararCards: pula o card a configurar, o conduzido por outro e o ano fora; retoma o lote aberto", async () => {
  const original = globalThis.fetch;
  const abertos: Record<number, unknown> = { 3: { ano: 2025, conduzido: true }, 4: { id: 9, ano: 2025, conduzido: false } };
  globalThis.fetch = (async (url: string) => {
    const id = Number(/cards\/(\d+)\//.exec(url)?.[1]);
    return new Response(JSON.stringify({ ok: true, emAndamento: abertos[id] ?? null }));
  }) as typeof fetch;
  try {
    const cards = [card(1), card(2, { configuradoEm: null }), card(3), card(4), card(5, { anos: [2020] })];
    const l = await prepararCards(cards, (c) => anoMaisRecente(c, 2026), 2026);
    const por = (id: number) => l.find((x) => x.card.id === id) as LinhaImportacao;
    assert.equal(por(1).estado, "fila");
    assert.equal(por(1).ano, 2026);
    assert.equal(por(2).estado, "pulado");
    assert.equal(por(3).estado, "pulado");
    assert.equal(por(4).estado, "fila");
    assert.equal(por(4).ano, 2025);
    assert.ok(por(4).retomar);
    // O card de 2020 importa o ano mais recente DELE.
    assert.equal(por(5).estado, "fila");
    assert.equal(por(5).ano, 2020);
  } finally {
    globalThis.fetch = original;
  }
});

test("a ordem: os empenhos primeiro; o resumo conta os desfechos", () => {
  const l = (id: number, tipo: ResumoCard["tipo"], estado: LinhaImportacao["estado"] = "fila"): LinhaImportacao => ({ card: card(id, { tipo }), estado, texto: "", fracao: 0, ano: 2026, retomar: null });
  assert.deepEqual(
    ordemDeImportacao([l(1, "pagamentos"), l(2, "empenhos"), l(3, "liquidacoes"), l(4, "empenhos", "pulado")]).map((x) => x.card.id),
    [2, 1, 3],
  );
  assert.deepEqual(resumoImportacao([l(1, "empenhos", "gravado"), l(2, "empenhos", "gravado")]), { texto: "2 gravados", tom: "ok" });
  assert.equal(resumoImportacao([l(1, "empenhos", "gravado"), l(2, "empenhos", "falhou")]).tom, "erro");
  assert.equal(resumoImportacao([l(1, "empenhos", "parcial")]).tom, "aviso");
  assert.equal(resumoImportacao([]).texto, "Nenhum card a importar.");
});

test("as quedas perguntam UMA por vez", async () => {
  const ordem: string[] = [];
  let soltar: (v: boolean) => void = () => {};
  const confirmar = (p: { titulo: string }) =>
    new Promise<boolean>((ok) => {
      ordem.push(p.titulo);
      soltar = ok;
    });
  const perguntar = perguntaDeQueda(confirmar);
  const lin = (n: number): LinhaImportacao => ({ card: card(n), estado: "lendo", texto: "", fracao: 0, ano: 2026, retomar: null });
  const a = perguntar(lin(1), "q");
  const b = perguntar(lin(2), "q");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(ordem.length, 1);
  soltar(true);
  assert.equal(await a, true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(ordem.length, 2);
  soltar(false);
  assert.equal(await b, false);
});

test("parar antes de começar: nenhum card é importado e todos ficam \"não iniciado\"", async () => {
  const linhas: LinhaImportacao[] = [card(1), card(2, { tipo: "liquidacoes" })].map((c) => ({ card: c, estado: "fila", texto: "", fracao: 0, ano: 2026, retomar: null }));
  const mudou: Record<number, Partial<LinhaImportacao>> = {};
  await importarCards(linhas, { regra: "marcar", parar: () => true, onLinha: (id, m) => (mudou[id] = m) });
  assert.equal(mudou[1]?.estado, "interrompido");
  assert.equal(mudou[2]?.estado, "interrompido");
});

test("prepararCards: o card atualizado há pouco espera o intervalo mínimo", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, emAndamento: null, intervalo: { ate: "2099-01-01T00:00:00Z", texto: "espere" } }))) as typeof fetch;
  try {
    const [l] = await prepararCards([card(1)], () => 2026, 2026);
    assert.equal(l.estado, "pulado");
    assert.equal(l.texto, "espere");
  } finally {
    globalThis.fetch = original;
  }
});

test("intervalo mínimo: conta da última importação CONCLUÍDA; depois de falha, já pode", () => {
  const agora = Date.parse("2026-10-28T12:00:00Z");
  assert.equal(proximaAtualizacaoMs("2026-10-28 11:50:00", 30, agora), Date.parse("2026-10-28T12:20:00Z"));
  assert.equal(proximaAtualizacaoMs("2026-10-28 11:00:00", 30, agora), null, "passou o intervalo");
  assert.equal(proximaAtualizacaoMs("2026-10-28 11:59:00", 0, agora), null, "sem intervalo");
  assert.equal(proximaAtualizacaoMs(null, 30, agora), null);
  assert.equal(proximaDoCard({ ultimaExecucao: "2026-10-28 11:50:00", ultimoStatus: "falhou" }, 30, agora), null, "a correção depois da falha");
  assert.ok(proximaDoCard({ ultimaExecucao: "2026-10-28 11:50:00", ultimoStatus: "completo" }, 30, agora));
  assert.match(textoIntervalo(Date.parse("2026-10-28T12:20:00Z"), 30, agora), /09:20 \(em 20 min; intervalo mínimo de 30 minutos\)/);
});
