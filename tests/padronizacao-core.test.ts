import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ClassificacaoItem,
  chavePalavra,
  chaveUnidade,
  classificarDescricoes,
  comparadorUnidades,
  compararUnidades,
  conflitoPalavra,
  conflitoUnidade,
  criarClassificador,
  itensPorUnidade,
  limparPalavras,
  limparSinonimos,
  motivoClassificacao,
  nomeEmUso,
  palavrasDe,
  propostaUnidade,
  resolverUnidades,
  totaisPorClassificacao,
  type UnidadeMedida,
} from "../src/lib/padronizacao-core.ts";

const un = (id: number, sigla: string, nome: string, sinonimos: string[] = [], classificacaoId: number | null = null, ordem = id): UnidadeMedida => ({
  id,
  sigla,
  nome,
  sinonimos,
  classificacaoId,
  ordem,
});
const cl = (id: number, nome: string, palavras: string[], ordem = id): ClassificacaoItem => ({ id, nome, cor: "#2563eb", palavras, ordem });

const UNIDADE = un(1, "UN", "UNIDADE", ["UND"]);
const CAIXA = un(2, "CX", "CAIXA");
const SERVICO_UN = un(3, "SV", "SERVIÇO", ["SERV"], 10);
const UNIDADES = [UNIDADE, CAIXA, SERVICO_UN];

describe("chaveUnidade", () => {
  it("iguala caixa, acento, pontuação, espaço e sobrescritos", () => {
    assert.equal(chaveUnidade("Unid."), "UNID");
    assert.equal(chaveUnidade("m²"), "M2");
    assert.equal(chaveUnidade("M 2"), "M2");
    assert.equal(chaveUnidade("m³"), "M3");
    assert.equal(chaveUnidade("Serviço mensal"), "SERVICOMENSAL");
  });
  it("vazio, nulo e só pontuação = sem unidade", () => {
    assert.equal(chaveUnidade(""), "");
    assert.equal(chaveUnidade(null), "");
    assert.equal(chaveUnidade(undefined), "");
    assert.equal(chaveUnidade(" - . "), "");
  });
});

describe("resolverUnidades / comparadorUnidades", () => {
  const resolver = resolverUnidades(UNIDADES);
  it("casa a sigla, o nome ou um sinônimo — sem diferença de caixa/acento/pontuação", () => {
    assert.equal(resolver("un")?.id, 1);
    assert.equal(resolver("Unidade")?.id, 1);
    assert.equal(resolver("und.")?.id, 1);
    assert.equal(resolver("Servico")?.id, 3);
    assert.equal(resolver("cx")?.id, 2);
  });
  it("grafia desconhecida ou vazia = não cadastrada", () => {
    assert.equal(resolver("PACOTE"), null);
    assert.equal(resolver(""), null);
    assert.equal(resolver(null), null);
  });
  it("sugere pela regra do sistema (UNID ≡ UNIDADE) e pelo plural; nunca sugere o que já está cadastrado", () => {
    const { sugerir } = comparadorUnidades(UNIDADES);
    assert.equal(sugerir("UNID")?.id, 1);
    assert.equal(sugerir("Unidades")?.id, 1);
    assert.equal(sugerir("CAIXAS")?.id, 2);
    assert.equal(sugerir("UND"), null, "UND já é sinônimo — cadastrada, nada a sugerir");
    assert.equal(sugerir("XPTO"), null);
    assert.equal(sugerir(""), null);
  });
  it("a sugestão vale por QUALQUER escrita da grafia, inclusive pela chave (U.N.D = UND = UNIDADE)", () => {
    const so = [un(1, "UN", "UNIDADE")];
    const { sugerir } = comparadorUnidades(so);
    assert.equal(sugerir("U.N.D")?.id, 1, "a chave UND cai no canônico UNIDADE");
    assert.equal(sugerir(["U N D", "UND"])?.id, 1);
    // A linha {UND ×1, U.N.D ×3}: a escrita mais usada é "U.N.D" — continua sugestão (antes dependia da escrita).
    const { linhas } = compararUnidades(
      [
        { texto: "UND", dfd: 1, catalogo: 0 },
        { texto: "U.N.D", dfd: 3, catalogo: 0 },
      ],
      so,
    );
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].texto, "U.N.D");
    assert.equal(linhas[0].estado, "sugestao");
    assert.equal(linhas[0].sugestaoId, 1);
  });
  it("a regra do sistema e o plural SOMAM candidatas: duas unidades possíveis = nenhuma sugestão", () => {
    const { sugerir } = comparadorUnidades([un(1, "UN", "UNIDADE"), un(2, "UND", "UNIDADE AVULSA")]);
    // "UNIDADES": o plural aponta a 1, mas a regra do sistema põe UNIDADES em UNIDADE — onde caem as DUAS.
    assert.equal(sugerir("UNIDADES"), null);
    // "UNIDADE AVULSAS": só o plural do nome da 2 (a regra do sistema não a conhece) ⇒ a 2.
    assert.equal(sugerir("UNIDADE AVULSAS")?.id, 2);
    // A grafia CADASTRADA (a chave manda) nunca vira sugestão.
    assert.equal(sugerir("U.N."), null);
  });
  it("não adivinha entre duas unidades que caem no mesmo canônico", () => {
    const { sugerir } = comparadorUnidades([un(1, "UN", "UNIDADE"), un(2, "UND", "UNIDADE AVULSA")]);
    // "UNID" = UNIDADE pela regra do sistema, mas "UND" (sigla da 2ª) também — ambíguo ⇒ sem sugestão.
    assert.equal(sugerir("UNID"), null);
  });
});

