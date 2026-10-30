import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { comandosGravarExtrato, comandoTravarCursor, type Gravacao, limiteAusencia } from "../src/lib/frota-sql.ts";
import { retirarImportacao } from "../src/lib/importacoes-ao-vivo-store.ts";
import { importarFrota, partesPrevistas } from "../src/lib/importar-frota-cliente.ts";
import { clienteVolus, MAX_BYTES_MEDIR } from "../src/lib/volus-api.ts";
import { dividirPeriodo, linhasDoExtrato, MAX_BYTES_EXTRATO, partesPara } from "../src/lib/volus-core.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// AUDITORIA DAS IMPORTAÇÕES DA FROTA (v1.258.1): cada defeito encontrado tem o seu teste aqui.

const C = "000617000002";
function banco() {
  const raw = bancoMigrado();
  raw.exec(
    `INSERT INTO orgaos (id, nome, sigla) VALUES (1, 'Prefeitura', 'PMRV'); INSERT INTO frota_estado (id, versao) VALUES (1, 0) ON CONFLICT DO NOTHING; INSERT INTO frota_contratos (codigo, nome, sigla, produto, orgao_id) VALUES ('${C}', 'PMRV', 'PMRV', 'combustivel', 1)`,
  );
  return { raw, db: drizzle(d1Sobre(raw) as never, { schema }) };
}
const tx = (id: string, dia: string) => ({ id, refuel_datetime: `${dia}T10:00:00`, card: { plate: "ABC1D23" }, product: [{ name: "DIESEL", quantity: 10, total_value: 60 }], unit: { name: "AMT" } });
const grav = (carimbo: string): Gravacao => ({ tipo: "abastecimento", contrato: C, inicio: "2026-05-01", fim: "2026-05-31", carimbo, origem: "manual", por: "Teste", bytes: 1, ms: 1, fora: 0 });
async function gravar(b: ReturnType<typeof banco>, carimbo: string, txs: Record<string, unknown>[]) {
  const ls = linhasDoExtrato("abastecimento", C, txs, "2026-05-01", "2026-05-31").linhas;
  await b.db.batch(comandosGravarExtrato(b.db, grav(carimbo), ls) as never);
  return b.raw.prepare("SELECT * FROM frota_leituras ORDER BY id DESC LIMIT 1").get() as Record<string, number>;
}

test("ausência: duas leituras QUASE JUNTAS (manual + automática, ou a nova tentativa) nunca removem; passada a janela, removem", async () => {
  const b = banco();
  await gravar(b, "2026-05-31T12:00:00.000#a", [tx("1", "2026-05-02"), tx("2", "2026-05-03")]);
  let r = await gravar(b, "2026-05-31T12:05:00.000#b", [tx("1", "2026-05-02")]);
  assert.equal(r.ausentes, 1, "a 1ª ausência marca");
  // 2 min depois (a nova tentativa de um pedido que já tinha gravado): não conta.
  r = await gravar(b, "2026-05-31T12:07:00.000#c", [tx("1", "2026-05-02")]);
  assert.equal(r.removidos, 0);
  assert.equal((b.raw.prepare("SELECT ausente, removido_em FROM frota_transacoes WHERE ref_id = '2'").get() as { ausente: number }).ausente, 1);
  // 11 min depois da 1ª ausência: a 2ª leitura de verdade remove.
  r = await gravar(b, "2026-05-31T12:16:00.000#d", [tx("1", "2026-05-02")]);
  assert.equal(r.removidos, 1);
  assert.equal(limiteAusencia("x"), null, "carimbo inválido: sem janela");
});

