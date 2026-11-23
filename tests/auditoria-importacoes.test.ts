// Regressões da auditoria das importações automáticas (rodada do cron, orçamento de consultas, ritmo leve).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cabeOutroPulo, cabePaginaReal, custoDoPulo, ORCAMENTO_CONSULTAS } from "../src/lib/empenhos-core.ts";
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

test("orçamento dos pulos conta a abertura da execução (nunca passa das 50 consultas)", () => {
  const auto = ler("src/lib/empenhos-auto.ts");
  assert.match(auto, /cabePaginaReal\(conta\.n\)/);
  assert.match(auto, /cabeOutroPulo\(conta\.n, porOrgao\)/);
  // Pior caso: abertura da vez 0 (7) + um card "esperando" antes (7) + o card que trabalha (7) + os pulos.
  for (const porOrgao of [false, true]) {
    let n = 7 + 7 + 7;
    let pulos = 0;
    while (pulos === 0 || cabeOutroPulo(n, porOrgao)) {
      n += custoDoPulo(porOrgao);
      pulos++;
      if (pulos > 20) break;
    }
    assert.ok(n <= ORCAMENTO_CONSULTAS + custoDoPulo(porOrgao));
    // O fim (soltar já contado + registrarCron ≈ 4) fica abaixo das 50.
    assert.ok(n + 4 <= 50, `${n}`);
  }
  assert.equal(cabePaginaReal(7 + 7), true);
});