describe("compararUnidades", () => {
  const uso = [
    { texto: "UND", dfd: 5, catalogo: 1 },
    { texto: "Und.", dfd: 2, catalogo: 0 },
    { texto: "und", dfd: 1, catalogo: 0 },
    { texto: "CAIXAS", dfd: 3, catalogo: 0 },
    { texto: "PACOTE", dfd: 1, catalogo: 4 },
    { texto: "", dfd: 2, catalogo: 1 },
    { texto: null, dfd: 3, catalogo: 0 },
    { texto: "  ", dfd: 1, catalogo: 0 },
  ];
  const { linhas, semUnidade } = compararUnidades(uso, UNIDADES);
  it("junta as escritas equivalentes numa linha (a mais usada à frente) e soma o uso", () => {
    const und = linhas.find((l) => l.chave === "UND");
    assert.ok(und);
    assert.equal(und.texto, "UND");
    assert.deepEqual(
      und.grafias.map((g) => g.texto),
      ["UND", "Und.", "und"],
    );
    assert.equal(und.dfd, 8);
    assert.equal(und.catalogo, 1);
    assert.equal(und.total, 9);
    assert.equal(und.estado, "cadastrada");
    assert.equal(und.unidadeId, 1);
  });
  it("sem unidade vai à parte", () => {
    assert.deepEqual(semUnidade, { dfd: 6, catalogo: 1 });
    assert.ok(linhas.every((l) => l.chave !== ""));
  });
  it("estados e ordem: não cadastradas › sugestões › cadastradas, depois o mais usado", () => {
    assert.deepEqual(
      linhas.map((l) => [l.texto, l.estado]),
      [
        ["PACOTE", "nao_cadastrada"],
        ["CAIXAS", "sugestao"],
        ["UND", "cadastrada"],
      ],
    );
    assert.equal(linhas[1].sugestaoId, 2);
    assert.equal(linhas[0].sugestaoId, null);
  });
  it("itensPorUnidade soma o uso de cada unidade cadastrada", () => {
    const m = itensPorUnidade(linhas);
    assert.deepEqual(m.get(1), { dfd: 8, catalogo: 1 });
    assert.equal(m.get(2), undefined, "a sugestão ainda não conta como cadastrada");
  });
  it("valores inválidos contam zero (nunca NaN)", () => {
    const r = compararUnidades([{ texto: "KG", dfd: Number.NaN, catalogo: -3 }], []);
    assert.equal(r.linhas[0].total, 0);
  });
});

