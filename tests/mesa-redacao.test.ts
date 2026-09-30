import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AtividadeTupla } from "../src/lib/mesa-metricas.ts";
import { redigirDfdDetalhe, redigirDfds, redigirExecucao, redigirItens, redigirProtocoloDetalhe, redigirProtocolos } from "../src/lib/mesa-redacao.ts";
import { visaoMesa } from "../src/lib/mesa-visao-core.ts";
import { coerceDetalhes } from "../src/lib/papeis-detalhes-core.ts";

const vis = (bruto: unknown) => visaoMesa(coerceDetalhes(bruto), false);
const TUDO = vis({});
const SEM_PESSOAS = vis({ mesa: { responsavel: { ver: false }, distribuicao: false } });

/** Congela em profundidade: a redação NUNCA pode mexer no que recebe (o valor memorizado é compartilhado). */
function congelar<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o as object)) congelar(v);
    Object.freeze(o);
  }
  return o;
}

const protocolo = (id: number, extra: Record<string, unknown> = {}) =>
  ({ id, numero: `P${id}`, reparticaoId: 1, responsavelId: 5, responsavelNome: "Ana", distribuidorId: 6, distribuidorNome: "Bia", situacaoId: 2, ...extra }) as never;
const dfd = (id: number) =>
  ({ id, numero: `D${id}`, protocoloId: 10, reparticaoId: 1, protocoloResponsavelId: 5, responsavel: "Fulano", objeto: "X", setorRequisitante: "S" }) as never;

describe("redação da Mesa", () => {
  it("sem restrição: os protocolos voltam na MESMA referência (sem cópia)", () => {
    const lista = congelar([protocolo(1), protocolo(2)]);
    const r = redigirProtocolos(lista, TUDO, null);
    assert.equal(r[0], lista[0]);
    assert.equal(r.length, 2);
  });

  it("Responsável e Distribuição ocultos: as chaves NÃO vão (ausentes no JSON), sem mexer na entrada", () => {
    const lista = congelar([protocolo(1)]);
    const [p] = redigirProtocolos(lista, SEM_PESSOAS, null);
    const json = JSON.parse(JSON.stringify(p));
    for (const k of ["responsavelId", "responsavelNome", "distribuidorId", "distribuidorNome"]) assert.equal(k in json, false, k);
    assert.equal(json.situacaoId, 2);
    assert.equal((lista[0] as { responsavelId: number }).responsavelId, 5); // a entrada fica intacta
  });

  it("só os meus: filtra protocolos, DFDs e itens pelas linhas da pessoa", () => {
    const meus = { protocolos: new Set([2]), dfds: new Set([21]) };
    assert.deepEqual(
      redigirProtocolos(congelar([protocolo(1), protocolo(2)]), TUDO, meus).map((p) => p.id),
      [2],
    );
    assert.deepEqual(
      redigirDfds(congelar([dfd(20), dfd(21)]), TUDO, meus).map((d) => d.id),
      [21],
    );
    assert.deepEqual(redigirItens([{ dfdId: 20 }, { dfdId: 21 }, { dfdId: 21 }], meus).length, 2);
    assert.equal(redigirItens([{ dfdId: 20 }], null).length, 1);
  });

  it("DFDs das listas: nunca levam o que só o documento usa; o Responsável herdado some se oculto", () => {
    const [d] = redigirDfds(congelar([dfd(20)]), TUDO, null);
    const json = JSON.parse(JSON.stringify(d));
    for (const k of ["responsavel", "objeto", "setorRequisitante"]) assert.equal(k in json, false, k);
    assert.equal(json.protocoloResponsavelId, 5);
    const [d2] = redigirDfds(congelar([dfd(20)]), SEM_PESSOAS, null);
    assert.equal("protocoloResponsavelId" in d2, false);
  });

  it("banners: o DFD completo mantém o documento; o protocolo tira as pessoas (também dos DFDs dele)", () => {
    const completo = congelar(dfd(30));
    assert.equal(redigirDfdDetalhe(completo, TUDO), completo);
    const d = redigirDfdDetalhe(completo, SEM_PESSOAS) as Record<string, unknown>;
    assert.equal("protocoloResponsavelId" in d, false);
    assert.equal(d.responsavel, "Fulano"); // é o documento
    const p = congelar({ ...(protocolo(1) as object), dfds: [dfd(30)] }) as never;
    const r = redigirProtocoloDetalhe(p, SEM_PESSOAS) as unknown as Record<string, unknown> & { dfds: Record<string, unknown>[] };
    assert.equal("responsavelId" in r, false);
    assert.equal("protocoloResponsavelId" in r.dfds[0], false);
    assert.equal(redigirProtocoloDetalhe(p, TUDO), p);
  });

  it("execução: só os protocolos legíveis; sem desempenho, só as correções, sem a pessoa, somadas por dia", () => {
    const tuplas: AtividadeTupla[] = [
      [1, 5, "2026-09-01", "reenvio", 1],
      [1, 6, "2026-09-01", "reenvio", 2],
      [1, 5, "2026-09-01", "acao", 4],
      [2, 5, "2026-09-02", "reenvio", 1],
    ];
    assert.equal(redigirExecucao(tuplas, TUDO, () => true).length, 4);
    assert.deepEqual(
      redigirExecucao(tuplas, TUDO, (id) => id === 2),
      [[2, 5, "2026-09-02", "reenvio", 1]],
    );
    const anon = redigirExecucao(tuplas, vis({ mesa: { desempenho: false } }), () => true);
    assert.deepEqual(anon, [
      [1, null, "2026-09-01", "reenvio", 3],
      [2, null, "2026-09-02", "reenvio", 1],
    ]);
  });
});
