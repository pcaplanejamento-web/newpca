import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { comandoRealinharContrato, comandoRealinharUnidade, comandosGravarExtrato, consultaAnosFrota, consultaPacoteFrota, consultaVersaoFrota, type Gravacao, pedacosDeLinhas, linhaParaGravar } from "../src/lib/frota-sql.ts";
import {
  dataHoraBrasilia,
  dividirPeriodo,
  linhaDaTransacao,
  linhasDoExtrato,
  mesesDoAno,
  normalizarPlaca,
  numero,
  partesPara,
  placaLegivel,
  placaValida,
  siglaDaUnidade,
  transacoesDaResposta,
} from "../src/lib/volus-core.ts";
import { clienteVolus, ErroVolus } from "../src/lib/volus-api.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const abastecimento = (id: string, dia: string, placa: string, total: number, extra: Record<string, unknown> = {}) => ({
  id,
  refuel_datetime: `${dia}T10:15:00`,
  card: { plate: placa, brand_name: "FIAT", model_name: "STRADA", manufacture_year: 2022, card_masked: "****1234" },
  operator: { name: "JOSÉ SILVA", license: "123", id_number: "111.222.333-44" },
  merchant: { name: "POSTO CENTRAL", cnpj: "12.345.678/0001-90", address: { city: "RIO VERDE", state: "GO", street: "AV A", district: "CENTRO", zip_code: "75900000" } },
  product: [{ name: "DIESEL S10", quantity: 50, unit_price: 6, total_value: total }],
  accumulated_distance: 15000,
  distance_traveled: 400,
  average_consumption: 8,
  purchase_order: { commitment_number: "306914/322687", process_number: "431/2023 2adt" },
  unit: { name: "AMT - FISCALIZACAO", code: "12" },
  ...extra,
});

test("volus: placa, números, datas em Brasília e períodos", () => {
  assert.equal(normalizarPlaca("abc-1d23"), "ABC1D23");
  assert.equal(normalizarPlaca(" "), null);
  assert.ok(placaValida("ABC1234") && placaValida("ABC1D23") && !placaValida("ZZZ0049X"));
  assert.equal(placaLegivel("ABC1234"), "ABC-1234");
  assert.equal(numero("1.234,56"), 1234.56);
  assert.equal(numero("1,234.56"), 1234.56);
  assert.equal(numero("abc"), null);
  // sem fuso = a hora local; com fuso = convertida (22h de 31/12 em Brasília não vira o ano seguinte)
  assert.equal(dataHoraBrasilia("2026-12-31T22:30:00"), "2026-12-31T22:30:00");
  assert.equal(dataHoraBrasilia("2027-01-01T01:30:00Z"), "2026-12-31T22:30:00");
  assert.equal(dataHoraBrasilia("2026-05-02T10:00:00-03:00"), "2026-05-02T10:00:00");
  assert.equal(dataHoraBrasilia("lixo"), null);
  const p = dividirPeriodo("2026-01-01", "2026-01-31", 4);
  assert.equal(p.length, 4);
  assert.equal(p[0].inicio, "2026-01-01");
  assert.equal(p.at(-1)?.fim, "2026-01-31");
  for (let i = 1; i < p.length; i++) assert.ok(p[i].inicio > p[i - 1].fim);
  assert.equal(dividirPeriodo("2026-01-01", "2026-01-01", 5).length, 1);
  assert.ok(partesPara(1_000_000) >= 4);
  assert.deepEqual(
    mesesDoAno(2026, "2026-03-10").map((m) => [m.inicio, m.fim]),
    [
      ["2026-01-01", "2026-01-31"],
      ["2026-02-01", "2026-02-28"],
      ["2026-03-01", "2026-03-10"],
    ],
  );
  assert.equal(siglaDaUnidade("AMT - FISCALIZACAO"), "AMT");
  assert.equal(siglaDaUnidade("SECRETARIA DE ACAO URBANA"), "SAU");
});