test("as contagens da leitura usam o índice do carimbo (nenhuma varredura de frota_transacoes)", () => {
  const b = banco();
  const ls = linhasDoExtrato("abastecimento", C, [tx("1", "2026-05-02")], "2026-05-01", "2026-05-31").linhas;
  const cmds = comandosGravarExtrato(b.db, grav("2026-05-31T12:00:00.000#a"), ls) as unknown as { toSQL: () => { sql: string; params: unknown[] } }[];
  for (const c of cmds) {
    const q = c.toSQL();
    const plano = (b.raw.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...(q.params as never[])) as { detail: string }[]).map((x) => x.detail);
    assert.ok(!plano.some((d) => /^SCAN (frota_transacoes|t)\b/.test(d)), `${q.sql.slice(0, 80)}\n${plano.join("\n")}`);
  }
});

test("a trava do cursor: só trava o cursor como foi visto (outra execução que o avançou faz esta desistir)", async () => {
  const b = banco();
  b.raw.exec(`INSERT INTO frota_cursores (contrato, tipo, proximo) VALUES ('${C}', 'abastecimento', '2026-10-20')`);
  const t = { contrato: C, tipo: "abastecimento", inicio: "2026-10-20", novoCiclo: false };
  const agora = "2026-10-29T12:00:00.000Z";
  // Visto com o próximo ANTIGO (outra execução já avançou): não trava.
  assert.equal((await comandoTravarCursor(b.db, t, { proximo: "2026-10-13", cicloConcluidoEm: null }, agora, "2026-10-29T12:02:30.000Z")).length, 0);
  const [ok] = await comandoTravarCursor(b.db, t, { proximo: "2026-10-20", cicloConcluidoEm: null }, agora, "2026-10-29T12:02:30.000Z");
  assert.equal(ok.passo, 7);
  // Travado: outra execução não trava o mesmo (nem com o cursor certo).
  assert.equal((await comandoTravarCursor(b.db, t, { proximo: "2026-10-20", cicloConcluidoEm: null }, "2026-10-29T12:01:00.000Z", "x")).length, 0);
});

test("volus api: a resposta grande sem Content-Length é MEDIDA (a divisão sai certa de uma vez) e a autenticação em paralelo é UMA", async () => {
  let auths = 0;
  const corpo = (n: number) =>
    new Response(
      new ReadableStream({
        start(c) {
          for (let i = 0; i < n; i += 50_000) c.enqueue(new Uint8Array(Math.min(50_000, n - i)));
          c.close();
        },
      }),
      { status: 200 },
    );
  const fetchFalso = async (url: string) => {
    if (url.includes("auth.api.volus.com")) {
      auths++;
      await new Promise((ok) => setTimeout(ok, 20));
      return new Response(JSON.stringify({ access_token: "tok-novo", expires_in: 3600 }), { status: 200 });
    }
    return corpo(2_000_000);
  };
  const c = clienteVolus({ clientId: "par", clientSecret: "s-paralelo", fetch: fetchFalso });
  const rs = await Promise.all([1, 2, 3].map(() => c.extrato("abastecimento", C, "2026-05-01", "2026-05-31", MAX_BYTES_EXTRATO)));
  assert.equal(auths, 1, "três pedidos com o token vencido: uma autenticação só");
  for (const r of rs) {
    assert.equal(r.grande, true);
    assert.equal(r.bytes, 2_000_000, "o tamanho REAL (antes: ~200 KB, e o mês era dividido ao meio de novo e de novo)");
  }
  assert.equal(partesPara(rs[0].bytes), 13);
  assert.ok(MAX_BYTES_MEDIR >= 2_000_000);
});

test("partesPrevistas: o mês seguinte vai já em partes que cabem (e a parte prevista não é dividida de novo)", () => {
  assert.equal(partesPrevistas(undefined, 31), 1);
  assert.equal(partesPrevistas(1000, 31), 1);
  const dens = 2_000_000 / 31;
  const n = partesPrevistas(dens, 31);
  assert.ok(n > 1);
  for (const p of dividirPeriodo("2026-02-01", "2026-03-03", n)) {
    const dias = (Date.parse(p.fim) - Date.parse(p.inicio)) / 86_400_000 + 1;
    assert.equal(partesPrevistas(dens, dias), 1, "a parte prevista cabe");
    assert.ok(dens * dias <= MAX_BYTES_EXTRATO);
  }
});

