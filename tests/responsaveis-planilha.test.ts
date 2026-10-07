import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validarAssinatura } from "../src/lib/reparticao-responsaveis.ts";
import {
  agruparPorNomeacao,
  alvoDoValor,
  alvoEfetivo,
  alvosParaVincular,
  alvoVale,
  cargoForaDaLista,
  chaveNomeacao,
  conferenciaDaPessoa,
  conferenciaDaUnidade,
  conferenciaDoOrgao,
  estadoDoVinculo,
  exonerado,
  funcaoDoVinculo,
  motivoNaoVincular,
  motivoVinculoInvalido,
  normalizarVinculo,
  numeroAtoNormal,
  ordenarPorPrioridade,
  type PlanilhaResponsaveis,
  periodoVinculo,
  porAlvo,
  responsaveisDosVinculos,
  responsaveisEfetivosDasUnidades,
  rotuloAlvo,
  separarVinculos,
  usuarioSugerido,
  type VinculoComPessoa,
  vigentesDoAlvo,
  vinculoConflita,
} from "../src/lib/responsaveis-planilha-core.ts";

const HOJE = "2026-06-15";
let seq = 0;
function v(over: Partial<VinculoComPessoa> & { nome: string }): VinculoComPessoa {
  seq += 1;
  return {
    id: seq,
    responsavelId: seq,
    matricula: "123",
    cargo: "Secretário",
    orgaoId: null,
    reparticaoId: 10,
    tipo: "padrao",
    funcao: "",
    atoTipo: "portaria",
    atoNumero: "1/2026",
    atoLink: "",
    inicio: "2026-01-01",
    fim: null,
    ordem: seq,
    ...over,
  };
}

const pessoa = (id: number, nome: string, matricula: string, cargo = "Secretário") => ({ id, nome, matricula, cargo, usuarioId: null, foto: null, exoneradoEm: null });

const PLANILHA = (vinculos: VinculoComPessoa[]): PlanilhaResponsaveis => ({
  pessoas: [...new Map(vinculos.map((x) => [x.responsavelId, pessoa(x.responsavelId, x.nome, x.matricula, x.cargo)])).values()],
  vinculos,
  cargos: ["Secretário", "Diretor"],
  usuarios: [],
  orgaos: [
    { id: 1, sigla: "OU", nome: "Órgão Único", assinaturaUnica: true, oculto: false },
    { id: 2, sigla: "OP", nome: "Órgão Por Unidade", assinaturaUnica: false, oculto: false },
  ],
  unidades: [
    { id: 10, codigo: "U10", nome: "Unidade 10", orgaoId: 2, oculto: false },
    { id: 11, codigo: "U11", nome: "Unidade 11", orgaoId: 2, oculto: false },
    { id: 12, codigo: "U12", nome: "Unidade 12", orgaoId: 1, oculto: false },
    { id: 13, codigo: "U13", nome: "Oculta", orgaoId: 2, oculto: true },
  ],
});

describe("responsaveisDosVinculos: o MESMO `Responsaveis` de sempre", () => {
  it("padrões e temporários na ordem; temporário sem período fica fora; sem nome sai", () => {
    const r = responsaveisDosVinculos([
      v({ nome: "Bia", tipo: "temporario", inicio: "2026-06-01", fim: "2026-06-30", ordem: 2 }),
      v({ nome: "Ana", ordem: 1, atoLink: "https://x" }),
      v({ nome: "Sem Data", tipo: "temporario", ordem: 3 }),
      v({ nome: "  ", ordem: 4 }),
    ]);
    assert.deepEqual(r.padroes, [
      { nome: "Ana", matricula: "123", funcao: "Secretário", nomeacao: { tipo: "portaria", numero: "1/2026", link: "https://x" }, inicio: "2026-01-01" },
    ]);
    assert.deepEqual(
      r.temporarios.map((t) => [t.nome, t.inicio, t.fim]),
      [["Bia", "2026-06-01", "2026-06-30"]],
    );
    assert.deepEqual(responsaveisDosVinculos([]), { padroes: [], temporarios: [] });
  });

  it("a conferência da assinatura casa pela pessoa vinculada (temporário só no período)", () => {
    const r = responsaveisDosVinculos([v({ nome: "TITULAR" }), v({ nome: "SUBSTITUTA", tipo: "temporario", inicio: "2026-06-01", fim: "2026-06-30" })]);
    const ass = (nome: string, data: string) => [{ nome, eCpf: "", usuario: "", local: "", data, ip: "", codigo: "x", url: "", fonte: "certificado" as const }];
    assert.equal(validarAssinatura(ass("Substituta", "10/06/2026"), r, { exigeAssinatura: true }).status, "ok");
    assert.notEqual(validarAssinatura(ass("Substituta", "10/07/2026"), r, { exigeAssinatura: true }).status, "ok");
    assert.equal(validarAssinatura(ass("Titular", "10/07/2026"), r, { exigeAssinatura: true }).status, "ok");
  });
});