describe("propostaUnidade", () => {
  it("agrupa as grafias não cadastradas do MESMO canônico: sigla curta, nome canônico, os demais como sinônimos", () => {
    const { linhas } = compararUnidades(
      [
        { texto: "UNIDADE", dfd: 10, catalogo: 0 },
        { texto: "und", dfd: 4, catalogo: 0 },
        { texto: "Unid.", dfd: 2, catalogo: 0 },
        { texto: "UN", dfd: 1, catalogo: 0 },
        { texto: "KG", dfd: 9, catalogo: 0 },
      ],
      [],
    );
    const und = linhas.find((l) => l.chave === "UND");
    assert.ok(und);
    assert.deepEqual(propostaUnidade(und, linhas), { sigla: "UN", nome: "UNIDADE", sinonimos: ["UND", "UNID."] });
  });
  it("o grupo da proposta nunca inclui grafias JÁ cadastradas (canônico ambíguo)", () => {
    // UN/UNIDADE e UND/UNIDADE AVULSA caem no canônico UNIDADE ⇒ "UNID" não tem sugestão (ambíguo) e fica não cadastrada.
    const { linhas } = compararUnidades(
      [
        { texto: "UNID", dfd: 5, catalogo: 0 },
        { texto: "UN", dfd: 9, catalogo: 0 },
        { texto: "UND", dfd: 4, catalogo: 0 },
      ],
      [un(1, "UN", "UNIDADE"), un(2, "UND", "UNIDADE AVULSA")],
    );
    const unid = linhas.find((l) => l.chave === "UNID");
    assert.ok(unid);
    assert.equal(unid.estado, "nao_cadastrada");
    const p = propostaUnidade(unid, linhas);
    assert.deepEqual(p, { sigla: "UNID", nome: "UNIDADE", sinonimos: [] }, "UN e UND (cadastradas) ficam fora do grupo");
  });
  it("o nome canônico sai da CHAVE quando a escrita tem pontuação no meio (U.N.D → UNIDADE)", () => {
    const { linhas } = compararUnidades([{ texto: "U.N.D", dfd: 2, catalogo: 0 }], []);
    assert.deepEqual(propostaUnidade(linhas[0], linhas), { sigla: "U.N.D", nome: "UNIDADE", sinonimos: [] });
  });
  it("grafia longa demais: sigla/nome cortados e a grafia inteira fica como sinônimo (a unidade a cobre)", () => {
    const longa = "UNIDADE COMERCIAL EMBALADA EM CAIXA COM DOZE FRASCOS DE QUINHENTOS MILILITROS CADA";
    const { linhas } = compararUnidades([{ texto: longa, dfd: 1, catalogo: 0 }], []);
    const p = propostaUnidade(linhas[0], linhas);
    assert.equal(p.sigla.length, 20);
    assert.equal(p.nome.length, 60);
    assert.deepEqual(p.sinonimos, [longa]);
    assert.equal(resolverUnidades([un(1, p.sigla, p.nome, p.sinonimos)])(longa)?.id, 1);
  });
  it("grafia sem regra do sistema: ela mesma, em maiúsculas", () => {
    const { linhas } = compararUnidades([{ texto: "Bombona", dfd: 1, catalogo: 0 }], []);
    assert.deepEqual(propostaUnidade(linhas[0], linhas), { sigla: "BOMBONA", nome: "BOMBONA", sinonimos: [] });
  });
});

describe("limparSinonimos / conflitoUnidade", () => {
  it("tira vazios, repetidos e os iguais à sigla/nome", () => {
    assert.deepEqual(limparSinonimos("UN", "UNIDADE", [" und ", "UND.", "un", "Unidade", "", "  ", "UNID"]), ["und", "UNID"]);
  });
  it("aponta a grafia que já é de OUTRA unidade; a própria unidade não conflita consigo", () => {
    const c = conflitoUnidade({ sigla: "UND", nome: "UNIDADE AVULSA", sinonimos: [] }, UNIDADES);
    assert.equal(c?.grafia, "UND");
    assert.equal(c?.unidade.id, 1);
    assert.equal(conflitoUnidade({ sigla: "UN", nome: "UNIDADE", sinonimos: ["UND", "U"] }, UNIDADES, 1), null);
    assert.equal(conflitoUnidade({ sigla: "PCT", nome: "PACOTE", sinonimos: [] }, UNIDADES), null);
  });
});

describe("palavras-chave", () => {
  it("palavrasDe/chavePalavra: sem acento, caixa e pontuação", () => {
    assert.deepEqual(palavrasDe("Ar-condicionado, split!"), ["AR", "CONDICIONADO", "SPLIT"]);
    assert.equal(chavePalavra(" Manutenção  preventiva "), "MANUTENCAO PREVENTIVA");
    assert.deepEqual(palavrasDe(null), []);
  });
  it("limparPalavras: sem repetidas (mesma forma), sem as de menos de 2 letras", () => {
    assert.deepEqual(limparPalavras(["Manutenção", "MANUTENCAO", " a ", "", "-", "Ar", "Material  de  limpeza"]), ["Manutenção", "Ar", "Material de limpeza"]);
  });
  it("conflitoPalavra: a mesma palavra-chave em outra classificação; a própria não conflita", () => {
    const cs = [cl(1, "SERVIÇO", ["Manutenção"]), cl(2, "CONSUMO", ["Papel"])];
    assert.equal(conflitoPalavra(["papel", "caneta"], cs, 1)?.classificacao.id, 2);
    assert.equal(conflitoPalavra(["MANUTENCAO"], cs, 1), null);
    assert.equal(conflitoPalavra(["caneta"], cs), null);
  });
  it("nomeEmUso: mesmo nome sem acento/caixa", () => {
    const cs = [cl(1, "Serviço", [])];
    assert.equal(nomeEmUso("SERVICO", cs)?.id, 1);
    assert.equal(nomeEmUso("SERVICO", cs, 1), null);
    assert.equal(nomeEmUso("  ", cs), null);
  });
});