/** Um "servidor" falso da Vólus: cada mês tem `porDia` bytes por dia; acima do teto, devolve dividir (medido ou não). */
function servidor(o: { porDia: number; medir: boolean; latencia: number }) {
  let pedidos = 0;
  let emCurso = 0;
  let maxEmCurso = 0;
  const lidos: string[] = [];
  const pedir = async (p: { tipo: string; inicio: string; fim: string }) => {
    pedidos++;
    emCurso++;
    maxEmCurso = Math.max(maxEmCurso, emCurso);
    await new Promise((ok) => setTimeout(ok, o.latencia));
    emCurso--;
    const dias = (Date.parse(p.fim) - Date.parse(p.inicio)) / 86_400_000 + 1;
    const bytes = dias * o.porDia;
    if (bytes > MAX_BYTES_EXTRATO) {
      // Sem medir, a resposta comprimida parecia ter só o teto (as versões anteriores).
      const visto = o.medir ? bytes : MAX_BYTES_EXTRATO + 1000;
      return { estado: "dividir", partes: partesPara(visto), bytes: visto };
    }
    for (let d = Date.parse(p.inicio); d <= Date.parse(p.fim); d += 86_400_000) lidos.push(`${p.tipo}|${new Date(d).toISOString().slice(0, 10)}`);
    return { estado: "ok", registros: dias, novos: 0, alterados: 0, bytes };
  };
  return { pedir, stats: () => ({ pedidos, maxEmCurso, lidos }) };
}

test("importarFrota em paralelo + previsão: o ano inteiro coberto sem buraco nem repetição, perto do mínimo de pedidos e no máximo 3 ao mesmo tempo", async () => {
  const s = servidor({ porDia: 65_000, medir: true, latencia: 5 });
  const { id, fim } = importarFrota({ ano: 2026, contratos: [{ codigo: C, produto: "ambos" as const }], hoje: "2026-12-31", pedir: s.pedir, esperar: async () => {} });
  const r = await fim;
  retirarImportacao(id);
  const x = s.stats();
  assert.equal(r.falhas.length, 0);
  assert.equal(x.lidos.length, 365 * 2, "cada dia uma vez por tipo — sem buraco nem sobreposição");
  assert.equal(new Set(x.lidos).size, x.lidos.length);
  assert.equal(x.maxEmCurso, 3);
  // O mínimo: cada parte cabe no teto (≤ 3 dias de 65 KB). Antes, a divisão ao meio repetida pedia ~2× isso.
  const minimo = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].reduce((t, d) => t + Math.ceil((d * 65_000) / MAX_BYTES_EXTRATO), 0) * 2;
  assert.ok(x.pedidos <= minimo * 1.35 + 2, `pedidos ${x.pedidos}, mínimo ${minimo}`);
});

test("importarFrota: o pool espera as partes de uma divisão (não sai cedo) e o inesperado vira falha do período, sem parar o resto", async () => {
  let n = 0;
  const pedir = async (p: { inicio: string; fim: string }) => {
    n++;
    await new Promise((ok) => setTimeout(ok, 2));
    if (p.inicio === "2026-01-01" && p.fim === "2026-01-31") return { estado: "dividir", partes: 4, bytes: 600_000 };
    if (p.inicio === "2026-01-01") throw Object.assign(new Error("recusado"), { status: 422 });
    return { estado: "ok", registros: 1 };
  };
  const { id, fim } = importarFrota({ ano: 2026, contratos: [{ codigo: C, produto: "combustivel" }], hoje: "2026-01-31", pedir, esperar: async () => {}, paralelo: 3 });
  const r = await fim;
  retirarImportacao(id);
  assert.equal(n, 5, "o mês + as 4 partes");
  assert.equal(r.falhas.length, 1);
  assert.equal(r.registros, 3);
});
