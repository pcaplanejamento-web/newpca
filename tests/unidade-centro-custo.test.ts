import assert from "node:assert/strict";
import { test } from "node:test";
import { conferirUnidades } from "../src/lib/fluxo-dados.ts";
import { casarUnidadePorNome, siglaDaFinalidade, unidadeDoCentroCusto } from "../src/lib/reparticao-match.ts";

const UNIDADES = [
  { id: 1, codigo: "SEPLAN", nome: "Secretaria Municipal de Planejamento e Gestão", orgaoId: 1 },
  { id: 2, codigo: "GGIM", nome: "Gabinete de Gestão Integrada Municipal", orgaoId: 1 },
  { id: 3, codigo: "PGM", nome: "Procuradoria-Geral do Município", orgaoId: 1 },
  { id: 4, codigo: "SMAUSP", nome: "Secretaria Municipal de Ação Urbana e Serviços Públicos", orgaoId: 1 },
  { id: 5, codigo: "OCULTA", nome: "Guarda Civil Municipal", orgaoId: 1, oculto: true },
  { id: 6, codigo: "GERAL", nome: "Geral", orgaoId: null },
  { id: 7, codigo: "SMS", nome: "Secretaria Municipal de Saúde", orgaoId: 1 },
  { id: 8, codigo: "FMS", nome: "Secretaria Municipal de Saúde", orgaoId: 2 },
];

test("Centro de Custo: a unidade é o trecho depois da ÚLTIMA vírgula; reticência = nome cortado", () => {
  assert.deepEqual(unidadeDoCentroCusto("PM RV, SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO"), { nome: "SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO", truncado: false });
  assert.deepEqual(unidadeDoCentroCusto("PM RV, GABINETE DO PREFEITO, GGIM"), { nome: "GGIM", truncado: false });
  assert.deepEqual(unidadeDoCentroCusto("PM RV, PROCURADORIA-GERAL DO MUNICÍPIO, PROCURADORIA-GE..."), { nome: "PROCURADORIA-GE", truncado: true });
  assert.deepEqual(unidadeDoCentroCusto("SÓ UM NOME"), { nome: "SÓ UM NOME", truncado: false });
  assert.deepEqual(unidadeDoCentroCusto(""), { nome: "", truncado: false });
  assert.equal(siglaDaFinalidade("PCA - 2026 - INICIAL - SMAUSP"), "SMAUSP");
  assert.equal(siglaDaFinalidade("PCA - 2026"), null);
  assert.equal(siglaDaFinalidade(""), null);
});

test("Casar a unidade da Centi: nome, sigla, começo do nome cortado, órgão no empate; oculta/Geral nunca", () => {
  assert.deepEqual(casarUnidadePorNome("SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO", false, UNIDADES), { tipo: "ok", id: 1 });
  assert.deepEqual(casarUnidadePorNome("GGIM", false, UNIDADES), { tipo: "ok", id: 2 });
  assert.deepEqual(casarUnidadePorNome("PROCURADORIA-GE", true, UNIDADES), { tipo: "ok", id: 3 });
  assert.deepEqual(casarUnidadePorNome("PROCURADORIA-GE", false, UNIDADES), { tipo: "desconhecida" }, "sem reticência, o nome inteiro tem de casar");
  assert.deepEqual(casarUnidadePorNome("GUARDA CIVIL MUNICIPAL", false, UNIDADES), { tipo: "desconhecida" });
  assert.deepEqual(casarUnidadePorNome("GERAL", false, UNIDADES), { tipo: "desconhecida" });
  assert.deepEqual(casarUnidadePorNome("SECRETARIA MUNICIPAL DE SAÚDE", false, UNIDADES), { tipo: "ambigua", ids: [7, 8] });
  assert.deepEqual(casarUnidadePorNome("SECRETARIA MUNICIPAL DE SAÚDE", false, UNIDADES, 2), { tipo: "ok", id: 8 });
  assert.deepEqual(casarUnidadePorNome("SECRETARIA", true, UNIDADES).tipo, "ambigua", "começo que casa várias nunca chuta");
});