test("volus: mapeamento do abastecimento e da manutenção (reais, itens, pedidos)", () => {
  const a = linhaDaTransacao("abastecimento", "000617000002", abastecimento("t1", "2026-05-02", "abc-1d23", 300));
  assert.ok(a);
  assert.equal(a.placa, "ABC1D23");
  assert.equal(a.litros, 50);
  assert.equal(a.preco_litro, 6);
  assert.equal(a.valor, 300);
  assert.equal(a.chave, "000617000002|t1");
  assert.equal(a.dia, "2026-05-02");
  assert.equal(a.empenho, "306914/322687");
  const m = linhaDaTransacao("manutencao", "000600000138", {
    order_id: 99,
    transaction_datetime: "2026-05-03T08:00:00",
    card: { plate: "PRH3297" },
    maintenance_context: { maintenance_type: "CORRETIVA", usage_metric: "124002" },
    products: [
      { description: "REDUTORA", quantity: 1, unit_price: 300, total_price: 300 },
      { description: "VALVULA", quantity: 1, total_value: 9926 },
    ],
    purchase_orders: [
      { commitment_number: "1/2026", process_number: "10/2026" },
      { commitment_number: "2/2026", process_number: "10/2026" },
    ],
    invoice: { service_invoice_number: "55" },
    unit: { description: "SEC SAUDE" },
  });
  assert.ok(m);
  assert.equal(m.valor, 399.26);
  assert.equal(m.hodometro, 124002);
  assert.equal(m.empenho, "1/2026 | 2/2026");
  assert.equal(m.processo, "10/2026");
  assert.equal(m.qtd_itens, 2);
  assert.equal(m.unidade_nome, "SEC SAUDE");
  // sem id: chave sintética estável
  const s1 = linhaDaTransacao("abastecimento", "x", { ...abastecimento("", "2026-05-02", "AAA1111", 10), id: undefined });
  const s2 = linhaDaTransacao("abastecimento", "x", { ...abastecimento("", "2026-05-02", "AAA1111", 10), id: undefined });
  assert.equal(s1?.chave, s2?.chave);
  // o extrato: repetida fica uma, fora do período sai
  const ex = linhasDoExtrato("abastecimento", "c", [abastecimento("1", "2026-05-02", "A", 1), abastecimento("1", "2026-05-02", "A", 2), abastecimento("2", "2026-06-01", "A", 1)], "2026-05-01", "2026-05-31");
  assert.equal(ex.linhas.length, 1);
  assert.equal(ex.linhas[0].valor, 2);
  assert.equal(ex.fora, 1);
  assert.equal(ex.repetidas, 1);
  assert.deepEqual(transacoesDaResposta({ data: { transactions: [{ id: 1 }] } }), { transacoes: [{ id: 1 }] });
  assert.ok("erro" in transacoesDaResposta({ response_code: 500, message: "Erro", data: null }));
});

function banco() {
  const raw = bancoMigrado();
  raw.exec(
    "INSERT INTO orgaos (id, nome, sigla) VALUES (1, 'Prefeitura', 'PMRV'), (2, 'AMT', 'AMT'); INSERT INTO reparticoes (id, orgao_id, codigo, nome) VALUES (10, 2, 'AMT', 'Fiscalização'); INSERT INTO frota_estado (id, versao) VALUES (1, 0); INSERT INTO frota_contratos (codigo, nome, sigla, produto, orgao_id) VALUES ('000617000002', 'PMRV', 'PMRV', 'combustivel', 1)",
  );
  return { raw, db: drizzle(d1Sobre(raw) as never, { schema }) };
}

let n = 0;
const grav = (extra: Partial<Gravacao> = {}): Gravacao => ({
  tipo: "abastecimento",
  contrato: "000617000002",
  inicio: "2026-05-01",
  fim: "2026-05-31",
  carimbo: `2026-05-31T12:00:00.${String(++n).padStart(3, "0")}Z`,
  origem: "manual",
  por: "Teste",
  bytes: 100,
  ms: 10,
  fora: 0,
  ...extra,
});
const linhas = (txs: Record<string, unknown>[]) => linhasDoExtrato("abastecimento", "000617000002", txs, "2026-05-01", "2026-05-31").linhas;

