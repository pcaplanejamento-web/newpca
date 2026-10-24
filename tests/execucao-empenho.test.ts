import assert from "node:assert/strict";
import test from "node:test";
import { problemasDoEmpenho } from "../src/lib/empenhos-tela-core.ts";
import { conferirExecucao, type LiquidacaoDoEmpenho, liquidacaoProvavel, type PagamentoDoEmpenho, semRepetir } from "../src/lib/execucao-empenho-core.ts";

const liq = (id: number, data: string, valor: number, valorAnulado = 0): LiquidacaoDoEmpenho => ({ id, chave: `l${id}`, cardId: 1, ano: 2025, numero: String(id), data, valor, valorAnulado, valorLiquido: valor - valorAnulado, valorPago: 0 });
const pag = (id: number, data: string, valor: number, anulado = false): PagamentoDoEmpenho => ({ id, chave: `p${id}`, cardId: 2, ano: 2025, srcId: id, data, valor, valorRetencao: 0, valorLiquido: valor, anulado });

test("conferência: Σ (valor − anulado) × liquidado e Σ pagos não anulados × pago, ao centavo", () => {
  const exec = { liquidacoes: [liq(1, "2025-01-10", 100.1), liq(2, "2025-02-10", 50, 10)], pagamentos: [pag(1, "2025-01-20", 100.1), pag(2, "2025-02-20", 40, true)] };
  const c = conferirExecucao({ valorLiquidado: 140.1, valorPago: 100.1 }, exec);
  assert.equal(c.liquidado?.confere, true);
  assert.equal(c.pago?.confere, true);
  const d = conferirExecucao({ valorLiquidado: 150.1, valorPago: 90 }, exec);
  assert.deepEqual([d.liquidado?.confere, d.liquidado?.diferenca, d.pago?.diferenca], [false, -10, 10.1]);
  assert.deepEqual(conferirExecucao({ valorLiquidado: 1, valorPago: 1 }, { liquidacoes: null, pagamentos: null }), { liquidado: null, pago: null }, "sem a tela, nada a conferir");
  // 0,1 + 0,2 não gera diferença fantasma.
  assert.equal(conferirExecucao({ valorLiquidado: 0.3, valorPago: 0 }, { liquidacoes: [liq(3, "", 0.1), liq(4, "", 0.2)], pagamentos: [] }).liquidado?.confere, true);
});

test("liquidação provável: mesmo valor, na ordem das datas, cada uma uma vez, nunca depois do pagamento", () => {
  const l = [liq(1, "2025-01-10", 100), liq(2, "2025-01-15", 100), liq(3, "2025-03-01", 70)];
  const p = [pag(10, "2025-01-20", 100), pag(11, "2025-01-25", 100), pag(12, "2025-02-01", 70), pag(13, "2025-02-02", 100, true)];
  const r = liquidacaoProvavel(l, p);
  assert.equal(r.get(10)?.id, 1);
  assert.equal(r.get(11)?.id, 2);
  assert.equal(r.has(12), false, "a liquidação de 70 é posterior ao pagamento");
  assert.equal(r.has(13), false, "o anulado não aponta");
});

test("o mesmo registro em dois cards aparece uma vez (o primeiro da lista)", () => {
  assert.deepEqual(
    semRepetir([{ chave: "a", cardId: 1 }, { chave: "b", cardId: 1 }, { chave: "a", cardId: 2 }]).map((x) => `${x.chave}${x.cardId}`),
    ["a1", "b1"],
  );
});

test("conferência do empenho: liquidado ≤ empenhado − anulado, pago ≤ liquidado, a pagar = empenhado − anulado − pago", () => {
  const e = (valorEmpenhado: number, valorAnulado: number, valorLiquidado: number, valorPago: number, saldoPagar: number) => ({ valorEmpenhado, valorAnulado, valorLiquidado, valorPago, saldoPagar });
  assert.deepEqual(problemasDoEmpenho(e(100, 10, 80, 40, 50)), []);
  assert.deepEqual(problemasDoEmpenho(e(100, 10, 90.004, 40, 50.004)), [], "abaixo de 1 centavo não conta");
  assert.deepEqual(problemasDoEmpenho(e(100, 10, 95, 40, 50)), ["liquidadoAcima"]);
  assert.deepEqual(problemasDoEmpenho(e(100, 0, 50, 60, 40)), ["pagoAcima"]);
  assert.deepEqual(problemasDoEmpenho(e(100, 0, 50, 20, 30)), ["saldo"]);
});
