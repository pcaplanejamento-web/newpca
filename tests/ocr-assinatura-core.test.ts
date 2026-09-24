import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assinaturasDeOcr,
  type Caixa,
  caixasImagensDaOpList,
  codigoDropsignerDeOcr,
  corrigirNomePelaCamada,
  cpfDeOcr,
  dropsignerDeOcr,
  filaSerial,
  type LeituraOcr,
  limparNomeOcr,
  localizarBlocosAssinatura,
  lerAssinaturasPorOcr,
  type MotorOcr,
  mesclarAssinaturasOcr,
  type PalavraOcr,
  precisaOcr,
  prioridadePaginasOcr,
  regioesDeImagens,
  votarCodigoDropsigner,
} from "../src/lib/ocr-assinatura-core.ts";
import type { Assinatura } from "../src/lib/parse-dfd-comum.ts";

// Saídas REAIS do tesseract (pd101820, DFD 141/136) — recorte binarizado do bloco Dropsigner achatado.
const BLOCO_141 =
  'Assinado eletronicamente por:\nHérica Cristina Rodrigues Ribeiro\nCPF: *** 413.331-**\nData: 30/06/2026 19:47:21 -03:00 :\n"* Dropsig\n';
const ESPARSO_141 =
  "Assinado eletronicamente por:\n\nHérica Cristina Rodrigues Ribeiro\n\nCPF: *** 413.331-“\n\nData: 30/06/2026 19:47:21 -03:00\n\nPropsig\n\nA a om\n";
const BLOCO_136 =
  "Assinado eletronicamente por:\nOSMAR PONCE LEONES\nCPF: ***. 713.44 1-**\nData: 01/07/2026 07:35:16 -03:00 :\n* Dropsigner\nMENTO e Ne\n";
// Marca d'água vertical (girada) lida em variantes — uma com "O" (ambíguo) no lugar do "Q".
const MARCAS_141 = [
  "Documento assinado no Dropsianer. Para validar o documento e suas assinaturas acesse https://www.dropsigner.com/validate/GHALU-7PJTU-4QBRB-RNSMN.\n",
  "Documento assinado no Dropsianer. Para validar o documento e suas assinaturas acesse httos://www.dropsigner.com/validate/ GHALU-7PJTU-4QBRB-RNSMN.\n",
  "Documento assinado no Dropsigner. Para validar o documento e suas assinaturas acesse https://www.dropsigner.com/validate/ GHALU-7PJTU-4QBRB-RNSMN.\n",
];

const ass = (p: Partial<Assinatura>): Assinatura => ({
  nome: "",
  eCpf: "",
  usuario: "",
  local: "",
  data: "",
  ip: "",
  codigo: "",
  url: "",
  fonte: "dropsigner",
  ...p,
});

describe("limparNomeOcr / cpfDeOcr", () => {
  it("descarta lixo dos ícones e mantém partículas entre nomes", () => {
    assert.equal(limparNomeOcr("fo & Claudio Luiz de Sousa = 2"), "Claudio Luiz de Sousa");
    assert.equal(limparNomeOcr("de Maria"), "Maria");
  });
  it("CPF mascarado tolerante a espaços; CPF inteiro é mascarado; pouco dígito → vazio", () => {
    assert.equal(cpfDeOcr("CPF: ***. 713.44 1-**"), "***.713.441-**");
    assert.equal(cpfDeOcr("CPF: 035.832.056-93"), "***.832.056-**");
    assert.equal(cpfDeOcr("CPF: ***"), "");
  });
});

describe("código Dropsigner (alfabeto + consenso)", () => {
  it("aceita só o formato 4×5 no alfabeto (sem O/0/I/1)", () => {
    assert.equal(codigoDropsignerDeOcr(MARCAS_141[1]), "GHALU-7PJTU-4QBRB-RNSMN");
    assert.equal(codigoDropsignerDeOcr("dropsigner.com/validate/7JJM9-GUXPJ-CRO87-QQ23M"), null);
  });
  it("vota posição a posição; uma leitura divergente não vence; 1 leitura só → null", () => {
    assert.equal(votarCodigoDropsigner([...MARCAS_141, "validate/GHALU-7PJTU-4QBRB-RNSMW"]), "GHALU-7PJTU-4QBRB-RNSMN");
    assert.equal(votarCodigoDropsigner([MARCAS_141[0]]), null);
    assert.equal(votarCodigoDropsigner(["validate/AAAAA-BBBBB-CCCCC-DDDDD", "validate/AAAAA-BBBBB-CCCCC-DDDDE"]), null);
  });
});

