import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { lerPaginaEmpenhos } from "../src/lib/empenhos-core.ts";
import { comandoRegistrarPasso, consultaUltimoPasso, jaNoLote } from "../src/lib/empenhos-sql.ts";
import {
  ESPEC_PARTE,
  linhasDaParte,
  MAX_BYTES_PARTE,
  MAX_LINHAS_PARTE,
  partesDaPagina,
  resumoValido,
  somaDaLinha,
  tuplaDaLinha,
} from "../src/lib/importacao-partes-core.ts";
import { lerPaginaLiquidacoes } from "../src/lib/liquidacoes-core.ts";
import { lerPaginaPagamentos } from "../src/lib/pagamentos-core.ts";
import { comandosConferirPagamentos, comandosGuardarPagamentos } from "../src/lib/pagamentos-sql.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const emp = (n: number, historico = "SERVIÇO") => ({ Id: n, Numero: String(n), OrgaoGestor: "PMRV", UnidadeOrcamentaria: "SEFAZ", Acao: "2001", ValorEmpenhado: "1.021,070", Data: "05/03/2026", Historico: historico });
const liq = (n: number) => ({ Id: n, NumeroLiquidacao: "7", NumeroEmpenho: "99", Orgao: "PMRV", Valor: 10.5, DataLiquidacao: "01/03/2026" });
const pag = (n: number, anulado = false) => ({ IdOrdemPagamento: n, IdNotaEmpenho: 99, Orgao: "PMRV", ValorDocumento: 12, ValorLiquido: 10, PossuiAnulacao: anulado });

test("partes: as linhas lidas vão e voltam iguais (tupla → conferência) nos três modos", () => {
  const e = lerPaginaEmpenhos(JSON.stringify([emp(1), emp(2, 'TEXTO "LONGO" COM ÁGUA')]), 2026).linhas;
  const l = lerPaginaLiquidacoes(JSON.stringify([liq(5), liq(6)]), 2026).linhas;
  const p = lerPaginaPagamentos(JSON.stringify([pag(8), pag(9, true)]), 2026).linhas;
  for (const [modo, linhas] of [["empenhos", e], ["liquidacoes", l], ["pagamentos", p]] as const) {
    const tuplas = linhas.map((x) => tuplaDaLinha(modo, x));
    // Pela rede: o JSON das tuplas.
    const v = linhasDaParte(modo, 2026, JSON.parse(JSON.stringify(tuplas)));
    assert.ok(v.ok, modo);
    assert.deepEqual(v.linhas, linhas, modo);
    // Os campos da espec = os da linha (nada fica de fora).
    assert.deepEqual(new Set(ESPEC_PARTE[modo].map(([c]) => c)), new Set(Object.keys(linhas[0])), modo);
  }
  assert.equal(somaDaLinha("empenhos", e[0]), 1021.07);
  assert.equal(somaDaLinha("liquidacoes", l[0]), 10.5);
  assert.equal(somaDaLinha("pagamentos", p[0]), 10);
  assert.equal(somaDaLinha("pagamentos", p[1]), 0, "a ordem anulada não soma");
});

test("partes: a conferência recusa a linha forjada (campos, tipos, ano, chave, repetida, tamanho)", () => {
  const [l] = lerPaginaEmpenhos(JSON.stringify([emp(1)]), 2026).linhas;
  const t = tuplaDaLinha("empenhos", l);
  const com = (i: number, v: unknown) => t.map((x, k) => (k === i ? v : x));
  const motivo = (tuplas: unknown[], ano = 2026) => {
    const r = linhasDaParte("empenhos", ano, tuplas);
    return r.ok ? null : r.motivo;
  };
  assert.equal(motivo([t]), null);
  assert.match(motivo([t.slice(1)]) ?? "", /esperava 24 campos/);
  assert.match(motivo([com(18, "100")]) ?? "", /valorEmpenhado/);
  assert.match(motivo([com(18, Number.NaN)]) ?? "", /valorEmpenhado/);
  assert.match(motivo([com(4, "05/03/2026")]) ?? "", /data/);
  assert.match(motivo([t], 2025) ?? "", /ano/);
  assert.match(motivo([com(0, "2026|PMRV|999")]) ?? "", /chave não confere/);
  assert.match(motivo([t, t]) ?? "", /repetida/);
  assert.match(motivo([com(23, "x".repeat(20_001))]) ?? "", /historico/);
  assert.match(motivo(Array.from({ length: MAX_LINHAS_PARTE + 1 }, () => t)) ?? "", /mais de/);
  assert.match(linhasDaParte("pagamentos", 2026, [[...tuplaDaLinha("pagamentos", lerPaginaPagamentos(JSON.stringify([pag(8)]), 2026).linhas[0])].map((x, k) => (k === 0 ? "9" : x))]).ok ? "" : "chave", /chave/);
});

