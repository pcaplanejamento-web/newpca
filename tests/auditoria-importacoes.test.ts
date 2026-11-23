// Regressões da auditoria das importações automáticas (rodada do cron, orçamento de consultas, ritmo leve).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CUSTO_PAGINA_REAL, cabeOutroPulo, custoDoPulo, lerPaginaReal, ORCAMENTO_CONSULTAS } from "../src/lib/empenhos-core.ts";
import { CHAMADAS_EXPEDIENTE, MAX_CHAMADAS_RODADA, registraNaVez, rodadaDoCron, tetoDaRodada } from "../src/lib/rodada-cron-core.ts";

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("rodada no ritmo leve: a última chamada (vez 1 de 2) grava a situação", async () => {
  const urls: string[] = [];
  await rodadaDoCron(async (vez, depois, teto) => {
    urls.push(`https://cron.interno/x?vez=${vez}${depois ? `&depois=${depois}` : ""}&teto=${teto}`);
    return { ok: true, trabalhou: true, depois: vez + 1, limite: vez === 0 ? CHAMADAS_EXPEDIENTE : undefined };
  });
  assert.equal(urls.length, 2);
  // A 2ª chamada recebe o teto já baixado pelo ritmo leve e grava (é a última da rodada).
  assert.equal(tetoDaRodada(urls[1]), 2);
  assert.equal(registraNaVez(1, true, tetoDaRodada(urls[1])), true);
  // Sem o ritmo leve, o meio da rodada segue sem gravar.
  assert.equal(registraNaVez(1, true, MAX_CHAMADAS_RODADA), false);
});

test("tetoDaRodada: inválido ou ausente = o máximo", () => {
  assert.equal(tetoDaRodada("https://x/?vez=1"), MAX_CHAMADAS_RODADA);
  assert.equal(tetoDaRodada("https://x/?teto=0"), MAX_CHAMADAS_RODADA);
  assert.equal(tetoDaRodada("https://x/?teto=99"), MAX_CHAMADAS_RODADA);
  assert.equal(tetoDaRodada("https://x/?teto=3"), 3);
});

test("worker manda o teto da rodada e as rotas o usam", () => {
  assert.match(ler("worker.ts"), /&teto=\$\{teto\}/);
  for (const r of ["src/app/api/integracoes/empenhos/cron/route.ts", "src/app/api/integracoes/frota/cron/route.ts"]) assert.match(ler(r), /registraNaVez\(vez, trabalhou, tetoDaRodada\(req\.url\)\)/);
});

test("rota de empenhos não relê a configuração: o limite vem de atualizarEmpenhosAuto", () => {
  const rota = ler("src/app/api/integracoes/empenhos/cron/route.ts");
  assert.doesNotMatch(rota, /getConfigImportacoes/);
  assert.match(rota, /servido, limite \} = await atualizarEmpenhosAuto/);
  assert.match(ler("src/lib/empenhos-auto.ts"), /limite = chamadasDaRodada\(cfg\.expedienteLeve, agora\)/);
});

test("orçamento: a página real com outros cards antes fica para a próxima chamada; o 1º card sempre lê", () => {
  // Abertura da vez 0 (7) + um card de empenhos por órgão com lote novo (11): o 1º card lê mesmo passando do orçamento.
  assert.equal(lerPaginaReal(7 + 11 + 1, 0, false), true);
  // Dois cards "esperando" antes (7 cada) + o card que trabalha (11): não cabe — adia (a próxima chamada começa nele).
  assert.equal(lerPaginaReal(7 + 7 + 7 + 11, 0, true), false);
  assert.ok(7 + 7 + 7 + 11 + CUSTO_PAGINA_REAL > ORCAMENTO_CONSULTAS);
  // Um card "fora da hora" antes (2) e o lote aberto: cabe; um card "esperando" antes (7): adia.
  assert.equal(lerPaginaReal(7 + 2 + 9, 0, true), true);
  assert.equal(lerPaginaReal(7 + 7 + 9, 0, true), false);
  // Depois de pulos, a régua é a mesma, com ou sem cards antes.
  let n = 7 + 9;
  while (cabeOutroPulo(n, true)) n += custoDoPulo(true);
  assert.equal(lerPaginaReal(n, 3, false), false);
  // O gasto lido nunca passa das 50 com o fecho (≤ 4): a página real só entra até o orçamento de 40.
  assert.ok(ORCAMENTO_CONSULTAS + 4 <= 50);
});

test("automática conta cada consulta onde acontece e devolve o adiado à rodada", () => {
  const auto = ler("src/lib/empenhos-auto.ts");
  assert.match(auto, /lerPaginaReal\(conta\.n, pulos, conta\.antes\)/);
  assert.match(auto, /if \(u\.adiado\) \{[\s\S]*?servido = anterior;/);
  assert.doesNotMatch(auto, /conta\.n \+= 4/);
});
