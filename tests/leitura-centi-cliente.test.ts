import assert from "node:assert/strict";
import test from "node:test";
import type { LoteCenti, PassoLote } from "../src/lib/empenhos-core.ts";
import { lerAnoNaCenti, lerPaginaNoNavegador, PARALELO_LIQUIDACOES, passoVazio } from "../src/lib/leitura-centi-cliente.ts";

/** Um servidor falso: `baixar` devolve a página CRUA (uma lista vazia) depois de um atraso — conta quantos pedidos correm ao
 * mesmo tempo —, ou o passo de erro em JSON; `parte` devolve o passo (com o `continuar` da página). */
function servidor(responder: (c: { inicio: string; fim: string; pagina: number }) => Partial<{ continuar: boolean; dividir: unknown; erro: unknown; status: number }>) {
  const pedidos: string[] = [];
  const pendentes = new Map<string, Partial<{ continuar: boolean }>>();
  let emCurso = 0;
  let maximo = 0;
  const json = (status: number, corpo: unknown) => ({ status, ok: status < 400, headers: { get: () => null }, json: async () => corpo });
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const c = JSON.parse(init.body);
    const k = `${c.inicio}|${c.fim}|${c.pagina}`;
    if (c.acao === "parte") return json(200, { ok: true, lote: LOTE, passo: { ...passoVazio(pedidos.length, c, c.pagina), estado: "ok", id: pedidos.length }, ...pendentes.get(k) });
    pedidos.push(`${c.inicio}|${c.pagina}`);
    emCurso++;
    maximo = Math.max(maximo, emCurso);
    await new Promise((ok) => setTimeout(ok, 1 + Math.floor(Math.random() * 4)));
    emCurso--;
    const r = responder(c);
    const status = r.status ?? 200;
    if (status >= 400) return json(status, { ok: false, error: "recusado" });
    if (r.dividir || r.erro) return json(200, { ok: true, lote: LOTE, passo: { ...passoVazio(pedidos.length, c, c.pagina), estado: "dividido" }, ...r });
    pendentes.set(k, r);
    return { status: 200, ok: true, headers: { get: (h: string) => (h === "x-centi-status" ? "200" : null) }, text: async () => "[]" };
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

test("página no navegador: o JSON é lido AQUI e vai em partes de tamanho fixo; a leitura que falha vira o passo de erro", async () => {
  const enviados: Record<string, unknown>[] = [];
  const regs = Array.from({ length: 3200 }, (_, i) => ({ IdOrdemPagamento: i + 1, IdNotaEmpenho: 9, Orgao: "P", ValorLiquido: 1, PossuiAnulacao: false }));
  let resposta = JSON.stringify(regs);
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const c = JSON.parse(init.body);
    enviados.push(c);
    if (c.acao === "baixar") return { status: 200, ok: true, headers: { get: (h: string) => (h === "x-centi-status" ? "200" : null) }, text: async () => resposta };
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ ok: true, lote: c.acao === "parte" && c.resumo == null ? null : LOTE, passo: { ...passoVazio(7, c, 1), id: 7 } }) };
  }) as never;
  const base = { lote: 1, condutor: "x", inicio: "2025-03-01", fim: "2025-03-31", pagina: 1 };
  await lerPaginaNoNavegador(1, "pagamentos", 2025, base);
  const partes = enviados.filter((c) => c.acao === "parte");
  assert.equal(partes.length, 3, "3.200 linhas = 3 partes de até 1.500");
  assert.deepEqual(partes.map((p) => p.passo), [null, 7, 7], "a 1ª cria o passo; as seguintes vão pelo id dele");
  assert.equal((partes[2].resumo as { recebidos: number }).recebidos, 3200);
  assert.ok(partes.slice(0, -1).every((p) => p.resumo === null));
  enviados.length = 0;
  resposta = "<html>erro</html>";
  await lerPaginaNoNavegador(1, "pagamentos", 2025, base);
  assert.deepEqual(enviados.map((c) => c.acao), ["baixar", "falha"]);
  assert.match(String(enviados[1].mensagem), /não é JSON/);
});