describe("dropsignerDeOcr (bloco achatado lido por OCR)", () => {
  it("lê nome, CPF mascarado e data do bloco real", () => {
    assert.deepEqual(dropsignerDeOcr(BLOCO_141), [
      { nome: "Hérica Cristina Rodrigues Ribeiro", eCpf: "***.413.331-**", data: "30/06/2026 19:47:21 -03:00" },
    ]);
    assert.equal(dropsignerDeOcr(ESPARSO_141)[0].nome, "Hérica Cristina Rodrigues Ribeiro");
    assert.equal(dropsignerDeOcr(BLOCO_136)[0].eCpf, "***.713.441-**");
  });
  it("sem a linha 'Assinado…' (rubrica por cima) ancora no CPF", () => {
    const r = dropsignerDeOcr("OSMAR PONCE LEONES\nCPF: ***.713.441-**\nData: 01/07/2026 07:35:16 -03:00\nDropsigner");
    assert.equal(r[0]?.nome, "OSMAR PONCE LEONES");
  });
  it("NÃO casa o Formato B nem prosa do DFD", () => {
    assert.deepEqual(dropsignerDeOcr("Assinado digitalmente por FULANO DE TAL, portador do CPF: 123 utilizando o código: X"), []);
    assert.deepEqual(dropsignerDeOcr("Autorizo o início da formalização da demanda.\nORDENADOR DE DESPESAS"), []);
  });
});

describe("corrigirNomePelaCamada", () => {
  const camada = "10 - AUTORIZAÇÃO Autorizo. OSMAR PONCE LEONES Secretário Municipal";
  it("corrige erro pequeno do OCR pela grafia impressa no DFD", () => {
    assert.deepEqual(corrigirNomePelaCamada("OSMAR PONCÊE LEONES", camada), { nome: "OSMAR PONCE LEONES", confirmado: true });
  });
  it("não troca por um nome distante; nome idêntico é confirmado", () => {
    assert.equal(corrigirNomePelaCamada("MARIA DAS DORES", camada).confirmado, false);
    assert.equal(corrigirNomePelaCamada("Osmar Ponce Leones", camada).confirmado, true);
  });
});

describe("assinaturasDeOcr (agrupamento + votação)", () => {
  it("várias leituras da MESMA assinatura viram UMA, com o código por consenso", () => {
    const r = assinaturasDeOcr({ blocos: [BLOCO_141, ESPARSO_141], pagina: "", marcaDagua: MARCAS_141 });
    assert.equal(r.length, 1);
    assert.equal(r[0].nome, "Hérica Cristina Rodrigues Ribeiro");
    assert.equal(r[0].codigo, "GHALU-7PJTU-4QBRB-RNSMN");
    assert.equal(r[0].url, "https://www.dropsigner.com/validate/GHALU-7PJTU-4QBRB-RNSMN");
    assert.equal(r[0].ocr, true);
  });
  it("código ambíguo (O) → sem código/sem link (nunca um link errado)", () => {
    const r = assinaturasDeOcr({ blocos: [BLOCO_136], pagina: "", marcaDagua: ["validate/7JJM9-GUXPJ-CRO87-QQ23M"] });
    assert.equal(r[0].codigo, "");
    assert.equal(r[0].url, "");
  });
  it("Foxit achatado lido por OCR sai com fonte foxit e ocr:true", () => {
    const foxit =
      "Assinado digitalmente por BRUNO BOTELHO SALEH:03583205693 ND: C=BR, O=ICP-Brasil, CN=BRUNO BOTELHO SALEH:03583205693 Data: 2026.07.06 14:08:20-03'00' Foxit PDF Reader";
    const r = assinaturasDeOcr({ blocos: [], pagina: foxit });
    assert.equal(r[0].fonte, "foxit");
    assert.equal(r[0].nome, "BRUNO BOTELHO SALEH");
    assert.equal(r[0].ocr, true);
  });
  it("sem nome mas com código → carimbo Dropsigner", () => {
    const r = assinaturasDeOcr({ blocos: [], pagina: "", marcaDagua: MARCAS_141 });
    assert.equal(r.length, 1);
    assert.equal(r[0].nome, "");
    assert.equal(r[0].codigo, "GHALU-7PJTU-4QBRB-RNSMN");
  });
});

