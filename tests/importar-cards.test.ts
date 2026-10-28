import assert from "node:assert/strict";
import test from "node:test";
import type { ResumoCard } from "../src/lib/empenho-cards-core.ts";
import { anoMaisRecente, type LinhaImportacao, ordemDeImportacao, perguntaDeQueda, prepararCards, resumoImportacao } from "../src/lib/importar-cards.ts";

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
