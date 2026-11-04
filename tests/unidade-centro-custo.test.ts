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

test("Centro de Custo: a unidade é SEMPRE o último nome; só a entidade = sem unidade; reticência = nome cortado", () => {
  assert.deepEqual(unidadeDoCentroCusto("PM RV, SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO"), { nome: "SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO", truncado: true }, "45 caracteres = o corte da Centi");
  assert.deepEqual(unidadeDoCentroCusto("PM RV, SUBPREFEITURA DE OUROANA"), { nome: "SUBPREFEITURA DE OUROANA", truncado: false });
  assert.deepEqual(unidadeDoCentroCusto("PM RV, CAMARA MUNICIPAL, GGIM"), { nome: "GGIM", truncado: false });
  assert.deepEqual(unidadeDoCentroCusto("PM RV"), { nome: "", truncado: false }, "só a entidade: sem unidade");
  assert.deepEqual(unidadeDoCentroCusto("GUARDA CIVIL MUNICIPAL"), { nome: "GUARDA CIVIL MUNICIPAL", truncado: false }, "sem vírgula, um nome longo é a unidade");
  assert.deepEqual(unidadeDoCentroCusto("PM RV, PROCURADORIA-GERAL DO MUNICÍPIO, PROCURADORIA-GE..."), { nome: "PROCURADORIA-GE", truncado: true });
  assert.deepEqual(unidadeDoCentroCusto("SÓ UM NOME"), { nome: "", truncado: false });
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
    { id: 20, numero: "2", planejamento: "22", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1, encontrado: { centroCusto: "PM RV, CAMARA MUNICIPAL, GGIM" } },
    { id: 30, numero: "3", planejamento: "33", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1, encontrado: { centroCusto: "PM RV, CAMARA MUNICIPAL, GUARDA CIVIL MUNICIPAL" } },
    { id: 40, numero: "4", planejamento: "44", reparticaoId: null, sigla: null, orgaoId: 1, encontrado: { centroCusto: "PM RV, SEC. MUNIC. DE AÇÃO URBANA E SERVICOS PÚBLICO", finalidade: "PCA - 2026 - INICIAL - SMAUSP" } },
    { id: 50, numero: "5", planejamento: "55", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1, encontrado: { centroCusto: "" } },
  ];
  const r = conferirUnidades(itens, UNIDADES);
  assert.deepEqual(r.conformes.map((x) => x.id), [10]);
  assert.deepEqual(r.divergentes.map((x) => [x.id, x.unidadeCentiId, x.unidadeCentiSigla]), [[20, 2, "GGIM"], [40, 4, "SMAUSP"]]);
  assert.equal(r.divergentes[0].mensagem, "DFD 2 (planejamento 22): no sistema SEPLAN, na Centi GGIM (GGIM)");
  assert.equal(r.divergentes[1].mensagem, "DFD 4 (planejamento 44): no sistema sem unidade, na Centi SMAUSP (SEC. MUNIC. DE AÇÃO URBANA E SERVICOS PÚBLICO)");
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
  const so = conferirUnidades([{ id: 92, numero: "7", planejamento: "77", reparticaoId: 1, orgaoId: 1, encontrado: { centroCusto: "PM RV" } }], UNIDADES);
  assert.match(String(so.desconhecidas[0]?.mensagem), /não tem unidade \(só “PM RV”\)/);
  const s = conferirUnidades([{ id: 91, numero: "8", planejamento: "88", reparticaoId: 1, orgaoId: 1, encontrado: { centroCusto: "", centi: { Id: "88", Situacao: "x" } } }], UNIDADES);
  assert.match(String(s.desconhecidas[0]?.mensagem), /campos que vieram: Id, Situacao/);
});