describe("precisaOcr / mesclarAssinaturasOcr", () => {
  const carimbo = ass({ codigo: "GHALU-7PJTU-4QBRB-RNSMN", url: "https://www.dropsigner.com/validate/GHALU-7PJTU-4QBRB-RNSMN" });
  it("precisa de OCR sem assinatura NOMEADA (vazio ou só carimbo)", () => {
    assert.equal(precisaOcr([]), true);
    assert.equal(precisaOcr([carimbo]), true);
    assert.equal(precisaOcr([ass({ nome: "FULANO", fonte: "certificado" })]), false);
  });
  it("a nomeada do OCR substitui o carimbo de texto e herda o código EXATO dele", () => {
    const r = mesclarAssinaturasOcr([carimbo], [ass({ nome: "Hérica Cristina", ocr: true })]);
    assert.equal(r.length, 1);
    assert.equal(r[0].nome, "Hérica Cristina");
    assert.equal(r[0].codigo, carimbo.codigo);
  });
  it("OCR sem nome não apaga o que veio do texto", () => {
    assert.deepEqual(mesclarAssinaturasOcr([carimbo], []), [carimbo]);
    const c2 = ass({ codigo: "X", ocr: true });
    assert.deepEqual(mesclarAssinaturasOcr([], [c2]), [c2]);
  });
});

describe("geometria (localização / regiões / prioridade / op list)", () => {
  const w = (text: string, x0: number, y0: number, x1: number, y1: number): PalavraOcr => ({ text, bbox: { x0, y0, x1, y1 } });
  it("localiza o bloco pelas âncoras e ignora âncora solta ('ELETRÔNICA' de item)", () => {
    const palavras = [
      w("Assinado", 1000, 2000, 1100, 2020),
      w("eletronicamente", 1110, 2000, 1300, 2020),
      w("CPF:", 1000, 2060, 1050, 2080),
      w("Data:", 1000, 2090, 1060, 2110),
      w("ELETRÔNICA", 100, 500, 250, 520), // descrição de item — não é âncora
    ];
    const caixas = localizarBlocosAssinatura(palavras, { w: 2500, h: 3500 }, 3);
    assert.equal(caixas.length, 1);
    assert.ok(caixas[0].x0 < 1000 && caixas[0].y0 < 2000 && caixas[0].y1 > 2110);
  });
  it("regiões das imagens ignoram o cabeçalho (brasão) e expandem p/ a esquerda do logo", () => {
    const r = regioesDeImagens([
      { x0: 0.05, y0: 0.02, x1: 0.2, y1: 0.1 }, // brasão do cabeçalho
      { x0: 0.8, y0: 0.7, x1: 0.9, y1: 0.75 }, // logo do Dropsigner
    ]);
    assert.equal(r.length, 1);
    assert.ok(r[0].x0 < 0.5 && r[0].y0 < 0.7);
  });
  it("prioridade: imagem > rótulo de assinatura > última página", () => {
    const ord = prioridadePaginasOcr([
      { pagina: 1, imagens: 0, texto: "1 - ÁREA REQUISITANTE" },
      { pagina: 2, imagens: 0, texto: "10 - AUTORIZAÇÃO" },
      { pagina: 3, imagens: 1, texto: "" },
    ]).map((p) => p.pagina);
    assert.deepEqual(ord, [3, 2, 1]);
  });
  it("op list: rastreia a CTM (inclui a matriz do Form XObject) até a caixa da imagem", () => {
    const OPS = { save: 1, restore: 2, transform: 3, paintFormXObjectBegin: 4, paintFormXObjectEnd: 5, paintImageXObject: 6, paintInlineImageXObject: 7, paintImageXObjectRepeat: 8 };
    const caixas = caixasImagensDaOpList(
      [1, 4, 3, 6, 5, 2],
      [null, [[1, 0, 0, 1, 400, 100], null], [100, 0, 0, 50, 0, 0], null, null, null],
      OPS,
      { largura: 600, altura: 800 },
    );
    assert.equal(caixas.length, 1);
    const k = caixas[0];
    assert.ok(Math.abs(k.x0 - 400 / 600) < 1e-9 && Math.abs(k.x1 - 500 / 600) < 1e-9);
    assert.ok(Math.abs(k.y0 - (1 - 150 / 800)) < 1e-9 && Math.abs(k.y1 - (1 - 100 / 800)) < 1e-9);
  });
});