describe("criarClassificador", () => {
  const SERV = cl(1, "SERVIÇO", ["Serviço", "Manutenção", "Prestação de serviço"]);
  const PERM = cl(2, "MATERIAL PERMANENTE", ["Cadeira", "Armário", "Ar condicionado"]);
  const CONS = cl(3, "MATERIAL DE CONSUMO", ["Material", "Papel"]);
  const LIMP = cl(4, "LIMPEZA", ["Material de limpeza"]);
  const classificar = criarClassificador([SERV, PERM, CONS, LIMP], [un(9, "SV", "SERVIÇO", ["MÊS"], 1), un(8, "CX", "CAIXA")]);
  const nome = (d: string, u?: string | null) => classificar(d, u)?.classificacao.nome ?? null;

  it("vence a palavra-chave que aparece PRIMEIRO na descrição", () => {
    assert.equal(nome("SERVIÇO DE MANUTENÇÃO EM CADEIRAS DE ESCRITÓRIO"), "SERVIÇO");
    assert.equal(nome("CADEIRA GIRATÓRIA COM GARANTIA DE MANUTENÇÃO"), "MATERIAL PERMANENTE");
  });
  it("palavra longa casa o INÍCIO (plural); curta só a palavra inteira", () => {
    assert.equal(nome("CADEIRAS PLÁSTICAS"), "MATERIAL PERMANENTE");
    assert.equal(nome("ARMÁRIOS DE AÇO"), "MATERIAL PERMANENTE");
    assert.equal(nome("ARROZ TIPO 1"), null, "AR (curta) não casa ARROZ");
    assert.equal(nome("AR-CONDICIONADO SPLIT 12.000 BTUS"), "MATERIAL PERMANENTE");
  });
  it("palavra-chave CURTA sozinha: só a palavra inteira ou o plural (AR ≠ ARROZ; KIT = KITS; GÁS = GASES ≠ GASOLINA)", () => {
    const c = criarClassificador([cl(1, "CLIMA", ["Ar"]), cl(2, "KITS", ["Kit"]), cl(3, "GAS", ["Gás"]), cl(4, "PNEU", ["Pneu"])]);
    const n = (d: string) => c(d)?.classificacao.nome ?? null;
    assert.equal(n("ARROZ TIPO 1"), null);
    assert.equal(n("ARMÁRIO DE AÇO"), null);
    assert.equal(n("AR PARA COMPRESSOR"), "CLIMA");
    assert.equal(n("KITS ESCOLARES"), "KITS");
    assert.equal(n("KITCHENETTE"), null);
    assert.equal(n("GASES MEDICINAIS"), "GAS");
    assert.equal(n("GASOLINA COMUM"), null);
    // Fronteira: 4 letras já casam o início (PNEU acha PNEUS e PNEUMÁTICO).
    assert.equal(n("PNEUS ARO 15"), "PNEU");
    assert.equal(n("PNEUMÁTICO"), "PNEU");
  });
  it("palavra curta no meio da palavra-chave também é inteira (DE ≠ DESCARTÁVEL)", () => {
    assert.equal(nome("MATERIAL DESCARTÁVEL DE LIMPEZA"), "MATERIAL DE CONSUMO");
  });
  it("na mesma posição vence a mais LONGA (mais específica)", () => {
    assert.equal(nome("MATERIAL DE LIMPEZA — DETERGENTE"), "LIMPEZA");
    assert.equal(nome("PRESTAÇÃO DE SERVIÇOS GRÁFICOS"), "SERVIÇO");
    // A palavra-chave de várias palavras venceu (as demais palavras casam pelo início: SERVIÇO acha SERVIÇOS).
    assert.equal(classificar("PRESTAÇÃO DE SERVIÇOS GRÁFICOS")?.termo, "Prestação de serviço");
  });
  it("mesma posição e mesmo tamanho: vale a ordem do cadastro", () => {
    const c = criarClassificador([cl(1, "B", ["Kit"], 2), cl(2, "A", ["Kit escolar"], 5), cl(3, "C", ["Kit"], 1)]);
    // "KIT" está em B e C (mesmo tamanho): C vem antes na ordem. "KIT ESCOLAR" (mais longa) ganha de ambas.
    assert.equal(c("KIT DE PRIMEIROS SOCORROS")?.classificacao.nome, "C");
    assert.equal(c("KIT ESCOLAR COMPLETO")?.classificacao.nome, "A");
  });
  it("sem acento/caixa/pontuação dos dois lados", () => {
    assert.equal(nome("manutencao preventiva"), "SERVIÇO");
    assert.equal(nome("Papel A4, 75g/m²"), "MATERIAL DE CONSUMO");
  });
  it("sem palavra-chave, vale a classificação da UNIDADE (inclusive por sinônimo)", () => {
    const r = classificar("LOCAÇÃO DE VEÍCULO COM MOTORISTA", "Mês");
    assert.equal(r?.classificacao.nome, "SERVIÇO");
    assert.equal(r?.por, "unidade");
    assert.equal(r?.termo, "SV");
    assert.equal(classificar("LOCAÇÃO DE VEÍCULO", "CX"), null, "a unidade sem classificação não classifica");
    assert.equal(classificar("LOCAÇÃO DE VEÍCULO", "SVS"), null, "só a unidade CADASTRADA indica (o plural sugerido não)");
    assert.equal(classificar("", "SV")?.por, "unidade");
  });
  it("sem palavra-chave nem unidade que indique: não classificado", () => {
    assert.equal(classificar("PNEU ARO 15", "UN"), null);
    assert.equal(classificar(null, null), null);
  });
  it("palavra-chave de várias palavras no FIM da descrição não passa do limite", () => {
    assert.equal(nome("PRESTAÇÃO DE"), null);
  });
  it("motivo legível", () => {
    assert.equal(motivoClassificacao(classificar("Manutenção de veículos")), "Pela palavra-chave “Manutenção”");
    assert.equal(motivoClassificacao(classificar("Diária", "SV")), "Pela unidade de medida SV");
    assert.match(motivoClassificacao(null), /Nenhuma palavra-chave/);
  });
  it("cadastro vazio não classifica nada", () => {
    assert.equal(criarClassificador([])("SERVIÇO DE MANUTENÇÃO", "SV"), null);
  });
});