async function gravar(b: ReturnType<typeof banco>, g: Gravacao, txs: Record<string, unknown>[]) {
  await b.db.batch(comandosGravarExtrato(b.db, g, linhas(txs)) as never);
  return b.raw.prepare("SELECT * FROM frota_leituras ORDER BY id DESC LIMIT 1").get() as Record<string, number>;
}

test("frota: grava só o que mudou, marca a ausência e restaura; veículos e unidades sozinhos", async () => {
  const b = banco();
  const t1 = abastecimento("1", "2026-05-02", "ABC1D23", 300);
  const t2 = abastecimento("2", "2026-05-03", "XYZ9999", 100, { card: { plate: "XYZ9999" } });
  let r = await gravar(b, grav(), [t1, t2]);
  assert.equal(r.novos, 2);
  assert.equal(r.alterados, 0);
  assert.equal(r.iguais, 0);
  assert.equal(await consultaVersaoFrota(b.db), "1");
  // a mesma resposta de novo: nada escrito, versão igual
  r = await gravar(b, grav(), [t1, t2]);
  assert.equal(r.novos, 0);
  assert.equal(r.alterados, 0);
  assert.equal(r.iguais, 2);
  assert.equal(await consultaVersaoFrota(b.db), "1");
  // um valor muda
  r = await gravar(b, grav(), [{ ...t1, product: [{ name: "DIESEL S10", quantity: 50, total_value: 310 }] }, t2]);
  assert.equal(r.alterados, 1);
  assert.equal((b.raw.prepare("SELECT valor FROM frota_transacoes WHERE ref_id = '1'").get() as { valor: number }).valor, 310);
  // t2 some: 1ª vez só marca; 2ª = removida; volta = restaurada
  r = await gravar(b, grav(), [{ ...t1, product: [{ name: "DIESEL S10", quantity: 50, total_value: 310 }] }]);
  assert.equal(r.ausentes, 1);
  assert.equal(r.removidos, 0);
  r = await gravar(b, grav(), [{ ...t1, product: [{ name: "DIESEL S10", quantity: 50, total_value: 310 }] }]);
  assert.equal(r.removidos, 1);
  assert.ok((b.raw.prepare("SELECT removido_em FROM frota_transacoes WHERE ref_id = '2'").get() as { removido_em: string | null }).removido_em);
  r = await gravar(b, grav(), [{ ...t1, product: [{ name: "DIESEL S10", quantity: 50, total_value: 310 }] }, t2]);
  assert.equal(r.alterados, 1);
  assert.equal((b.raw.prepare("SELECT removido_em, ausente FROM frota_transacoes WHERE ref_id = '2'").get() as { removido_em: string | null }).removido_em, null);
  // fora do período não é tocada
  await gravar(b, grav({ inicio: "2026-06-01", fim: "2026-06-30" }), []);
  assert.equal((b.raw.prepare("SELECT COUNT(*) AS n FROM frota_transacoes WHERE removido_em IS NULL AND ausente = 0").get() as { n: number }).n, 2);
  // veículos: ABC1D23 com marca/modelo/ano, tipo pela placa
  const v = b.raw.prepare("SELECT * FROM frota_veiculos ORDER BY placa").all() as Record<string, unknown>[];
  assert.equal(v.length, 2);
  assert.equal(v[0].marca, "FIAT");
  assert.equal(v[0].tipo, "veiculo");
  // o ADM editou a marca: a leitura nunca sobrescreve
  b.raw.exec("UPDATE frota_veiculos SET marca = 'OUTRA' WHERE placa = 'ABC1D23'");
  await gravar(b, grav(), [t1, t2]);
  assert.equal((b.raw.prepare("SELECT marca FROM frota_veiculos WHERE placa = 'ABC1D23'").get() as { marca: string }).marca, "OUTRA");
  // órgão do contrato e unidade da Vólus → escopo; realinhar
  const tx = b.raw.prepare("SELECT orgao_id, reparticao_id, unidade_chave FROM frota_transacoes WHERE ref_id = '1'").get() as Record<string, unknown>;
  assert.equal(tx.orgao_id, 1);
  assert.equal(tx.reparticao_id, null);
  assert.equal(tx.unidade_chave, "AMTFISCALIZACAO");
  b.raw.exec("UPDATE frota_unidades SET reparticao_id = 10 WHERE chave = 'AMTFISCALIZACAO'; UPDATE frota_contratos SET orgao_id = 2");
  await b.db.batch([comandoRealinharUnidade(b.db, "AMTFISCALIZACAO"), comandoRealinharContrato(b.db, "000617000002")] as never);
  const tx2 = b.raw.prepare("SELECT orgao_id, reparticao_id FROM frota_transacoes WHERE ref_id = '1'").get() as Record<string, unknown>;
  assert.equal(tx2.orgao_id, 2);
  assert.equal(tx2.reparticao_id, 10);
  // pacote no escopo
  const todos = JSON.parse((await consultaPacoteFrota(b.db, 2026, null)).texto) as unknown[][];
  assert.equal(todos.length, 2);
  const so10 = JSON.parse((await consultaPacoteFrota(b.db, 2026, { unidades: [10], orgaos: [] })).texto) as unknown[][];
  assert.equal(so10.length, 2);
  assert.deepEqual((await consultaAnosFrota(b.db, null)).map((x) => ({ ...x })), [{ ano: 2026, n: 2 }]);
});

