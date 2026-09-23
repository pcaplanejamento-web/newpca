import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Assinatura } from "../src/lib/parse-dfd-comum.ts";
import {
  assinaturaPendenteValidacao,
  bloqueiaAssinatura,
  carimbarValidacao,
  dataAssinaturaISO,
  desfazerValidacaoEquipe,
  novoResponsavel,
  novoTemporario,
  pdfExigeAssinatura,
  type Responsaveis,
  RESPONSAVEIS_VAZIO,
  solicitanteDeResultado,
  validarAssinatura,
  validarAssinaturaPelaEquipe,
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

// Formato E — Foxit/ICP-Brasil ACHATADO lido por OCR (imperfeito). Decisão do usuário: reconhecer SEM
// travar quando a leitura não casa (mas uma assinatura de leitura LIMPA que falha ainda bloqueia).
function mkFoxit(nome: string, data = "06/07/2026 14:08:20 -03:00"): Assinatura {
  return { nome, eCpf: "***.832.056-**", usuario: "", local: "", data, ip: "", codigo: "", url: "", fonte: "foxit" };
}

describe("validarAssinatura — Formato E Foxit/OCR (reconhece sem travar)", () => {
  it("Foxit que CASA o responsável → ok (igual aos demais, não bloqueia)", () => {
    const r = validarAssinatura([mkFoxit("BRUNO BOTELHO SALEH")], padrao("BRUNO BOTELHO SALEH"), { exigeAssinatura: true });
    assert.equal(r.status, "ok");
    assert.equal(bloqueiaAssinatura(r), false);
  });

  it("Foxit que NÃO casa (só ele) → ocr (reconhecida, NÃO bloqueia)", () => {
    const r = validarAssinatura([mkFoxit("BRUNO BOTELHO SALEH")], padrao("OUTRO RESPONSAVEL"), { exigeAssinatura: true });
    assert.equal(r.status, "ocr");
    assert.equal(bloqueiaAssinatura(r), false);
    assert.equal(solicitanteDeResultado(r), null);
  });

  it("Foxit + repartição SEM responsável cadastrado → ocr (não bloqueia; OCR é imperfeito)", () => {
    const r = validarAssinatura([mkFoxit("BRUNO BOTELHO SALEH")], RESPONSAVEIS_VAZIO, { exigeAssinatura: true });
    assert.equal(r.status, "ocr");
    assert.equal(bloqueiaAssinatura(r), false);
  });

  it("Foxit que não casa + assinatura LIMPA (cert) que também não casa → erro (a limpa bloqueia)", () => {
    const r = validarAssinatura([mkFoxit("BRUNO BOTELHO SALEH"), mkAss("FULANO QUALQUER")], padrao("OUTRO RESPONSAVEL"), {
      exigeAssinatura: true,
    });
    assert.equal(r.status, "erro");
    assert.equal(bloqueiaAssinatura(r), true);
  });

  it("Foxit que casa + assinatura limpa que não casa → ok (basta uma casar)", () => {
    const r = validarAssinatura([mkFoxit("BRUNO BOTELHO SALEH"), mkAss("FULANO")], padrao("BRUNO BOTELHO SALEH"), {
      exigeAssinatura: true,
    });
    assert.equal(r.status, "ok");
  });
});

// Dropsigner/Adobe ACHATADOS lidos por OCR (`ocr:true`) — mesma regra do Foxit: reconhece sem travar.
describe("validarAssinatura — qualquer assinatura lida por OCR (ocr:true)", () => {
  const dropOcr = (nome: string): Assinatura => ({
    nome,
    eCpf: "***.413.331-**",
    usuario: "",
    local: "",
    data: "30/06/2026 19:47:21 -03:00",
    ip: "",
    codigo: "",
    url: "",
    fonte: "dropsigner",
    ocr: true,
  });

  it("Dropsigner por OCR que casa → ok", () => {
    const r = validarAssinatura([dropOcr("Hérica Cristina Rodrigues Ribeiro")], padrao("HERICA CRISTINA RODRIGUES RIBEIRO"), { exigeAssinatura: true });
    assert.equal(r.status, "ok");
  });

  it("Dropsigner por OCR que não casa → ocr (não bloqueia)", () => {
    const r = validarAssinatura([dropOcr("Hérica Cristina Rodrigues Ribeiro")], padrao("OUTRO RESPONSAVEL"), { exigeAssinatura: true });
    assert.equal(r.status, "ocr");
    assert.equal(bloqueiaAssinatura(r), false);
  });

  it("a mesma Dropsigner lida do TEXTO (sem ocr) que não casa → erro (leitura limpa bloqueia)", () => {
    const { ocr: _o, ...limpa } = dropOcr("Hérica Cristina Rodrigues Ribeiro");
    const r = validarAssinatura([limpa], padrao("OUTRO RESPONSAVEL"), { exigeAssinatura: true });
    assert.equal(r.status, "erro");
  });
});

// Validação AUTO (o sistema conferiu) × EQUIPE (validada à mão) — itens 3 e 4.
describe("validarAssinatura — origem auto/equipe", () => {
  const ocrNaoCasa: Assinatura = {
    nome: "EDILENE ALVES CRUZ",
    eCpf: "",
    usuario: "",
    local: "",
    data: "30/06/2026 16:53:38 -03:00",
    ip: "",
    codigo: "",
    url: "",
    fonte: "dropsigner",
    ocr: true,
  };
  it("casou o responsável → ok com origem 'auto'", () => {
    const r = validarAssinatura([{ ...ocrNaoCasa, nome: "EDILENE ALVES DA CRUZ" }], padrao("EDILENE ALVES DA CRUZ"), { exigeAssinatura: true });
    assert.equal(r.status, "ok");
    assert.equal(r.status === "ok" && r.origem, "auto");
  });
  it("não casou (OCR) → pendente de validação; a equipe valida → ok com origem 'equipe'", () => {
    const resp = padrao("EDILENE ALVES DA CRUZ");
    const antes = validarAssinatura([ocrNaoCasa], resp, { exigeAssinatura: true });
    assert.equal(assinaturaPendenteValidacao(antes), true);
    const validadas = validarAssinaturaPelaEquipe([ocrNaoCasa], "EDILENE ALVES DA CRUZ");
    const depois = validarAssinatura(validadas, resp, { exigeAssinatura: true });
    assert.equal(depois.status, "ok");
    assert.equal(depois.status === "ok" && depois.origem, "equipe");
    // Desfazer volta ao estado anterior.
    assert.equal(validarAssinatura(desfazerValidacaoEquipe(validadas), resp, { exigeAssinatura: true }).status, "ocr");
  });
  it("sem assinatura lida (OCR falhou) → a equipe atesta (fonte manual); em outra unidade não vale", () => {
    const v = validarAssinaturaPelaEquipe([], "EDILENE ALVES DA CRUZ");
    assert.equal(v[0].fonte, "manual");
    assert.equal(validarAssinatura(v, padrao("EDILENE ALVES DA CRUZ"), { exigeAssinatura: true }).status, "ok");
    assert.equal(validarAssinatura(v, padrao("OUTRO RESPONSAVEL"), { exigeAssinatura: true }).status, "erro");
    assert.deepEqual(desfazerValidacaoEquipe(v), []);
  });
  it("carimbo de quem/quando vem do servidor; validação idêntica mantém o carimbo original", () => {
    const v = validarAssinaturaPelaEquipe([ocrNaoCasa], "EDILENE ALVES DA CRUZ");
    const c1 = carimbarValidacao(v, [], "Fulano", "2026-09-01T10:00:00Z");
    assert.equal(c1[0].validacao?.usuario, "Fulano");
    const c2 = carimbarValidacao(v, c1, "Beltrano", "2026-09-02T10:00:00Z");
    assert.equal(c2[0].validacao?.usuario, "Fulano");
    assert.equal(c2[0].validacao?.em, "2026-09-01T10:00:00Z");
  });
});