test("Conferir unidades: iguais, divergentes (com a da Centi) e desconhecidas (com a sigla da Finalidade como reserva)", () => {
  const itens = [
    { id: 10, numero: "1", planejamento: "11", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1, encontrado: { centroCusto: "PM RV, SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO" } },
    { id: 20, numero: "2", planejamento: "22", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1, encontrado: { centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" } },
    { id: 30, numero: "3", planejamento: "33", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1, encontrado: { centroCusto: "PM RV, CAMARA MUNICIPAL, GUARDA CIVIL MUNICIPAL" } },
    { id: 40, numero: "4", planejamento: "44", reparticaoId: null, sigla: null, orgaoId: 1, encontrado: { centroCusto: "PM RV, SEC. MUNIC. DE AÇÃO URBANA E SERVICOS PÚBLICO, SECR...", finalidade: "PCA - 2026 - INICIAL - SMAUSP" } },
    { id: 50, numero: "5", planejamento: "55", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1, encontrado: { centroCusto: "" } },
  ];
  const r = conferirUnidades(itens, UNIDADES);
  assert.deepEqual(r.conformes.map((x) => x.id), [10]);
  assert.deepEqual(r.divergentes.map((x) => [x.id, x.unidadeCentiId, x.unidadeCentiSigla]), [[20, 2, "GGIM"], [40, 4, "SMAUSP"]]);
  assert.equal(r.divergentes[0].mensagem, "DFD 2 (planejamento 22): no sistema SEPLAN, na Centi GGIM (GGIM)");
  assert.equal(r.divergentes[1].mensagem, "DFD 4 (planejamento 44): no sistema sem unidade, na Centi SMAUSP (SECR)");
  assert.deepEqual(r.desconhecidas.map((x) => x.id), [30, 50]);
  assert.match(String(r.desconhecidas[0].mensagem), /unidade desconhecida no centro de custo — “GUARDA CIVIL MUNICIPAL” não existe no sistema/);
  assert.equal(r.desconhecidas[0].unidadeCentroCusto, "GUARDA CIVIL MUNICIPAL");
});

test("Auditoria: o desconhecido nunca vira outra unidade; vírgula no fim, corte de 200 e ' - SIGLA'", () => {
  const r = conferirUnidades(
    [{ id: 60, numero: "6", planejamento: "66", reparticaoId: 2, sigla: "GGIM", orgaoId: 1, encontrado: { centroCusto: "PM RV, DEPARTAMENTO NOVO", finalidade: "PCA - 2026 - INICIAL - SEPLAN" } }],
    UNIDADES,
  );
  assert.deepEqual(r.divergentes, [], "a sigla da Finalidade só desempata, nunca troca um desconhecido");
  assert.match(String(r.desconhecidas[0].mensagem), /“DEPARTAMENTO NOVO” não existe no sistema/);
  assert.deepEqual(unidadeDoCentroCusto("PM RV, SECRETARIA MUNICIPAL DE SAÚDE,"), { nome: "SECRETARIA MUNICIPAL DE SAÚDE", truncado: false });
  const longo = `PM RV, ${"X".repeat(150)}, SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO`.slice(0, 200);
  const u = unidadeDoCentroCusto(longo);
  assert.equal(u.truncado, true, "a extensão corta em 200 sem reticência");
  assert.deepEqual(casarUnidadePorNome(u.nome, u.truncado, UNIDADES), { tipo: "ok", id: 1 });
  assert.deepEqual(casarUnidadePorNome("SECRETARIA DE PLANEJAMENTO - SEPLAN", false, UNIDADES), { tipo: "ok", id: 1 });
});

test("Conferir unidades: reserva pelas colunas cruas da Centi e as colunas na mensagem", () => {
  const r = conferirUnidades(
    [{ id: 90, numero: "9", planejamento: "99", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1, encontrado: { centroCusto: "", centi: { Id: "99", CentroDeCusto: "PM RV, SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO" } } }],
    UNIDADES,
  );
  assert.equal(r.conformes.length, 1);
  const s = conferirUnidades([{ id: 91, numero: "8", planejamento: "88", reparticaoId: 1, orgaoId: 1, encontrado: { centroCusto: "", centi: { Id: "88", Situacao: "x" } } }], UNIDADES);
  assert.match(String(s.desconhecidas[0]?.mensagem), /campos que vieram: Id, Situacao/);
});