test("partes: a página em pedaços de tamanho FIXO (linhas e caracteres); a vazia = uma parte", () => {
  const linhas = lerPaginaEmpenhos(JSON.stringify(Array.from({ length: 5000 }, (_, i) => emp(i + 1, "H".repeat(200)))), 2026).linhas;
  const partes = partesDaPagina("empenhos", linhas);
  assert.equal(partes.flat().length, 5000);
  for (const p of partes) {
    assert.ok(p.length <= MAX_LINHAS_PARTE);
    assert.ok(JSON.stringify(p).length <= MAX_BYTES_PARTE);
  }
  assert.ok(partes.length >= 4);
  assert.deepEqual(partesDaPagina("pagamentos", []), [[]]);
  assert.equal(partesDaPagina("empenhos", linhas.slice(0, 10), { maxLinhas: 3 }).length, 4);
});

test("partes: o resumo da última parte confere com as linhas recebidas", () => {
  const r = { status: 200, bytes: 10, ms: 5, recebidos: 12, recusados: 1, repetidos: 1, total: 12, reparado: false };
  assert.equal(resumoValido(r, 10), true);
  assert.equal(resumoValido(r, 11), false, "linhas a mais/menos do que o navegador leu");
  assert.equal(resumoValido({ ...r, recusados: -1, recebidos: 9 }, 10), false);
  assert.equal(resumoValido({ ...r, total: 1.5 }, 10), false);
});

test("partes (D1 real): as partes de UMA página acumulam no MESMO passo — mesmo com outra página registrada no meio", async () => {
  const raw = bancoMigrado();
  raw.exec("INSERT INTO orgaos (id, nome, sigla, entidade_centi) VALUES (1, 'Prefeitura', 'PMRV', '2')");
  raw.exec("INSERT INTO empenho_cards (id, nome, tipo, endpoint) VALUES (4, 'Pagamentos', 'pagamentos', 'GetOrdempaPamento')");
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const lote = Number(raw.prepare("INSERT INTO centi_lotes (card_id, ano, modo, orgaos_centi) VALUES (4, 2026, 'pagamentos', '[2]') RETURNING id").get()?.id);
  const linhas = lerPaginaPagamentos(JSON.stringify(Array.from({ length: 10 }, (_, i) => pag(i + 1))), 2026).linhas;
  const base = { inicio: "2026-03-01", fim: "2026-03-31", estado: "erro" as const, fimPeriodo: false, status: null, bytes: null, ms: null, recusados: 0, repetidos: 0, total: null, corpo: "{}" };
  // A 1ª parte cria o passo da página 1 (dentro do lote atômico o "último passo" é ele).
  const [p1] = ((await db.batch([
    comandoRegistrarPasso(db, lote, { ...base, pagina: 1, recebidos: 4, novos: 4, soma: 40, mensagem: "guardando" }),
    ...comandosGuardarPagamentos(db, lote, 1, 2, linhas.slice(0, 4)),
    ...comandosConferirPagamentos(db, lote, 4, 1, linhas.slice(0, 4).map((l) => l.chave)),
    consultaUltimoPasso(db, lote),
  ] as never)) as unknown[][]).at(-1) as { id: number; resNovos: number }[];
  assert.equal(p1.resNovos, 4, "o destino pelo órgão com o ID na Centi");
  // Outra página (órgão) chega no meio — o "último passo" passa a ser ela.
  await db.batch([comandoRegistrarPasso(db, lote, { ...base, pagina: 2, recebidos: 0, novos: 0, soma: 0, mensagem: null })] as never);
  assert.equal(await jaNoLote(db, lote, linhas.map((l) => l.chave)), 4, "UMA consulta conta o que o lote já viu");
  // A 2ª parte da página 1 vai pelo id do passo: acumula nele, nunca no da página 2.
  const [p1b] = ((await db.batch([
    ...comandosGuardarPagamentos(db, lote, 1, 2, linhas.slice(4)),
    ...comandosConferirPagamentos(db, lote, 4, 1, linhas.slice(4).map((l) => l.chave), p1.id),
    consultaUltimoPasso(db, lote, p1.id),
  ] as never)) as unknown[][]).at(-1) as { id: number; resNovos: number }[];
  assert.equal(p1b.id, p1.id);
  assert.equal(p1b.resNovos, 10, "4 + 6: acumulado nas duas partes");
  const p2 = raw.prepare("SELECT res_novos AS r FROM centi_lote_passos WHERE lote_id = ? AND pagina = 2").get(lote) as { r: number | null };
  assert.equal(p2.r, null, "a página 2 não recebeu nada da página 1");
});

test("textoCenti: o caminho rápido devolve o MESMO que a expressão regular (espaços, pontas, NBSP, controles)", async () => {
  const { textoCenti } = await import("../src/lib/centi-resposta-core.ts");
  const regex = (v: unknown) => {
    if (v == null) return null;
    const s = String(v).replace(/\s+/g, " ").trim();
    return s || null;
  };
  const casos = ["ABC DEF", "  a  b ", "x\ty", "AB C", "", null, undefined, "ÁGUA É", " lead", "trail ", "a\u0001b", "a\r\nb", "a  b", "﻿X", "a b", 123, "Ação — Ñ"];
  for (const c of casos) assert.equal(textoCenti(c), regex(c), JSON.stringify(c));
  const limpo = "FORNECEDOR LTDA";
  assert.equal(textoCenti(limpo), limpo, "o limpo volta como está");
});