describe("lerAssinaturasPorOcr (orquestração com motor falso)", () => {
  type Tela = { pagina: number; w: number; h: number; recorte?: Caixa };
  function motorFalso(textoPorPagina: Record<number, string>, falhaEm?: number): MotorOcr<Tela> & { lidas: number[] } {
    const lidas: number[] = [];
    return {
      lidas,
      async render(pagina) {
        if (pagina === falhaEm) throw new Error("render falhou");
        lidas.push(pagina);
        return { pagina, w: 1800, h: 2500 };
      },
      dims: (c) => ({ w: c.w, h: c.h }),
      recortar: (c, caixa) => ({ ...c, recorte: caixa }),
      async ler(c): Promise<LeituraOcr> {
        return { texto: textoPorPagina[c.pagina] ?? "", palavras: [] };
      },
      imagens: async () => [],
      textoCamada: async (p) => (p === 2 ? "10 - AUTORIZAÇÃO Hérica Cristina Rodrigues Ribeiro" : ""),
    };
  }
  it("acha a assinatura em QUALQUER página (priorizando o rótulo de assinatura)", async () => {
    const m = motorFalso({ 2: BLOCO_141 });
    const r = await lerAssinaturasPorOcr(m, [1, 2, 3]);
    assert.equal(r.length, 1);
    assert.equal(r[0].nome, "Hérica Cristina Rodrigues Ribeiro");
    assert.equal(m.lidas[0], 2);
  });
  it("página que falha não impede as demais (best-effort)", async () => {
    const m = motorFalso({ 3: BLOCO_136 }, 2);
    const r = await lerAssinaturasPorOcr(m, [1, 2, 3]);
    assert.equal(r[0]?.nome, "OSMAR PONCE LEONES");
  });
  it("nada achado → []", async () => {
    assert.deepEqual(await lerAssinaturasPorOcr(motorFalso({}), [1, 2]), []);
  });
});

// DFD 142 (pd101820): o OCR juntou o nome IMPRESSO ao lado com o do carimbo → a MESMA assinatura
// aparecia duas vezes (uma com o nome repetido). Deve sair UMA.
describe("assinaturasDeOcr — sem duplicar a mesma assinatura", () => {
  it("nome repetido na linha é colapsado", () => {
    assert.equal(limparNomeOcr("EDILENE ALVES DA CRUZ EDILENE ALVES DA CRUZ"), "EDILENE ALVES DA CRUZ");
  });
  it("leituras com a mesma data/hora e CPF viram UMA assinatura", () => {
    const b1 = "Assinado eletronicamente por:\nEDILENE ALVES DA CRUZ\nCPF: ***.246.411-**\nData: 30/06/2026 16:53:38 -03:00";
    const b2 = "Assinado eletronicamente por:\nEDILENE ALVES DA CRUZ SECRETARIA INTERINA\nCPF: ***.246.411-**\nData: 30/06/2026 16:53:38 -03:00";
    const r = assinaturasDeOcr({ blocos: [b1, b2, b1], pagina: "" });
    assert.equal(r.length, 1);
    assert.equal(r[0].nome, "EDILENE ALVES DA CRUZ");
  });
});

// Encerrar o OCR no meio de uma leitura travava a fila PARA SEMPRE (o `terminate` do tesseract.js não rejeita o job em
// curso) — e com ela toda leitura seguinte, de qualquer importação. Leituras e encerramento passam pela MESMA fila.
describe("filaSerial — leituras e encerramento do OCR em ordem", () => {
  it("uma tarefa por vez, na ordem pedida: o encerramento espera a leitura em curso", async () => {
    const naFila = filaSerial();
    const log: string[] = [];
    let liberar: () => void = () => {};
    const leitura = naFila(async () => {
      log.push("leitura:início");
      await new Promise<void>((r) => {
        liberar = r;
      });
      log.push("leitura:fim");
      return 1;
    });
    const encerrar = naFila(async () => {
      log.push("encerrar");
    });
    const outra = naFila(async () => {
      log.push("outra");
      return 2;
    });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(log, ["leitura:início"], "o encerramento não passa na frente da leitura em curso");
    liberar();
    assert.equal(await leitura, 1);
    await encerrar;
    assert.equal(await outra, 2);
    assert.deepEqual(log, ["leitura:início", "leitura:fim", "encerrar", "outra"]);
  });

  it("a falha de uma tarefa chega a quem pediu e não trava as seguintes", async () => {
    const naFila = filaSerial();
    const falha = naFila(async () => {
      throw new Error("leitura ruim");
    });
    const depois = naFila(async () => "ok");
    await assert.rejects(falha, /leitura ruim/);
    assert.equal(await depois, "ok");
  });
});