test("Centro de Custo REAL da CM002: a escrita da Centi (abreviada e cortada) casa com o cadastro", () => {
  const CAD = [
    { id: 1, codigo: "SMIR", nome: "Secretaria Municipal de Infraestrutura Rural", orgaoId: 1 },
    { id: 2, codigo: "SEMMA", nome: "Secretaria Municipal de Meio Ambiente", orgaoId: 1 },
    { id: 3, codigo: "SUBOU", nome: "Subprefeitura de Ouroana", orgaoId: 1 },
    { id: 4, codigo: "SMIDU", nome: "Secretaria Municipal de Infraestrutura e Desenvolvimento Urbano", orgaoId: 1 },
    { id: 5, codigo: "SMAUSP", nome: "Secretaria Municipal de Ação Urbana e Serviços Públicos", orgaoId: 1 },
    { id: 6, codigo: "SMPG", nome: "Secretaria Municipal de Planejamento e Gestão", orgaoId: 1 },
    { id: 7, codigo: "CGM", nome: "Controladoria Geral do Município", orgaoId: 1 },
    { id: 8, codigo: "SEDEST", nome: "Secretaria Municipal de Desenvolvimento Econômico Sustentável e do Trabalho", orgaoId: 1 },
    { id: 9, codigo: "CAMARA", nome: "Câmara Municipal", orgaoId: 2 },
    { id: 10, codigo: "GCM", nome: "Guarda Civil Municipal", orgaoId: 1 },
    { id: 11, codigo: "GGIM", nome: "Gabinete de Gestão Integrada Municipal", orgaoId: 1 },
    { id: 12, codigo: "SAU", nome: "Secretaria de Ação Urbana", orgaoId: 1 },
    { id: 13, codigo: "DEC", nome: "Desenvolvimento Econômico", orgaoId: 1 },
  ];
  const casos: [string, number][] = [
    ["PM RV, SEC MUNICIPAL DE INFRAESTRUTURA RURAL", 1],
    ["PM RV, SECRETARIA MUNICIPAL DE MEIO AMBIENTE", 2],
    ["PM RV, SUBPREFEITURA DE OUROANA", 3],
    ["PM RV, SEC. MUNIC. DE INFRAESTRUTURA E DESENV. URBAN", 4],
    ["PM RV, SEC. MUNIC. DE AÇÃO URBANA E SERVICOS PÚBLICO", 5],
    ["PM RV, SEC. MUNIC. DE AÇÃO URBANA E SERVICOS PÚBLICO, SECRETARIA DE ACAO URBANA", 12],
    ["PM RV, SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO", 6],
    ["PM RV, CONTROLADORIA GERAL DO MUNICIPIO", 7],
    ["PM RV, SEC MUN. DE DESENV. ECONOMICO SUST. DO TRABAL, DESENVOLVIMENTO ECONOMICO", 13],
    ["PM RV, SEC MUN. DE DESENV. ECONOMICO SUST. DO TRABAL", 8],
    ["PM RV, CAMARA MUNICIPAL, GUARDA CIVIL MUNICIPAL", 10],
    ["PM RV, CAMARA MUNICIPAL, GGIM", 11],
  ];
  for (const [centro, id] of casos) {
    const r = conferirUnidades([{ id: 1, numero: "1", planejamento: "1", reparticaoId: id, orgaoId: 1, encontrado: { centroCusto: centro } }], CAD);
    assert.equal(r.conformes.length, 1, `${centro} → ${id}: ${JSON.stringify(r.desconhecidas[0]?.mensagem ?? r.divergentes[0]?.mensagem)}`);
  }
  // Palavra que só começa igual dentro de outra palavra não casa; sem corte, palavra a mais no cadastro também não.
  assert.equal(casarUnidadePorNome("SECRETARIA AMBIENTE", false, CAD).tipo, "desconhecida");
  assert.equal(casarUnidadePorNome("SEC MUN DE INFRAESTRUTURA", false, CAD).tipo, "desconhecida");
});

test("Centro de Custo × o CADASTRO REAL de Órgãos e Unidades (PMRV): os nomes próprios da Centi casam", () => {
  const CAD = [
    ["GP", "Gabinete do Prefeito"], ["PGM", "Procuradoria Geral do Município"], ["CGM", "CONTROLADORIA GERAL DO MUNICÍPIO"], ["GCM", "Guarda Civil Municipal"],
    ["SMPG", "Secretaria Municipal de Planejamento e Gestão"], ["SEFAZ", "Secretaria da Fazenda"], ["SMAUSP", "Secretaria Municipal de Ação Urbana e Serviços Públicos"],
    ["SMIDU", "Secretaria de Infraestrutura Urbana"], ["SMIR", "Secretaria Municipal de Infraestrutura Rural"], ["SMDES", "Secretaria Municipal de Desenvolvimento Econômico Sustentável"],
    ["SMAPA", "Secretaria Municipal de Agricultura, Pecuária e Abastecimento"], ["SMEL", "Secretaria Municipal de Esportes e Lazer"], ["SMC", "Secretaria Municipal de Comunicação Social"],
    ["SMMA", "Secretaria Municipal de Meio Ambiente"], ["SMCULT", "Secretaria Municipal de Cultura"], ["SMHRF", "Secretaria Municipal de Habitação e Regularização Fundiária"],
    ["SMTUR", "Secretaria Municipal de Turismo"], ["SETIA", "Secretaria de Tecnologia, Inovação e Inteligência Artificial"], ["GGIM", "Gabinete de Gestão Integrada Municipal"],
  ].map(([codigo, nome], i) => ({ id: i + 1, codigo, nome, orgaoId: 1 }));
  const casos: [string, string | null][] = [
    ["PM RV, SEC MUNICIPAL DE INFRAESTRUTURA RURAL", "SMIR"],
    ["PM RV, SECRETARIA MUNICIPAL DE MEIO AMBIENTE", "SMMA"],
    ["PM RV, SEC. MUNIC. DE INFRAESTRUTURA E DESENV. URBAN", "SMIDU"],
    ["PM RV, SEC. MUNIC. DE AÇÃO URBANA E SERVICOS PÚBLICO, SECRETARIA DE ACAO URBANA", "SMAUSP"],
    ["PM RV, CAMARA MUNICIPAL, GUARDA CIVIL MUNICIPAL", "GCM"],
    ["PM RV, CAMARA MUNICIPAL, GGIM", "GGIM"],
    ["PM RV, SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO", "SMPG"],
    ["PM RV, CONTROLADORIA GERAL DO MUNICIPIO", "CGM"],
    ["PM RV, SEC MUN. DE DESENV. ECONOMICO SUST. DO TRABAL, DESENVOLVIMENTO ECONOMICO", "SMDES"],
    ["PM RV, SEC MUN. DE DESENV. ECONOMICO SUST. DO TRABAL", "SMDES"],
    ["PM RV, SUBPREFEITURA DE OUROANA", null],
  ];
  for (const [centro, sigla] of casos) {
    const r = conferirUnidades([{ id: 1, numero: "1", planejamento: "1", reparticaoId: 999, orgaoId: 1, encontrado: { centroCusto: centro } }], CAD);
    assert.equal(r.divergentes[0]?.unidadeCentiSigla ?? null, sigla, `${centro}: ${r.desconhecidas[0]?.mensagem ?? ""}`);
  }
  assert.equal(casarUnidadePorNome("SECRETARIA MUNICIPAL", false, CAD).tipo, "desconhecida", "só palavras genéricas não identificam");
});

