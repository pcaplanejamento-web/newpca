import assert from "node:assert/strict";
import test from "node:test";
import { abrirDivididos, cabeOutroPulo, cabePaginaReal, custoDoPulo, lotePorMesAuto, proximoPedido } from "../src/lib/empenhos-core.ts";
import { CONFIG_FROTA_PADRAO, type ConfigFrota, type CursorFrota, proximoTrabalho } from "../src/lib/frota-config-core.ts";
import { fracaoDaLeitura, type PedidoAndamento } from "../src/lib/importacao-progresso.ts";

/** A AUDITORIA das importações (v1.264.0): as regras puras corrigidas. */

type P = { inicio: string; fim: string; pagina: number; estado: "ok" | "erro" | "dividido"; fimPeriodo: boolean };

test("tela: o período já DIVIDIDO vai pelas metades (nunca o período inteiro de novo — o servidor recusaria)", () => {
  const sem: P = { inicio: "2026-03-01", fim: "2026-03-31", pagina: 1, estado: "dividido", fimPeriodo: false };
  const metadeLida: P = { inicio: "2026-03-01", fim: "2026-03-16", pagina: 1, estado: "dividido", fimPeriodo: false };
  const r = abrirDivididos([{ inicio: "2026-03-01", fim: "2026-03-31" }], [sem, metadeLida]);
  assert.deepEqual(r, [
    { inicio: "2026-03-01", fim: "2026-03-08" },
    { inicio: "2026-03-09", fim: "2026-03-16" },
    { inicio: "2026-03-17", fim: "2026-03-31" },
  ]);
  // Não dividido: como veio. Pagamentos (por mês): o ano dividido vira os meses; o mês não se divide.
  assert.deepEqual(abrirDivididos([{ inicio: "2026-04-01", fim: "2026-04-30" }], [sem]), [{ inicio: "2026-04-01", fim: "2026-04-30" }]);
  const ano: P = { inicio: "2026-01-01", fim: "2026-12-31", pagina: 1, estado: "dividido", fimPeriodo: false };
  assert.equal(abrirDivididos([{ inicio: "2026-01-01", fim: "2026-12-31" }], [ano], true).length, 12);
  const mes: P = { inicio: "2026-02-01", fim: "2026-02-28", pagina: 1, estado: "dividido", fimPeriodo: false };
  assert.deepEqual(abrirDivididos([{ inicio: "2026-02-01", fim: "2026-02-28" }], [mes], true), [{ inicio: "2026-02-01", fim: "2026-02-28" }]);
});

test("automática: as liquidações vão MÊS A MÊS (por órgão), com a divisão do mês grande demais", () => {
  assert.equal(lotePorMesAuto({ modo: "liquidacoes" }), true);
  assert.equal(lotePorMesAuto({ modo: "pagamentos" }), true);
  assert.equal(lotePorMesAuto({ modo: "dados" }), false);
  assert.deepEqual(proximoPedido(2026, [], true, 3, true), { periodo: { inicio: "2026-01-01", fim: "2026-01-31" }, pagina: 1 });
  // Janeiro dividido: as metades (todos os órgãos de cada uma).
  const passos: P[] = [{ inicio: "2026-01-01", fim: "2026-01-31", pagina: 1, estado: "dividido", fimPeriodo: false }];
  assert.deepEqual(proximoPedido(2026, passos, true, 3, true), { periodo: { inicio: "2026-01-01", fim: "2026-01-16" }, pagina: 1 });
});

test("automática: depois de pulos, a página que MUDOU só é lida se couber uma página real no orçamento de consultas", () => {
  assert.equal(cabePaginaReal(0), true);
  assert.equal(cabePaginaReal(3 * custoDoPulo(false)), true);
  // Pulos até onde ainda cabe um pulo, mas não uma página real: a página que mudou fica para a próxima execução.
  let gasto = 0;
  while (cabeOutroPulo(gasto + custoDoPulo(true), true)) gasto += custoDoPulo(true);
  assert.equal(cabePaginaReal(gasto), false);
});

test("andamento: a barra NUNCA volta para trás ao começar a 2ª página de um período (empenhos sem órgão)", () => {
  const periodo = { inicio: "2026-01-01", fim: "2026-01-07" };
  const base = { chave: "", periodo, rotuloPagina: "", tentativa: 1, inicioMs: 0, faseMs: 0, bytes: 0, bytesEsperados: null, registros: null, iguais: null, mudaram: null, partes: 1, partesFeitas: 0 };
  const pag = (pagina: number, fase: PedidoAndamento["fase"], partesFeitas = 0): PedidoAndamento => ({ ...base, pagina, fase, partesFeitas }) as PedidoAndamento;
  const valores = [
    fracaoDaLeitura(2026, [], [pag(1, "gravando", 0)], null),
    fracaoDaLeitura(2026, [], [pag(1, "gravando", 1)], null),
    fracaoDaLeitura(2026, [], [pag(1, "concluido")], null),
    fracaoDaLeitura(2026, [], [pag(1, "concluido"), pag(2, "pedindo")], null),
    fracaoDaLeitura(2026, [], [pag(1, "concluido"), pag(2, "gravando", 1)], null),
    fracaoDaLeitura(2026, [], [pag(1, "concluido"), pag(2, "concluido")], null),
  ];
  for (let i = 1; i < valores.length; i++) assert.ok(valores[i] >= valores[i - 1] - 1e-12, `passo ${i}: ${valores[i - 1]} → ${valores[i]}`);
});

test("frota: o ciclo novo começa onde o anterior terminou quando a automática ficou parada (nenhum dia sem leitura)", () => {
  const cfg: ConfigFrota = { ...CONFIG_FROTA_PADRAO, clientId: "id", clientSecret: "x", ativa: true, frequenciaMin: 60, diasRecentes: 3 };
  const agora = new Date("2026-10-29T15:00:00Z");
  const cursor: CursorFrota = { contrato: "000617000001", tipo: "abastecimento", cicloInicio: null, proximo: null, passoDias: 31, falhas: 0, esperaAte: null, travaAte: null, cicloConcluidoEm: "2026-10-20T15:00:00.000Z", ultimoErro: null };
  // Parada 9 dias com `diasRecentes` 3: começa em 20/10 (o dia em que o anterior terminou), não em 27/10.
  assert.equal(proximoTrabalho([cursor], cfg, agora)?.inicio, "2026-10-20");
  // Parada recente: os dias recentes de sempre.
  assert.equal(proximoTrabalho([{ ...cursor, cicloConcluidoEm: "2026-10-29T12:00:00.000Z" }], { ...cfg, frequenciaMin: 30 }, agora)?.inicio, "2026-10-27");
  // Parada longuíssima: no máximo 92 dias para trás.
  assert.equal(proximoTrabalho([{ ...cursor, cicloConcluidoEm: "2025-01-01T12:00:00.000Z" }], cfg, agora)?.inicio, "2026-07-30");
});
