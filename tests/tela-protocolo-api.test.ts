import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

type Linha = { protocolo: string; ano: string; id: string; departamento: string; interessado: string; situacao: string };
function pecas() {
  const ctx: Record<string, unknown> = { URL };
  vm.runInNewContext(readFileSync("extensao-centi/centi-anexo.js", "utf8"), ctx);
  const p = Number(/const PROTOCOLO = (\d+)/.exec(readFileSync("extensao-centi/centi-main.js", "utf8"))?.[1]);
  return ctx[`__pcaCentiAnexo_p${p}`] as {
    protocolosTela: (j: unknown) => { situacao: boolean; linhas: Linha[] } | null;
    emAnalise: (s: string) => boolean;
  };
}

test("Tela Protocolo pela API: a lista reconhecida pela forma, todas as linhas e a situação", () => {
  const { protocolosTela, emAnalise } = pecas();
  const itens = Array.from({ length: 300 }, (_, i) => ({
    Id: 9000 + i,
    Protocolo: String(150000 + i),
    Ano: 2026,
    Interessado: { Nome: `SECRETARIA ${i % 3}` },
    Departamento: { Descricao: i % 2 ? "SMPG" : "SMDES" },
    Situacao: { Descricao: i % 5 ? "Em Análise" : "Arquivado" },
  }));
  const r = JSON.parse(JSON.stringify(protocolosTela({ Data: { Items: itens } })));
  assert.ok(r);
  assert.equal(r.linhas.length, 300);
  assert.equal(r.situacao, true);
  assert.deepEqual(
    { protocolo: r.linhas[1].protocolo, ano: r.linhas[1].ano, id: r.linhas[1].id, departamento: r.linhas[1].departamento },
    { protocolo: "150001", ano: "2026", id: "9001", departamento: "SMPG" },
  );
  assert.equal(r.linhas.filter((x: Linha) => emAnalise(x.situacao)).length, 240);
  assert.equal(protocolosTela({ Items: [{ Id: 1, Situacao: "x", Finalidade: "y" }] }), null, "a lista da CM002 não é a da Tela Protocolo");
});


test("Tela Protocolo: o motivo de uma lista não reconhecida (só os nomes das colunas)", () => {
  const { motivoNaoTela } = pecas() as unknown as { motivoNaoTela: (j: unknown) => { motivo: string; colunas: string[] } | null };
  assert.equal(motivoNaoTela({ a: 1 })?.motivo, "sem lista");
  const r = motivoNaoTela({ Data: { Items: [{ Id: 1, Protocolo: "123", Nome: "X" }] } });
  assert.equal(r?.motivo, "sem ano, interessado");
  assert.ok(r?.colunas.includes("Protocolo"));
  assert.equal(motivoNaoTela({ Data: { Items: [{ Id: 1, Protocolo: "123", Ano: 2026, Interessado: { Nome: "A" } }] } }), null);
});
