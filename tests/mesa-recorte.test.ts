import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recorteMesa, rotuloChipRecorte, SEM_RECORTE } from "../src/lib/mesa-recorte.ts";

// P1 tem os DFDs 10 e 11; P2 tem o 20; o 30 é avulso (sem protocolo).
const dfds = [
  { id: 10, protocoloId: 1 },
  { id: 11, protocoloId: 1 },
  { id: 20, protocoloId: 2 },
  { id: 30, protocoloId: null },
];
const ids = (s: number[]) => new Set(s);

describe("recorteMesa", () => {
  it("sem filtro: tudo passa", () => {
    const r = recorteMesa(SEM_RECORTE, dfds);
    assert.equal(r.ativo, false);
    assert.ok(r.protocolo(1) && r.dfd(dfds[3]) && r.item(30));
  });
  it("para baixo: Protocolos filtrados recortam DFDs e itens (o avulso sai)", () => {
    const r = recorteMesa({ ...SEM_RECORTE, protocolos: ids([2]) }, dfds);
    assert.deepEqual(dfds.filter(r.dfd).map((d) => d.id), [20]);
    assert.ok(r.item(20) && !r.item(10) && !r.item(30));
    assert.ok(r.protocolo(1), "a própria visão não se restringe");
  });
  it("DFDs filtrados: protocolos que os contêm (para cima) e itens deles (para baixo)", () => {
    const r = recorteMesa({ ...SEM_RECORTE, dfds: ids([11]) }, dfds);
    assert.ok(r.protocolo(1) && !r.protocolo(2));
    assert.ok(r.item(11) && !r.item(10));
    assert.ok(r.dfd(dfds[0]), "a própria visão não se restringe");
  });
  it("para cima: Itens filtrados levam aos DFDs e protocolos deles", () => {
    const r = recorteMesa({ ...SEM_RECORTE, itens: ids([20]) }, dfds);
    assert.deepEqual(dfds.filter(r.dfd).map((d) => d.id), [20]);
    assert.ok(r.protocolo(2) && !r.protocolo(1));
  });
  it("as restrições se somam (E) entre as visões", () => {
    const r = recorteMesa({ protocolos: ids([1]), dfds: null, itens: ids([10, 20]) }, dfds);
    assert.deepEqual(dfds.filter(r.dfd).map((d) => d.id), [10]);
    assert.ok(r.protocolo(1) && r.protocolo(2), "Protocolos só seguem os Itens: P1 e P2 têm itens");
  });
  it("chip", () => {
    assert.equal(rotuloChipRecorte("itens", 1), "Itens: 1 filtro");
    assert.equal(rotuloChipRecorte("protocolos", 3), "Protocolos: 3 filtros");
  });
});
