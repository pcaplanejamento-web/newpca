import assert from "node:assert/strict";
import test from "node:test";
import type { LoteCenti, PassoLote } from "../src/lib/empenhos-core.ts";
import { lerAnoNaCenti, PARALELO_LIQUIDACOES, passoVazio } from "../src/lib/leitura-centi-cliente.ts";

/** Um servidor falso: responde cada página depois de um atraso; conta quantos pedidos correm ao mesmo tempo. */
function servidor(responder: (c: { inicio: string; fim: string; pagina: number }) => Partial<{ continuar: boolean; dividir: unknown; erro: unknown; status: number }>) {
  const pedidos: string[] = [];
  let emCurso = 0;
  let maximo = 0;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const c = JSON.parse(init.body);
    pedidos.push(`${c.inicio}|${c.pagina}`);
    emCurso++;
    maximo = Math.max(maximo, emCurso);
    await new Promise((ok) => setTimeout(ok, 1 + Math.floor(Math.random() * 4)));
    emCurso--;
    const r = responder(c);
    const status = r.status ?? 200;
    return {
      status,
      ok: status < 400,
      json: async () => (status >= 400 ? { ok: false, error: "recusado" } : { ok: true, lote: LOTE, passo: { ...passoVazio(pedidos.length, c, c.pagina), estado: "ok" }, ...r }),
    };
  }) as never;
  return { pedidos, maximo: () => maximo };
}

const LOTE = { id: 1, ano: 2026, modo: "liquidacoes", orgaosCenti: [2, 3, 8, 9, 10, 11, 12, 13], vistoEm: "2026-01-01 00:00:00" } as unknown as LoteCenti;
const base = (lote: LoteCenti, anteriores: PassoLote[] = [], parar = () => false) => {
  let onde = "";
  return {
    o: { cardId: 1, lote, anteriores, condutor: "x", comPeriodo: true, parar, onPasso: () => {}, onLote: () => {}, onAgora: () => {}, idLocal: () => -1, onde: (t: string) => (onde = t) },
    onde: () => onde,
  };
};

test("leitura em paralelo: liquidações = todos os órgãos de cada semana, no máximo 6 ao mesmo tempo", async () => {
  const s = servidor(() => ({}));
  const lote = { ...LOTE, ano: 2026 } as LoteCenti;
  await lerAnoNaCenti(base(lote).o);
  const semanas = new Set(s.pedidos.map((p) => p.split("|")[0]));
  assert.equal(s.pedidos.length, semanas.size * 8, "cada semana pede os 8 órgãos, uma vez cada");
  assert.equal(new Set(s.pedidos).size, s.pedidos.length, "nenhum pedido repetido");
  assert.ok(s.maximo() <= PARALELO_LIQUIDACOES && s.maximo() > 1, `em paralelo, até ${PARALELO_LIQUIDACOES} (foram ${s.maximo()})`);
});

test("leitura em paralelo: a retomada pede só os órgãos que faltam; a divisão recomeça as metades com todos os órgãos", async () => {
  const p = (inicio: string, fim: string, pagina: number, fimPeriodo = false) => ({ ...passoVazio(pagina, { inicio, fim }, pagina), estado: "ok" as const, fimPeriodo });
  // A 1ª semana: lidos os órgãos 1 e 3 (falta o 2 e os de 4 a 8); a 2ª dividida (grande demais no órgão 1).
  const anteriores = [p("2026-01-01", "2026-01-07", 1), p("2026-01-01", "2026-01-07", 3)];
  let dividiu = false;
  const s = servidor((c) => {
    if (c.inicio === "2026-01-08" && c.fim === "2026-01-14" && !dividiu) {
      dividiu = true;
      return { dividir: [{ inicio: "2026-01-08", fim: "2026-01-11" }, { inicio: "2026-01-12", fim: "2026-01-14" }] };
    }
    return {};
  });
  await lerAnoNaCenti(base(LOTE, anteriores as PassoLote[]).o);
  const da1 = s.pedidos.filter((x) => x.startsWith("2026-01-01")).map((x) => Number(x.split("|")[1])).sort((a, b) => a - b);
  assert.deepEqual(da1, [2, 4, 5, 6, 7, 8], "só os órgãos que faltavam");
  for (const metade of ["2026-01-08", "2026-01-12"]) {
    const n = s.pedidos.filter((x) => x.startsWith(`${metade}|`)).length;
    assert.ok(n >= 8, `a metade ${metade} lê os 8 órgãos (${n})`);
  }
});

test("leitura em paralelo: a 1ª falha para de começar novos, espera os em curso e diz ONDE falhou", async () => {
  servidor((c) => (c.inicio === "2026-02-08" && c.pagina === 3 ? { status: 409 } : {}));
  const b = base(LOTE);
  await assert.rejects(lerAnoNaCenti(b.o), /recusado/);
  assert.match(b.onde(), /órgão 3$/);
});

test("leitura em paralelo: empenhos = várias semanas ao mesmo tempo, as páginas de uma semana em sequência", async () => {
  const lote = { ...LOTE, modo: "dados", orgaosCenti: null } as unknown as LoteCenti;
  const vistas = new Map<string, number[]>();
  const s = servidor((c) => {
    const l = vistas.get(c.inicio) ?? [];
    l.push(c.pagina);
    vistas.set(c.inicio, l);
    return { continuar: c.pagina < 3 };
  });
  await lerAnoNaCenti(base(lote).o);
  for (const [semana, paginas] of vistas) assert.deepEqual(paginas, [1, 2, 3], `semana ${semana} em sequência`);
  assert.ok(s.maximo() > 1 && s.maximo() <= 4, `semanas em paralelo, até 4 (foram ${s.maximo()})`);
});