describe("alvo efetivo: assinatura única do órgão × por unidade", () => {
  it("único → o órgão; por unidade (ou sem órgão) → a unidade", () => {
    assert.deepEqual(alvoEfetivo({ reparticaoId: 5, orgaoId: 1, assinaturaUnica: true }), { orgaoId: 1 });
    assert.deepEqual(alvoEfetivo({ reparticaoId: 5, orgaoId: 1, assinaturaUnica: false }), { reparticaoId: 5 });
    assert.deepEqual(alvoEfetivo({ reparticaoId: 5, orgaoId: null, assinaturaUnica: true }), { reparticaoId: 5 });
  });

  it("responsaveisEfetivosDasUnidades aplica a regra a cada unidade", () => {
    const vs = [v({ nome: "DO ORGAO", orgaoId: 1, reparticaoId: null }), v({ nome: "DA UNIDADE", reparticaoId: 5 })];
    const r = responsaveisEfetivosDasUnidades(
      [
        { id: 5, orgaoId: 1, assinaturaUnica: true },
        { id: 6, orgaoId: 2, assinaturaUnica: false },
      ],
      vs,
    );
    assert.equal(r[5].padroes[0].nome, "DO ORGAO", "a unidade de órgão único usa o órgão, não os vínculos dela");
    assert.deepEqual(r[6], { padroes: [], temporarios: [] });
  });

  it("alvoVale / alvosParaVincular seguem a regra (e tiram os ocultos)", () => {
    const p = PLANILHA([]);
    assert.equal(alvoVale({ orgaoId: 1, reparticaoId: null }, p), true);
    assert.equal(alvoVale({ orgaoId: 2, reparticaoId: null }, p), false);
    assert.equal(alvoVale({ orgaoId: null, reparticaoId: 10 }, p), true);
    assert.equal(alvoVale({ orgaoId: null, reparticaoId: 12 }, p), false);
    assert.deepEqual(
      alvosParaVincular(p).map((a) => a.valor),
      ["o1", "u10", "u11"],
    );
    assert.deepEqual(
      alvosParaVincular(p, 2).map((a) => a.valor),
      ["u10", "u11"],
    );
    assert.deepEqual(alvoDoValor("o7"), { orgaoId: 7, reparticaoId: null });
    assert.deepEqual(alvoDoValor("u9"), { orgaoId: null, reparticaoId: 9 });
    assert.equal(alvoDoValor("x1"), null);
    assert.equal(rotuloAlvo({ orgaoId: null, reparticaoId: 10 }, p).texto, "U10 — Unidade 10 · OP");
  });
});

