import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Assinatura } from "../src/lib/parse-dfd-comum.ts";
import {
  bloqueiaAssinatura,
  dataAssinaturaISO,
  novoResponsavel,
  novoTemporario,
  pdfExigeAssinatura,
  type Responsaveis,
  RESPONSAVEIS_VAZIO,
  solicitanteDeResultado,
  validarAssinatura,
} from "../src/lib/reparticao-responsaveis.ts";

function mkAss(nome: string, data = "31/08/2026 16:20:00", codigo = "pVSGdg58teX"): Assinatura {
  return { nome, eCpf: "***.390.771-**", usuario: "isaac.pires", local: "BR", data, ip: "", codigo, url: "", fonte: "certificado" };
}

function mkDrop(nome: string, data = "02/09/2026 09:58:56 -03:00", codigo = "T3B43-D54KH-QU7SZ-DYF7H"): Assinatura {
  return { nome, eCpf: "***.997.391-**", usuario: "", local: "", data, ip: "", codigo, url: `https://www.dropsigner.com/validate/${codigo}`, fonte: "dropsigner" };
}

const padrao = (nome: string): Responsaveis => ({ padroes: [novoResponsavel(nome)], temporarios: [] });

function comTemporario(nome: string, inicio: string, fim: string): Responsaveis {
  const t = novoTemporario();
  t.nome = nome;
  t.inicio = inicio;
  t.fim = fim;
  t.nomeacao = { tipo: "portaria", numero: "123/2026", link: "" };
  return { padroes: [novoResponsavel("OUTRO TITULAR")], temporarios: [t] };
}

describe("dataAssinaturaISO", () => {
  it("converte dd/mm/aaaa (com ou sem hora) para ISO", () => {
    assert.equal(dataAssinaturaISO("31/08/2026 16:20:00"), "2026-08-31");
    assert.equal(dataAssinaturaISO("01/09/2026"), "2026-09-01");
    assert.equal(dataAssinaturaISO("sem data"), "");
  });
});

describe("pdfExigeAssinatura", () => {
  it("exige assinatura só para .pdf", () => {
    assert.equal(pdfExigeAssinatura("DFD 945.pdf"), true);
    assert.equal(pdfExigeAssinatura("EmitirDFD.xlsx"), false);
    assert.equal(pdfExigeAssinatura(null), false);
  });
});

describe("validarAssinatura", () => {
  it("casa com um responsável PADRÃO (qualquer data)", () => {
    const r = validarAssinatura([mkAss("Isaac Pires Cabral")], padrao("ISAAC PIRES CABRAL"), {
      exigeAssinatura: true,
    });
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.tipo, "padrao");
  });

  it("casa com um TEMPORÁRIO quando a data está no período", () => {
    const r = validarAssinatura([mkAss("MARIA SOUSA", "15/08/2026 10:00:00")], comTemporario("MARIA SOUSA", "2026-08-01", "2026-08-31"), {
      exigeAssinatura: true,
    });
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.tipo, "temporario");
  });

  it("temporário FORA do período → erro", () => {
    const r = validarAssinatura([mkAss("MARIA SOUSA", "15/09/2026 10:00:00")], comTemporario("MARIA SOUSA", "2026-08-01", "2026-08-31"), {
      exigeAssinatura: true,
    });
    assert.equal(r.status, "erro");
  });

  it("PDF sem assinatura → erro (bloqueia)", () => {
    const r = validarAssinatura([], padrao("ISAAC PIRES CABRAL"), { exigeAssinatura: true });
    assert.equal(r.status, "erro");
  });

  it(".xlsx sem assinatura → sem-assinatura (permite)", () => {
    const r = validarAssinatura([], padrao("ISAAC PIRES CABRAL"), { exigeAssinatura: false });
    assert.equal(r.status, "sem-assinatura");
  });

  it("assinatura + repartição SEM responsável cadastrado → erro (bloqueia até cadastrar)", () => {
    const r = validarAssinatura([mkAss("ISAAC PIRES CABRAL")], RESPONSAVEIS_VAZIO, { exigeAssinatura: true });
    assert.equal(r.status, "erro");
  });

  it("assinante que não é responsável → erro", () => {
    const r = validarAssinatura([mkAss("FULANO QUALQUER")], padrao("ISAAC PIRES CABRAL"), { exigeAssinatura: true });
    assert.equal(r.status, "erro");
  });

  it("solicitanteDeResultado traz o período e o ato do temporário", () => {
    const r = validarAssinatura([mkAss("MARIA SOUSA", "15/08/2026 10:00:00")], comTemporario("MARIA SOUSA", "2026-08-01", "2026-08-31"), {
      exigeAssinatura: true,
    });
    const s = solicitanteDeResultado(r);
    assert.ok(s);
    assert.equal(s?.tipo, "temporario");
    assert.equal(s?.inicio, "2026-08-01");
    assert.equal(s?.fim, "2026-08-31");
    assert.equal(s?.nomeacao.numero, "123/2026");
    assert.equal(s?.assinaturaCodigo, "pVSGdg58teX");
  });
});

describe("validarAssinatura — Formato C Dropsigner (reconhecer como válida)", () => {
  it("SÓ Dropsigner (sem A/B) → dropsigner (não bloqueia), mesmo sem match por nome", () => {
    const r = validarAssinatura([mkDrop("ANDERSON FERREIRA DE MORAIS")], padrao("OUTRO TITULAR"), { exigeAssinatura: true });
    assert.equal(r.status, "dropsigner");
    assert.equal(bloqueiaAssinatura(r), false);
    assert.equal(solicitanteDeResultado(r), null);
  });

  it("SÓ Dropsigner + repartição SEM responsável cadastrado → dropsigner (não exige responsável)", () => {
    const r = validarAssinatura([mkDrop("ANDERSON FERREIRA DE MORAIS")], RESPONSAVEIS_VAZIO, { exigeAssinatura: true });
    assert.equal(r.status, "dropsigner");
    assert.equal(bloqueiaAssinatura(r), false);
  });

  it("A/B que CASA + Dropsigner → ok (A/B tem prioridade; comportamento A/B inalterado)", () => {
    const r = validarAssinatura([mkAss("Isaac Pires Cabral"), mkDrop("ANDERSON FERREIRA DE MORAIS")], padrao("ISAAC PIRES CABRAL"), {
      exigeAssinatura: true,
    });
    assert.equal(r.status, "ok");
  });

  it("sem NENHUMA assinatura + PDF → erro (invariante: Dropsigner não afrouxa o 'sem assinatura')", () => {
    const r = validarAssinatura([], padrao("ISAAC PIRES CABRAL"), { exigeAssinatura: true });
    assert.equal(r.status, "erro");
  });

  it("A/B que NÃO casa e SEM Dropsigner → erro (não autorizado — inalterado)", () => {
    const r = validarAssinatura([mkAss("FULANO QUALQUER")], padrao("ISAAC PIRES CABRAL"), { exigeAssinatura: true });
    assert.equal(r.status, "erro");
  });
});