describe("classificarDescricoes / totaisPorClassificacao", () => {
  it("soma descrições, itens e valor por classificação e os não classificados", () => {
    const classificar = criarClassificador([cl(1, "SERVIÇO", ["Manutenção"]), cl(2, "CONSUMO", ["Papel"])]);
    const linhas = classificarDescricoes(
      [
        { descricao: "MANUTENÇÃO PREDIAL", unidade: "SV", dfd: 2, catalogo: 0, valor: 1000 },
        { descricao: "PAPEL A4", unidade: "RESMA", dfd: 3, catalogo: 1, valor: 250.5 },
        { descricao: "PAPEL KRAFT", unidade: "RL", dfd: 0, catalogo: 2, valor: 0 },
        { descricao: "PNEU", unidade: "UN", dfd: 1, catalogo: 0, valor: 400 },
      ],
      classificar,
    );
    assert.deepEqual(
      linhas.map((l) => l.id),
      [0, 1, 2, 3],
    );
    const t = totaisPorClassificacao(linhas);
    assert.deepEqual(t.porId.get(1), { descricoes: 1, dfd: 2, catalogo: 0, valor: 1000 });
    assert.deepEqual(t.porId.get(2), { descricoes: 2, dfd: 3, catalogo: 3, valor: 250.5 });
    assert.deepEqual(t.semClassificacao, { descricoes: 1, dfd: 1, catalogo: 0, valor: 400 });
    assert.deepEqual(t.total, { descricoes: 4, dfd: 6, catalogo: 3, valor: 1650.5 });
  });
  it("escala: 20 mil descrições × 40 classificações × 25 palavras-chave", () => {
    const cs = Array.from({ length: 40 }, (_, i) => cl(i + 1, `C${i}`, Array.from({ length: 25 }, (_, j) => `PRODUTO${i}X${j}`)));
    const classificar = criarClassificador(cs);
    const lista = Array.from({ length: 20_000 }, (_, k) => ({
      descricao: `ITEM GENÉRICO ${k} COM UMA DESCRIÇÃO LONGA DE ESPECIFICAÇÃO TÉCNICA ${"PALAVRA ".repeat(40)} PRODUTO${k % 40}X${k % 25}`,
      unidade: "UN",
      dfd: 1,
      catalogo: 0,
      valor: 1,
    }));
    const t0 = performance.now();
    const linhas = classificarDescricoes(lista, classificar);
    const ms = performance.now() - t0;
    assert.equal(linhas[41].resultado?.classificacao.nome, "C1");
    assert.ok(ms < 4000, `lento demais: ${Math.round(ms)} ms`);
  });
});
