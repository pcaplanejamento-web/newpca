import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validarAssinatura } from "../src/lib/reparticao-responsaveis.ts";
import {
  alvoDoValor,
  alvoEfetivo,
  alvosParaVincular,
  alvoVale,
  conferenciaDaPessoa,
  conferenciaDaUnidade,
  conferenciaDoOrgao,
  estadoDoVinculo,
  motivoVinculoInvalido,
  normalizarVinculo,
  type PlanilhaResponsaveis,
  porAlvo,
  responsaveisDosVinculos,
  responsaveisEfetivosDasUnidades,
  rotuloAlvo,
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
    orgaoId: null,
    reparticaoId: 10,
    tipo: "padrao",
    funcao: "Secretário",
    atoTipo: "portaria",
    atoNumero: "1/2026",
    atoLink: "",
    inicio: null,
    fim: null,
    ordem: seq,
    ...over,
  };
}

const PLANILHA = (vinculos: VinculoComPessoa[]): PlanilhaResponsaveis => ({
  pessoas: [...new Map(vinculos.map((x) => [x.responsavelId, { id: x.responsavelId, nome: x.nome, matricula: x.matricula }])).values()],
  vinculos,
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
    assert.deepEqual(r.padroes, [{ nome: "Ana", matricula: "123", funcao: "Secretário", nomeacao: { tipo: "portaria", numero: "1/2026", link: "https://x" } }]);
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
  it("temporário exige período válido; link só http(s); o padrão perde o período", () => {
    const base = { tipo: "temporario" as const, funcao: "", atoTipo: null, atoNumero: "", atoLink: "", inicio: null, fim: null };
    assert.match(motivoVinculoInvalido(base) ?? "", /início e do fim/);
    assert.match(motivoVinculoInvalido({ ...base, inicio: "2026-05-01", fim: "2026-04-01" }) ?? "", /depois/);
    assert.equal(motivoVinculoInvalido({ ...base, inicio: "2026-04-01", fim: "2026-05-01" }), null);
    assert.match(motivoVinculoInvalido({ ...base, tipo: "padrao", atoLink: "javascript:alert(1)" }) ?? "", /http/);
    assert.deepEqual(normalizarVinculo({ ...base, tipo: "padrao", funcao: " X ", inicio: "2026-01-01", fim: "2026-02-01" }), {
      ...base,
      tipo: "padrao",
      funcao: "X",
    });
  });

  it("conflito: a mesma pessoa padrão duas vezes ou temporários que se cruzam no MESMO alvo", () => {
    const a = v({ nome: "Ana", responsavelId: 99 });
    const t = v({ nome: "Ana", responsavelId: 99, tipo: "temporario", inicio: "2026-01-01", fim: "2026-03-31" });
    const novo = { responsavelId: 99, orgaoId: null, reparticaoId: 10 };
    assert.match(vinculoConflita({ ...novo, tipo: "padrao", inicio: null, fim: null }, [a]) ?? "", /padrão/);
    assert.equal(vinculoConflita({ ...novo, id: a.id, tipo: "padrao", inicio: null, fim: null }, [a]), null, "editar o próprio");
    assert.equal(vinculoConflita({ ...novo, reparticaoId: 11, tipo: "padrao", inicio: null, fim: null }, [a]), null, "outro alvo");
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
});

describe("conferência: o que está mal cadastrado", () => {
  it("unidade sem responsável vigente = erro; com função/nomeação faltando = atenção; único = sem cobrança", () => {
    const vs = [v({ nome: "Ana", reparticaoId: 10, funcao: "", atoTipo: null, atoNumero: "" })];
    const g = porAlvo(vs);
    assert.deepEqual(
      conferenciaDaUnidade({ id: 10 }, false, g, HOJE).map((m) => m.chave),
      ["resp.funcao", "resp.ato"],
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

  it("pessoa: sem matrícula, homônimo com outra matrícula, sem vínculo, vínculo sem efeito, temporário encerrado", () => {
    const enc = v({ nome: "Ana", responsavelId: 1, matricula: "", reparticaoId: 12, tipo: "temporario", inicio: "2026-01-01", fim: "2026-01-31" });
    const p = PLANILHA([enc]);
    p.pessoas.push({ id: 2, nome: "ANA", matricula: "999" });
    const msgs = conferenciaDaPessoa({ id: 1, nome: "Ana", matricula: "" }, p, HOJE).map((m) => m.chave);
    assert.deepEqual(msgs, ["resp.matricula", "resp.duplicada", "resp.encerrado", "resp.naoValem"]);
    assert.deepEqual(
      conferenciaDaPessoa({ id: 2, nome: "ANA", matricula: "999" }, p, HOJE).map((m) => m.chave),
      ["resp.duplicada", "resp.semVinculo"],
    );
  });
});
