import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estadoTemporario,
  parseResponsaveis,
  padroesInativos,
  responsaveisEfetivos,
  responsaveisVigentes,
  serializeResponsaveis,
  temporariosVigentes,
} from "../src/lib/reparticao-responsaveis.ts";

const HOJE = "2026-06-15";
const nom = (tipo: "portaria" | "decreto" | "lei" | null = null, numero = "", link = "") => ({ tipo, numero, link });
const resp = (nome: string, matricula = "", funcao = "", nomeacao = nom()) => ({ nome, matricula, funcao, nomeacao });
const temp = (nome: string, inicio: string, fim: string, over: Partial<ReturnType<typeof resp>> = {}) => ({
  ...resp(nome),
  ...over,
  inicio,
  fim,
});

describe("reparticao-responsaveis (N padrões + N temporários; matrícula/função/nomeação)", () => {
  it("parse: null/vazio → sem padrões nem temporários", () => {
    assert.deepEqual(parseResponsaveis(null), { padroes: [], temporarios: [] });
    assert.deepEqual(parseResponsaveis("  "), { padroes: [], temporarios: [] });
  });

  it("parse: formato NOVO (padroes[]) — normaliza e descarta sem nome", () => {
    const raw = JSON.stringify({
      padroes: [resp("Ana", "1", "Sec", nom("portaria", "10", "http://x")), resp("")],
      temporarios: [temp("Bia", "2026-01-01", "2026-03-01", { nomeacao: nom("decreto", "5", "") })],
    });
    assert.deepEqual(parseResponsaveis(raw), {
      padroes: [resp("Ana", "1", "Sec", nom("portaria", "10", "http://x"))],
      temporarios: [temp("Bia", "2026-01-01", "2026-03-01", { nomeacao: nom("decreto", "5", "") })],
    });
  });

  it("parse: formato ANTERIOR ({padrao, temporarios[ato]}) → migra (ato vira número)", () => {
    const raw = JSON.stringify({ padrao: "Ana", temporarios: [{ nome: "Bia", inicio: "2026-01-01", fim: "2026-03-01", ato: "Portaria 9" }] });
    const r = parseResponsaveis(raw);
    assert.deepEqual(r.padroes, [resp("Ana")]);
    assert.equal(r.temporarios[0].nome, "Bia");
    assert.deepEqual(r.temporarios[0].nomeacao, nom(null, "Portaria 9", ""));
  });

  it("parse: array de nomes antigo / string única → padrão", () => {
    assert.deepEqual(parseResponsaveis('["Ana","Bia"]'), { padroes: [resp("Ana")], temporarios: [] });
    assert.deepEqual(parseResponsaveis("Carlos"), { padroes: [resp("Carlos")], temporarios: [] });
  });

  it("serialize: vazio → null; nomeação sem tipo zera número/link; descarta incompletos", () => {
    assert.equal(serializeResponsaveis({ padroes: [], temporarios: [] }), null);
    const s = serializeResponsaveis({
      padroes: [resp(" Ana ", " 1 ", " Sec ", nom(null, "lixo", "lixo"))],
      temporarios: [temp("SemDatas", "", "")],
    });
    assert.deepEqual(JSON.parse(s ?? "null"), {
      padroes: [resp("Ana", "1", "Sec", nom(null, "", ""))],
      temporarios: [],
    });
  });

  it("estadoTemporario: agendado / vigente / encerrado", () => {
    assert.equal(estadoTemporario(temp("A", "2026-07-01", "2026-08-01"), HOJE), "agendado");
    assert.equal(estadoTemporario(temp("A", "2026-06-01", "2026-06-30"), HOJE), "vigente");
    assert.equal(estadoTemporario(temp("A", "2026-01-01", "2026-02-01"), HOJE), "encerrado");
  });

  it("temporário no período assume; padrões ficam inativos", () => {
    const r = { padroes: [resp("Padrão")], temporarios: [temp("Temp", "2026-06-01", "2026-06-30")] };
    assert.equal(temporariosVigentes(r, HOJE).length, 1);
    assert.equal(padroesInativos(r, HOJE), true);
    assert.deepEqual(
      responsaveisVigentes(r, HOJE).map((v) => `${v.tipo}:${v.resp.nome}`),
      ["temporario:Temp"],
    );
    // fora do período → volta aos padrões
    assert.equal(padroesInativos(r, "2026-09-01"), false);
    assert.deepEqual(
      responsaveisVigentes(r, "2026-09-01").map((v) => `${v.tipo}:${v.resp.nome}`),
      ["padrao:Padrão"],
    );
  });

  it("vários padrões vigentes quando não há temporário no período", () => {
    const r = { padroes: [resp("Ana"), resp("Bia")], temporarios: [] };
    assert.deepEqual(responsaveisVigentes(r, HOJE).map((v) => v.resp.nome), ["Ana", "Bia"]);
  });

  it("round-trip serialize→parse", () => {
    const r = {
      padroes: [resp("Ana", "1", "Sec", nom("lei", "3/2026", "http://lei"))],
      temporarios: [temp("Bia", "2026-01-01", "2026-03-01", { matricula: "2", funcao: "Dir", nomeacao: nom("decreto", "5", "") })],
    };
    assert.deepEqual(parseResponsaveis(serializeResponsaveis(r)), r);
  });
});

describe("responsaveisEfetivos (assinatura única do órgão × por unidade)", () => {
  const orgaoRaw = serializeResponsaveis({ padroes: [resp("ORGAO SIGNER")], temporarios: [] });
  const unidadeRaw = serializeResponsaveis({ padroes: [resp("UNIDADE SIGNER")], temporarios: [] });

  it("assinatura única ⇒ usa os responsáveis do ÓRGÃO", () => {
    const r = responsaveisEfetivos({ assinaturaUnica: true, orgaoRaw, unidadeRaw });
    assert.equal(r.padroes[0]?.nome, "ORGAO SIGNER");
  });

  it("por unidade (padrão) ⇒ usa os responsáveis da UNIDADE", () => {
    const r = responsaveisEfetivos({ assinaturaUnica: false, orgaoRaw, unidadeRaw });
    assert.equal(r.padroes[0]?.nome, "UNIDADE SIGNER");
  });

  it("assinatura única sem responsáveis no órgão ⇒ vazio (bloqueia até cadastrar)", () => {
    const r = responsaveisEfetivos({ assinaturaUnica: true, orgaoRaw: null, unidadeRaw });
    assert.deepEqual(r, { padroes: [], temporarios: [] });
  });
});