test("frota: muitas linhas em vários pedaços de JSON", async () => {
  const b = banco();
  const txs = Array.from({ length: 600 }, (_, i) => abastecimento(String(i), "2026-05-02", `AAA${String(1000 + (i % 50))}`, i + 1, { product: [{ name: "GASOLINA ".repeat(30), quantity: 1, total_value: i + 1 }] }));
  const ls = linhas(txs);
  assert.ok(pedacosDeLinhas(ls.map(linhaParaGravar)).length > 1);
  const r = await gravar(b, grav(), txs);
  assert.equal(r.novos, 600);
  assert.equal((b.raw.prepare("SELECT COUNT(*) AS n FROM frota_veiculos").get() as { n: number }).n, 50);
});

test("volus api: token em cache, divide pelo tamanho e erros legíveis", async () => {
  let auths = 0;
  const fetchFalso = async (url: string, init?: RequestInit) => {
    if (url.includes("auth.api.volus.com")) {
      auths++;
      assert.match(String(init?.body), /client_secret=s/);
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600, companies: [{ id: "000617000002", name: "PMRV" }] }), { status: 200 });
    }
    assert.equal((init?.headers as Record<string, string> | undefined)?.Authorization, "Bearer tok");
    if (url.includes("end_date=2026-05-31")) return new Response("x".repeat(5000), { status: 200 });
    if (url.includes("company_id=500")) return new Response(JSON.stringify({ response_code: 500, message: "Erro inesperado! abc" }), { status: 500 });
    return new Response(JSON.stringify({ data: { transactions: [] } }), { status: 200 });
  };
  const c = clienteVolus({ clientId: "i", clientSecret: "s", fetch: fetchFalso });
  const t = await c.autenticar();
  assert.deepEqual(t.empresas, [{ id: "000617000002", nome: "PMRV" }]);
  const g = await c.extrato("abastecimento", "000617000002", "2026-05-01", "2026-05-31", 1000);
  assert.equal(g.grande, true);
  const ok = await c.extrato("abastecimento", "000617000002", "2026-05-01", "2026-05-10", 1000);
  assert.equal(ok.grande, false);
  assert.equal(auths, 1);
  await assert.rejects(
    () => c.extrato("manutencao", "500", "2026-05-01", "2026-05-10", 1000),
    (e: unknown) => e instanceof ErroVolus && e.transitorio && /erro interno/.test(e.message),
  );
});