describe("regras do vínculo", () => {
  it("temporário exige o cargo e o período; padrão exige o início (fim em aberto); link só http(s)", () => {
    const base = { tipo: "temporario" as const, funcao: "Diretor", atoTipo: null, atoNumero: "", atoLink: "", inicio: null, fim: null };
    assert.match(motivoVinculoInvalido(base) ?? "", /início e do fim/);
    assert.match(motivoVinculoInvalido({ ...base, funcao: " ", inicio: "2026-04-01", fim: "2026-05-01" }) ?? "", /cargo/);
    assert.match(motivoVinculoInvalido({ ...base, inicio: "2026-05-01", fim: "2026-04-01" }) ?? "", /depois/);
    assert.equal(motivoVinculoInvalido({ ...base, inicio: "2026-04-01", fim: "2026-05-01" }), null);
    const padrao = { ...base, tipo: "padrao" as const, funcao: "" };
    assert.match(motivoVinculoInvalido(padrao) ?? "", /data inicial/);
    assert.equal(motivoVinculoInvalido({ ...padrao, inicio: "2026-01-01" }), null, "sem fim = em aberto");
    assert.match(motivoVinculoInvalido({ ...padrao, inicio: "2026-03-01", fim: "2026-02-01" }) ?? "", /depois/);
    assert.match(motivoVinculoInvalido({ ...padrao, inicio: "2026-01-01", atoLink: "javascript:alert(1)" }) ?? "", /http/);
    assert.deepEqual(normalizarVinculo({ ...base, tipo: "padrao", funcao: " X ", inicio: " 2026-01-01 ", fim: "" }), {
      ...base,
      tipo: "padrao",
      funcao: "",
      inicio: "2026-01-01",
      fim: null,
    });
    assert.equal(normalizarVinculo({ ...base, funcao: "  Diretor   Geral " }).funcao, "Diretor Geral");
  });

  it("separarVinculos e funcaoDoVinculo: o padrão segue o cargo da pessoa, o temporário o do período", () => {
    const p = v({ nome: "Ana", cargo: "Secretário", ordem: 2 });
    const t = v({ nome: "Bia", cargo: "Diretor", tipo: "temporario", funcao: "Secretário Adjunto", inicio: "2026-06-01", fim: "2026-06-30", ordem: 1 });
    assert.deepEqual(separarVinculos([t, p]), { padroes: [p], temporarios: [t] });
    assert.equal(funcaoDoVinculo(p), "Secretário");
    assert.equal(funcaoDoVinculo(t), "Secretário Adjunto");
    const r = responsaveisDosVinculos([p, t]);
    assert.equal(r.temporarios[0].funcao, "Secretário Adjunto");
    assert.equal(periodoVinculo(p), "desde 01/01/2026");
    assert.equal(periodoVinculo(t), "01/06/2026 a 30/06/2026");
  });

  it("conflito: a mesma pessoa no MESMO alvo e tipo com períodos que se cruzam (fim vazio = em aberto)", () => {
    const a = v({ nome: "Ana", responsavelId: 99 });
    const t = v({ nome: "Ana", responsavelId: 99, tipo: "temporario", inicio: "2026-01-01", fim: "2026-03-31" });
    const novo = { responsavelId: 99, orgaoId: null, reparticaoId: 10 };
    assert.match(vinculoConflita({ ...novo, tipo: "padrao", inicio: "2026-05-01", fim: null }, [a]) ?? "", /padrão/);
    assert.equal(vinculoConflita({ ...novo, id: a.id, tipo: "padrao", inicio: "2026-01-01", fim: null }, [a]), null, "editar o próprio");
    assert.equal(vinculoConflita({ ...novo, reparticaoId: 11, tipo: "padrao", inicio: "2026-01-01", fim: null }, [a]), null, "outro alvo");
    const antigo = v({ nome: "Ana", responsavelId: 99, inicio: "2020-01-01", fim: "2025-12-31" });
    assert.equal(vinculoConflita({ ...novo, tipo: "padrao", inicio: "2026-01-01", fim: null }, [antigo]), null, "padrão de novo depois do fim do anterior");
    assert.match(vinculoConflita({ ...novo, tipo: "temporario", inicio: "2026-03-01", fim: "2026-04-30" }, [t]) ?? "", /cruza/);
    assert.equal(vinculoConflita({ ...novo, tipo: "temporario", inicio: "2026-04-01", fim: "2026-04-30" }, [t]), null);
  });

  it("estado: temporário pelo período; o padrão fica inativo com um temporário vigente", () => {
    const p = v({ nome: "Ana" });
    const vig = v({ nome: "Bia", tipo: "temporario", inicio: "2026-06-01", fim: "2026-06-30" });
    const ag = v({ nome: "Cid", tipo: "temporario", inicio: "2026-07-01", fim: "2026-07-31" });
    const enc = v({ nome: "Dan", tipo: "temporario", inicio: "2026-01-01", fim: "2026-01-31" });
    assert.equal(estadoDoVinculo(vig, [p, vig], HOJE), "vigente");
    assert.equal(estadoDoVinculo(ag, [p, ag], HOJE), "agendado");
    assert.equal(estadoDoVinculo(enc, [p, enc], HOJE), "encerrado");
    assert.equal(estadoDoVinculo(p, [p, vig], HOJE), "inativo");
    assert.equal(estadoDoVinculo(p, [p, ag, enc], HOJE), "vigente");
    assert.deepEqual(vigentesDoAlvo([p, vig], HOJE), { nomes: ["Bia"], temporario: true });
  });

  it("estado do PADRÃO pelo período: agendado, vigente em aberto, encerrado (e fora dos vigentes)", () => {
    const aberto = v({ nome: "Ana", inicio: "2026-01-01", fim: null });
    const futuro = v({ nome: "Bia", inicio: "2026-07-01" });
    const acabou = v({ nome: "Cid", inicio: "2025-01-01", fim: "2026-05-31" });
    const antigo = v({ nome: "Dan", inicio: null });
    assert.equal(estadoDoVinculo(aberto, [aberto], HOJE), "vigente");
    assert.equal(estadoDoVinculo(futuro, [futuro], HOJE), "agendado");
    assert.equal(estadoDoVinculo(acabou, [acabou], HOJE), "encerrado");
    assert.equal(estadoDoVinculo(antigo, [antigo], HOJE), "vigente", "sem período (dado antigo) vale sempre");
    assert.deepEqual(vigentesDoAlvo([aberto, futuro, acabou, antigo], HOJE).nomes, ["Ana", "Dan"]);
  });
});

