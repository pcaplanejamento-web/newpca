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

// Formato D — Adobe/ICP-Brasil (sem código/URL público; a prova é o certificado ICP-Brasil).
function mkAdobe(nome: string, data = "01/09/2026 14:58:52 -03:00"): Assinatura {
  return { nome, eCpf: "***.516.261-**", usuario: "", local: "", data, ip: "", codigo: "", url: "", fonte: "adobe" };
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

describe("validarAssinatura — Formato C Dropsigner (mesma lógica da assinatura normal)", () => {
  it("Dropsigner que CASA o responsável (por nome) → ok, com solicitante (igual A/B)", () => {
    const r = validarAssinatura([mkDrop("RICARDO DE SOUZA OLIVEIRA")], padrao("RICARDO DE SOUZA OLIVEIRA"), { exigeAssinatura: true });
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.tipo, "padrao");
    assert.ok(solicitanteDeResultado(r)); // aparece o responsável pela solicitação
    assert.equal(bloqueiaAssinatura(r), false);
  });

  it("Dropsigner que NÃO casa nenhum responsável → erro (não autorizado, como A/B)", () => {
    const r = validarAssinatura([mkDrop("FULANO QUALQUER")], padrao("RICARDO DE SOUZA OLIVEIRA"), { exigeAssinatura: true });
    assert.equal(r.status, "erro");
    assert.equal(bloqueiaAssinatura(r), true);
  });

  it("Dropsigner SÓ CARIMBO (nome vazio, sem bloco visível) → dropsigner (reconhecida, não bloqueia)", () => {
    const r = validarAssinatura([mkDrop("")], padrao("RICARDO DE SOUZA OLIVEIRA"), { exigeAssinatura: true });
    assert.equal(r.status, "dropsigner");
    assert.equal(bloqueiaAssinatura(r), false);
    assert.equal(solicitanteDeResultado(r), null);
  });

  it("Dropsigner casa por TEMPORÁRio no período → ok", () => {
    const r = validarAssinatura([mkDrop("MARIA SOUSA", "15/08/2026 10:00:00 -03:00")], comTemporario("MARIA SOUSA", "2026-08-01", "2026-08-31"), {
      exigeAssinatura: true,
    });
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.tipo, "temporario");
  });

  it("A/B que CASA + Dropsigner que não casa → ok (basta uma casar)", () => {
    const r = validarAssinatura([mkAss("Isaac Pires Cabral"), mkDrop("FULANO")], padrao("ISAAC PIRES CABRAL"), {
      exigeAssinatura: true,
    });
    assert.equal(r.status, "ok");
  });

  it("sem NENHUMA assinatura + PDF → erro (invariante)", () => {
    const r = validarAssinatura([], padrao("ISAAC PIRES CABRAL"), { exigeAssinatura: true });
    assert.equal(r.status, "erro");
  });

  it("A/B que NÃO casa e SEM Dropsigner → erro (não autorizado — inalterado)", () => {
    const r = validarAssinatura([mkAss("FULANO QUALQUER")], padrao("ISAAC PIRES CABRAL"), { exigeAssinatura: true });
    assert.equal(r.status, "erro");
  });
});

describe("validarAssinatura — Formato D Adobe/ICP-Brasil (mesma lógica da assinatura normal)", () => {
  it("Adobe que CASA o responsável (por nome) → ok, com solicitante (igual aos demais)", () => {
    const r = validarAssinatura([mkAdobe("RHAFAEL PEREIRA BARROS")], padrao("RHAFAEL PEREIRA BARROS"), { exigeAssinatura: true });
    assert.equal(r.status, "ok");
    assert.ok(solicitanteDeResultado(r));
    assert.equal(bloqueiaAssinatura(r), false);
  });
  it("Adobe que NÃO casa nenhum responsável → erro (não autorizado)", () => {
    const r = validarAssinatura([mkAdobe("FULANO QUALQUER")], padrao("RHAFAEL PEREIRA BARROS"), { exigeAssinatura: true });
    assert.equal(r.status, "erro");
    assert.equal(bloqueiaAssinatura(r), true);
  });
});