test("Centro de Custo CADASTRADO na unidade: o casamento exato vem antes do nome (texto inteiro ou o último nome)", async () => {
  const { casarPorCentroCusto } = await import("../src/lib/reparticao-match.ts");
  const CAD = [
    { id: 1, codigo: "GGIM", nome: "Gabinete de Gestão Integrada Municipal", orgaoId: 1, centroCusto: "PM RV, CAMARA MUNICIPAL, GGIM" },
    { id: 2, codigo: "SUBOU", nome: "Subprefeitura do Distrito", orgaoId: 1, centroCusto: "SUBPREFEITURA DE OUROANA" },
    { id: 3, codigo: "SMS", nome: "Secretaria Municipal de Saúde", orgaoId: 1, centroCusto: null },
  ];
  assert.deepEqual(casarPorCentroCusto("pm rv, câmara municipal, ggim", CAD), { tipo: "ok", id: 1 }, "sem caixa/acento");
  assert.deepEqual(casarPorCentroCusto("PM RV, SUBPREFEITURA DE OUROANA", CAD), { tipo: "ok", id: 2 }, "o último nome");
  assert.equal(casarPorCentroCusto("PM RV, SECRETARIA MUNICIPAL DE SAÚDE", CAD), null, "sem cadastro = a comparação por nome segue");
  const r = conferirUnidades([{ id: 9, numero: "1", planejamento: "1", reparticaoId: 9, orgaoId: 1, encontrado: { centroCusto: "PM RV, SUBPREFEITURA DE OUROANA" } }], CAD);
  assert.equal(r.divergentes[0]?.unidadeCentiSigla, "SUBOU", "o nome diferente casa pelo Centro de Custo cadastrado");
});

test("Auditoria: pelo valor, a Finalidade nunca vira o centro de custo; o último nome do cadastrado vale", async () => {
  const { casarPorCentroCusto } = await import("../src/lib/reparticao-match.ts");
  const r = conferirUnidades(
    [{ id: 1, numero: "1", planejamento: "1", reparticaoId: 1, orgaoId: 1, encontrado: { centroCusto: "", centi: { Finalidade: "CONTRATO Nº 40, DE 2026", Lotacao: "PM RV, SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO" } } }],
    UNIDADES,
  );
  assert.equal(r.conformes.length, 1, JSON.stringify(r.desconhecidas[0]?.mensagem));
  const s = conferirUnidades([{ id: 2, numero: "2", planejamento: "2", reparticaoId: 1, orgaoId: 1, encontrado: { centroCusto: "", centi: { Finalidade: "CONTRATO Nº 40, DE 2026" } } }], UNIDADES);
  assert.match(String(s.desconhecidas[0]?.mensagem), /não trouxe o centro de custo/);
  const CAD = [{ id: 5, codigo: "GGIM", nome: "Outro nome", orgaoId: 1, centroCusto: "PM RV, CAMARA MUNICIPAL, GGIM" }];
  assert.deepEqual(casarPorCentroCusto("PM RV, GABINETE DO PREFEITO, GGIM", CAD), { tipo: "ok", id: 5 }, "sempre o último nome");
});