describe("conferência: o que está mal cadastrado", () => {
  it("unidade sem responsável vigente = erro; sem início/nomeação, temporário sem cargo = atenção; único = sem cobrança", () => {
    const vs = [
      v({ nome: "Ana", reparticaoId: 10, inicio: null, atoTipo: null, atoNumero: "" }),
      v({ nome: "Bia", reparticaoId: 10, tipo: "temporario", inicio: "2026-08-01", fim: "2026-08-31" }),
    ];
    const g = porAlvo(vs);
    assert.deepEqual(
      conferenciaDaUnidade({ id: 10 }, false, g, HOJE).map((m) => m.chave),
      ["resp.semInicio", "resp.ato", "resp.funcao"],
    );
    assert.deepEqual(
      conferenciaDaUnidade({ id: 11 }, false, g, HOJE).map((m) => [m.status, m.chave]),
      [["erro", "resp.semVigente"]],
    );
    assert.deepEqual(conferenciaDaUnidade({ id: 11 }, true, g, HOJE), [], "o órgão responde");
    assert.deepEqual(
      conferenciaDaUnidade({ id: 10 }, true, g, HOJE).map((m) => m.chave),
      ["resp.naoValem"],
    );
  });

  it("órgão: único sem ninguém = erro; por unidade = conta as unidades visíveis sem responsável", () => {
    const g = porAlvo([v({ nome: "Ana", reparticaoId: 10 })]);
    assert.deepEqual(
      conferenciaDoOrgao({ id: 1, assinaturaUnica: true }, [], g, HOJE).map((m) => m.chave),
      ["resp.semVigente"],
    );
    const msgs = conferenciaDoOrgao(
      { id: 2, assinaturaUnica: false },
      [
        { id: 10, oculto: false },
        { id: 11, oculto: false },
        { id: 13, oculto: true },
      ],
      g,
      HOJE,
    );
    assert.deepEqual(
      msgs.map((m) => m.rotulo),
      ["Unidades sem responsável (1)"],
    );
  });

  it("pessoa: sem matrícula, homônimo com outra matrícula, sem vínculo, vínculo sem efeito — o encerrado NÃO é problema", () => {
    const enc = v({ nome: "Ana", responsavelId: 1, matricula: "", reparticaoId: 12, tipo: "temporario", inicio: "2026-01-01", fim: "2026-01-31" });
    const p = PLANILHA([enc]);
    p.pessoas.push(pessoa(2, "ANA", "999", ""));
    const msgs = conferenciaDaPessoa(pessoa(1, "Ana", ""), p, HOJE).map((m) => m.chave);
    assert.deepEqual(msgs, ["resp.matricula", "resp.duplicada", "resp.funcao", "resp.naoValem"]);
    assert.deepEqual(
      conferenciaDaPessoa(pessoa(2, "ANA", "999", ""), p, HOJE).map((m) => m.chave),
      ["resp.semCargo", "resp.duplicada", "resp.semVinculo"],
    );
  });

  it("usuarioSugerido: só o usuário ÚNICO de mesma matrícula (sem zeros à esquerda)", () => {
    const us = [
      { id: 1, nome: "Ana", apelido: null, matricula: "000123", foto: null },
      { id: 2, nome: "Bia", apelido: null, matricula: "55", foto: null },
      { id: 3, nome: "Bia 2", apelido: null, matricula: "055", foto: null },
    ];
    assert.equal(usuarioSugerido("123", us)?.id, 1);
    assert.equal(usuarioSugerido("55", us), null, "duas pessoas — não adivinha");
    assert.equal(usuarioSugerido("", us), null);
  });

  it("ordenarPorPrioridade: a ordem dos cargos do cadastro, fora da lista depois, sem cargo por último, empate pelo nome", () => {
    const cargos = ["Secretário", "Diretor"];
    const ps = [
      { nome: "Zeca", cargo: "" },
      { nome: "Bia", cargo: "diretor" },
      { nome: "Caio", cargo: "Assessor" },
      { nome: "ana", cargo: "Diretor" },
      { nome: "Davi", cargo: "SECRETÁRIO" },
    ];
    assert.deepEqual(
      ordenarPorPrioridade(ps, cargos).map((p) => p.nome),
      ["Davi", "ana", "Bia", "Caio", "Zeca"],
    );
  });

  it("separarVinculos com cargos: cada seção pela prioridade (o padrão pelo cargo da pessoa, o temporário pelo do período)", () => {
    const a = v({ nome: "Ana", cargo: "Diretor", ordem: 1 });
    const b = v({ nome: "Bia", cargo: "Secretário", ordem: 2 });
    const t1 = v({ nome: "Caio", cargo: "Secretário", tipo: "temporario", funcao: "Diretor", inicio: "2026-06-01", fim: "2026-06-30", ordem: 3 });
    const t2 = v({ nome: "Duda", cargo: "Diretor", tipo: "temporario", funcao: "Secretário", inicio: "2026-07-01", fim: "2026-07-30", ordem: 4 });
    const r = separarVinculos([a, b, t1, t2], ["Secretário", "Diretor"]);
    assert.deepEqual(r.padroes.map((x) => x.nome), ["Bia", "Ana"]);
    assert.deepEqual(r.temporarios.map((x) => x.nome), ["Duda", "Caio"]);
  });

  it("exoneração: vale a partir da data; nada de vínculo NOVO depois dela nem começando depois", () => {
    const futura = { exoneradoEm: "2026-12-31" };
    const passada = { exoneradoEm: "2026-01-10" };
    assert.equal(exonerado({ exoneradoEm: null }, HOJE), false);
    assert.equal(exonerado(futura, HOJE), false);
    assert.equal(exonerado(passada, HOJE), true);
    assert.equal(motivoNaoVincular({ exoneradoEm: null }, { inicio: "2030-01-01" }, HOJE, true), null);
    assert.equal(motivoNaoVincular(futura, { inicio: "2026-02-01" }, HOJE, true), null, "exoneração futura: vincula antes dela");
    assert.match(motivoNaoVincular(futura, { inicio: "2027-01-01" }, HOJE, true) ?? "", /depois da exoneração/);
    assert.match(motivoNaoVincular(passada, { inicio: "2026-01-01" }, HOJE, true) ?? "", /não recebe vínculos novos/);
    assert.equal(motivoNaoVincular(passada, { inicio: "2026-01-01" }, HOJE, false), null, "o vínculo já existente segue editável");
  });

  it("exonerado: os vínculos cadastrados continuam valendo nos vigentes", () => {
    const p = v({ nome: "Ana", responsavelId: 1, reparticaoId: 11 });
    const pl = PLANILHA([p]);
    pl.pessoas[0] = { ...pl.pessoas[0], exoneradoEm: "2026-01-01" };
    assert.deepEqual(vigentesDoAlvo(pl.vinculos, HOJE).nomes, ["Ana"]);
  });

  it("cargo ou função FORA da lista de Cargos e funções é ERRO (pessoa, temporário e o lugar em que responde)", () => {
    assert.equal(cargoForaDaLista("secretário", ["Secretário"]), false);
    assert.equal(cargoForaDaLista("Assessor", ["Secretário"]), true);
    assert.equal(cargoForaDaLista("", ["Secretário"]), false, "vazio é o 'Sem cargo'");
    assert.equal(cargoForaDaLista("Assessor", []), false, "sem lista cadastrada, não confere");
    const t = v({ nome: "Ana", responsavelId: 1, cargo: "Assessor", reparticaoId: 11, tipo: "temporario", funcao: "Chefe", inicio: "2026-01-01", fim: "2026-12-31" });
    const pl = PLANILHA([t]);
    const msgs = conferenciaDaPessoa(pl.pessoas[0], pl, HOJE);
    assert.ok(msgs.some((m) => m.chave === "resp.cargoFora" && m.status === "erro"));
    assert.ok(msgs.some((m) => m.chave === "resp.funcaoFora" && m.status === "erro"));
    const padrao = v({ nome: "Bia", responsavelId: 2, cargo: "Assessor", reparticaoId: 11 });
    const alvo = conferenciaDaUnidade({ id: 11 }, false, new Map([["u11", [padrao]]]), HOJE, ["Secretário"]);
    assert.ok(alvo.some((m) => m.chave === "resp.cargoFora" && m.status === "erro"));
  });

  it("nomeação UNIFICADA: a mesma pessoa, o mesmo tipo e o ato de mesmo nº viram um grupo", () => {
    assert.equal(numeroAtoNormal(" 1912 / 2026 "), "1912/2026");
    assert.equal(numeroAtoNormal("01912/2026"), "1912/2026");
    const a = v({ nome: "Ana", responsavelId: 1, reparticaoId: 11, atoTipo: "decreto", atoNumero: "1912/2026" });
    const b = v({ nome: "Ana", responsavelId: 1, reparticaoId: 12, atoTipo: "decreto", atoNumero: "1912 / 2026" });
    const c = v({ nome: "Ana", responsavelId: 1, reparticaoId: 13, atoTipo: "portaria", atoNumero: "1912/2026" });
    const d = v({ nome: "Ana", responsavelId: 1, reparticaoId: 14, atoTipo: "decreto", atoNumero: "" });
    const e = v({ nome: "Ana", responsavelId: 1, reparticaoId: 15, atoTipo: null, atoNumero: "" });
    assert.equal(chaveNomeacao(d), null, "sem nº, não unifica");
    assert.deepEqual(
      agruparPorNomeacao([a, c, b, d, e]).map((g) => g.map((x) => x.reparticaoId)),
      [[11, 12], [13], [14], [15]],
    );
    const t = v({ nome: "Ana", responsavelId: 1, reparticaoId: 16, tipo: "temporario", atoTipo: "decreto", atoNumero: "1912/2026", inicio: "2026-01-01", fim: "2026-02-01" });
    assert.equal(agruparPorNomeacao([a, t]).length, 2, "padrão e temporário não se juntam");
  });
});
