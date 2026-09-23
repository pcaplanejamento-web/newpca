import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type CapaComparavel,
  compararCapa,
  compararDfd,
  type DfdComparavel,
  herdarTratamentos,
  identidadeReenvio,
  linhasRelatorioReenvio,
  rotuloSituacaoReenvio,
} from "../src/lib/comparar-protocolo.ts";
import type { Assinatura } from "../src/lib/parse-dfd-comum.ts";

describe("identidadeReenvio — só o MESMO protocolo (nº e Id)", () => {
  const g = { numero: "144756/2026", idExterno: "998877" };
  it("mesmo nº e Id: ok (espaços não importam)", () => {
    assert.equal(identidadeReenvio(g, { numero: " 144756/2026 ", idExterno: "998877" }), null);
  });
  it("nº diferente, Id diferente ou capa sem nº: recusa com o motivo", () => {
    assert.match(identidadeReenvio(g, { numero: "144757/2026", idExterno: "998877" }) ?? "", /144757\/2026/);
    assert.match(identidadeReenvio(g, { numero: "144756/2026", idExterno: "111" }) ?? "", /Id/);
    assert.match(identidadeReenvio(g, { numero: null, idExterno: "998877" }) ?? "", /número/);
  });
  it("Id ausente de um dos lados: confere só o nº", () => {
    assert.equal(identidadeReenvio({ numero: "1/2026", idExterno: null }, { numero: "1/2026", idExterno: "55" }), null);
    assert.equal(identidadeReenvio(g, { numero: "144756/2026", idExterno: null }), null);
  });
});

describe("compararCapa", () => {
  const base: CapaComparavel = { data: "2026-05-02", interessado: "FMS", documento: null, assunto: "INCLUSÃO", observacao: "PCA 2027", valorCapa: 1000, localReparticao: null, anoPca: 2027, reparticaoId: 3 };
  it("igual (espaços colapsados) ⇒ sem diferenças", () => {
    assert.deepEqual(compararCapa(base, { ...base, observacao: " PCA   2027 " }), []);
  });
  it("aponta os campos que mudaram, com os valores formatados", () => {
    const d = compararCapa(base, { ...base, valorCapa: 1500.5, assunto: "EXCLUSÃO", reparticaoId: 4 }, (id) => (id === 3 ? "SMS" : "FMS"));
    assert.deepEqual(d.map((x) => x.campo), ["assunto", "valorCapa", "reparticaoId"]);
    assert.equal(d.find((x) => x.campo === "reparticaoId")?.antes, "SMS");
    assert.match(d.find((x) => x.campo === "valorCapa")?.depois ?? "", /1\.500,50/);
  });
});

const dfd = (over: Partial<DfdComparavel> = {}): DfdComparavel => ({
  numero: "531",
  planejamento: "600",
  tipo: "DFD-S — Solução",
  objeto: "Aquisição de material",
  orgaoEntidade: "Prefeitura",
  setorRequisitante: "SMS",
  responsavel: "Ana",
  matricula: "1",
  email: null,
  telefone: null,
  numeroContrato: null,
  numeroAta: null,
  numeroLicitacao: null,
  anoPca: 2027,
  reparticaoId: 3,
  valorTotal: 150,
  secoes: [
    { titulo: "3 - JUSTIFICATIVA", texto: "Necessidade real." },
    { titulo: "6 - PRIORIDADE", texto: "ALTA" },
  ],
  assinaturas: [{ nome: "ANA SOUZA", data: "01/02/2026" }],
  itens: [
    { item: 1, codigo: "100", descricao: "CANETA", unidade: "UN", quantidade: 10, valorUnitario: 5, valorTotal: 50 },
    { item: 2, codigo: "200", descricao: "PAPEL", unidade: "PCT", quantidade: 5, valorUnitario: 20, valorTotal: 100 },
  ],
  ...over,
});

describe("compararDfd — situação e diferenças campo a campo", () => {
  it("sem gravado ⇒ novo; iguais ⇒ igual", () => {
    assert.equal(compararDfd(null, dfd()).situacao, "novo");
    const c = compararDfd(dfd(), dfd({ objeto: "  Aquisição   de material " }));
    assert.equal(c.situacao, "igual");
    assert.equal(c.total, 0);
    assert.equal(rotuloSituacaoReenvio(c), "Igual");
  });
  it("cabeçalho, seção, assinatura e totais", () => {
    const c = compararDfd(
      dfd(),
      dfd({
        tipo: "DFD-R — Renovação",
        valorTotal: 200,
        secoes: [
          { titulo: "3 - JUSTIFICATIVA", texto: "Necessidade real." },
          { titulo: "5 - PRIORIDADE", texto: "MÉDIA" }, // nº da seção mudou: casa pelo TÍTULO
        ],
        assinaturas: [{ nome: "CARLOS LIMA", data: "03/02/2026" }],
      }),
    );
    assert.equal(c.situacao, "alterado");
    assert.deepEqual(c.campos.map((x) => x.campo), ["tipo", "valorTotal"]);
    assert.equal(c.secoes.length, 1);
    assert.equal(c.secoes[0].antes, "ALTA");
    assert.equal(c.secoes[0].depois, "MÉDIA");
    assert.ok(c.assinaturas);
    assert.equal(c.total, 4);
    assert.equal(rotuloSituacaoReenvio(c), "Alterado (4)");
  });
  it("itens: pareados pelo nº; alterado campo a campo, novo e removido", () => {
    const c = compararDfd(
      dfd(),
      dfd({
        itens: [
          { item: 1, codigo: "100", descricao: "CANETA", unidade: "un", quantidade: 12, valorUnitario: 5, valorTotal: 60 },
          { item: 3, codigo: "300", descricao: "CLIPS", unidade: "CX", quantidade: 1, valorUnitario: 9, valorTotal: 9 },
        ],
      }),
    );
    const porTipo = (t: string) => c.itens.filter((x) => x.tipo === t);
    assert.equal(porTipo("alterado").length, 1);
    assert.deepEqual(porTipo("alterado")[0].campos.map((x) => x.campo), ["quantidade", "valorTotal"]); // unidade: caixa não importa
    assert.equal(porTipo("novo")[0].item, 3);
    assert.equal(porTipo("removido")[0].item, 2);
  });
  it("item renumerado casa pelo código + descrição (não vira novo+removido)", () => {
    const c = compararDfd(
      dfd({ itens: [{ item: 7, codigo: "100", descricao: "CANETA", unidade: "UN", quantidade: 10, valorUnitario: 5, valorTotal: 50 }] }),
      dfd({ itens: [{ item: 1, codigo: "100", descricao: "CANETA", unidade: "UN", quantidade: 10, valorUnitario: 5, valorTotal: 50 }] }),
    );
    assert.equal(c.itens.length, 1);
    assert.equal(c.itens[0].tipo, "alterado");
    assert.deepEqual(c.itens[0].campos.map((x) => x.campo), ["item"]);
  });
});

describe("compararDfd — o que o reenvio NÃO pode pular como \"igual\"", () => {
  it("validar/desfazer a assinatura pela equipe e um carimbo re-assinado (código novo) são diferenças", () => {
    const base = { nome: "ANA SOUZA", data: "01/02/2026", fonte: "dropsigner", codigo: "AAAA" };
    const g = dfd({ assinaturas: [base] });
    assert.equal(compararDfd(g, dfd({ assinaturas: [base] })).situacao, "igual");
    const validada = compararDfd(g, dfd({ assinaturas: [{ ...base, validacao: { por: "equipe", responsavel: "ANA SOUZA" } }] }));
    assert.equal(validada.situacao, "alterado");
    assert.match(validada.assinaturas?.depois ?? "", /validada pela equipe \(ANA SOUZA\)/);
    assert.equal(compararDfd(g, dfd({ assinaturas: [{ ...base, codigo: "BBBB" }] })).situacao, "alterado");
  });
  it("item REMOVIDO com a lista renumerada: 1 removido + os seguintes só mudam de nº", () => {
    const it = (item: number, codigo: string, descricao: string) => ({ item, codigo, descricao, unidade: "UN", quantidade: 1, valorUnitario: 1, valorTotal: 1 });
    const c = compararDfd(
      dfd({ itens: [it(1, "10", "A"), it(2, "20", "B"), it(3, "30", "C"), it(4, "40", "D")] }),
      dfd({ itens: [it(1, "10", "A"), it(2, "30", "C"), it(3, "40", "D")] }),
    );
    const porTipo = (t: string) => c.itens.filter((x) => x.tipo === t);
    assert.equal(porTipo("removido").length, 1);
    assert.equal(porTipo("removido")[0].codigo, "20");
    assert.equal(porTipo("novo").length, 0);
    for (const x of porTipo("alterado")) assert.deepEqual(x.campos.map((d) => d.campo), ["item"]);
  });
});

describe("linhasRelatorioReenvio", () => {
  it("capa, novos, alterados (com itens), iguais e removidos (excluir/manter)", () => {
    const alt = compararDfd(dfd(), dfd({ objeto: "Outro objeto" }));
    const linhas = linhasRelatorioReenvio({
      numero: "144756/2026",
      idExterno: "998877",
      capa: [{ campo: "assunto", rotulo: "Assunto", antes: "INCLUSÃO", depois: "EXCLUSÃO" }],
      dfds: [
        { numero: "531", planejamento: "600", comparacao: alt },
        { numero: "700", planejamento: null, comparacao: compararDfd(null, dfd()) },
        { numero: "701", planejamento: null, comparacao: compararDfd(dfd(), dfd()) },
      ],
      removidos: [
        { numero: "800", planejamento: "900", excluir: true },
        { numero: "801", planejamento: null, excluir: false },
      ],
    });
    const texto = linhas.join("\n");
    assert.match(texto, /Reenvio do protocolo 144756\/2026 \(Id 998877\)/);
    assert.match(texto, /Assunto: INCLUSÃO → EXCLUSÃO/);
    assert.match(texto, /Novos \(1\): DFD 700/);
    assert.match(texto, /DFD 531 \(Planej\. 600\) — 1 diferença\(s\)/);
    assert.match(texto, /Sem diferenças \(1\): DFD 701/);
    assert.match(texto, /serão EXCLUÍDOS \(1\): DFD 800 \(Planej\. 900\)/);
    assert.match(texto, /MANTIDOS \(1\): DFD 801/);
  });
  it("nada mudou ⇒ diz que é igual", () => {
    const l = linhasRelatorioReenvio({ numero: "1", idExterno: null, capa: [], dfds: [], removidos: [] });
    assert.match(l.join("\n"), /Nenhuma diferença/);
  });
  it("DFDs ainda não comparados aparecem (e não dá \"Nenhuma diferença\")", () => {
    const l = linhasRelatorioReenvio({ numero: "1", idExterno: null, capa: [], dfds: [], removidos: [], pendentes: [{ numero: "900", planejamento: null }] }).join("\n");
    assert.match(l, /Ainda NÃO comparados \(1\).*DFD 900/);
    assert.doesNotMatch(l, /Nenhuma diferença/);
  });
});

describe("herdarTratamentos — o que o PDF não traz e o gravado já tratou", () => {
  const ass = (over: Partial<Assinatura> = {}): Assinatura => ({ nome: "ANA", eCpf: "", usuario: "", local: "", data: "01/02/2026", ip: "", codigo: "", url: "", fonte: "certificado", ...over });
  const gravado = {
    tipo: "DFD-R — Renovação",
    secoes: [
      { numero: 3, titulo: "JUSTIFICATIVA DA NECESSIDADE", texto: "Motivo tratado." },
      { numero: 6, titulo: "PRIORIDADE DA COMPRA", texto: "ALTA" },
      { numero: 7, titulo: "FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" },
    ],
    numeroContrato: "12/2025",
    numeroAta: null,
    numeroLicitacao: null,
    assinaturas: [ass({ validacao: { por: "equipe" as const, responsavel: "ANA" } })],
  };
  it("herda só o que falta/está fora do padrão (nunca sobrescreve valor válido)", () => {
    const novo = {
      tipo: null,
      secoes: [
        { numero: 3, titulo: "JUSTIFICATIVA DA NECESSIDADE", texto: "Novo motivo do PDF." },
        { numero: 6, titulo: "PRIORIDADE DA COMPRA", texto: "A DEFINIR" },
      ],
      numeroContrato: null,
      numeroAta: null,
      numeroLicitacao: null,
      assinaturas: [ass()],
    };
    const { dfd, herdados } = herdarTratamentos(novo, gravado, 2027);
    assert.equal(dfd.tipo, "DFD-R — Renovação");
    assert.equal(dfd.secoes.find((x) => x.numero === 3)?.texto, "Novo motivo do PDF."); // válido: fica o do PDF
    assert.equal(dfd.secoes.find((x) => x.numero === 6)?.texto, "ALTA");
    assert.equal(dfd.secoes.find((x) => x.titulo.includes("FUNDAMENTA"))?.texto, "Lei 14.133/2021");
    assert.equal(dfd.numeroContrato, "12/2025");
    assert.equal(dfd.assinaturas[0].validacao?.responsavel, "ANA");
    assert.deepEqual(herdados, ["Tipo", "Prioridade", "Fundamentação legal", "Referências de renovação", "Validação da assinatura (equipe)"]);
  });
  it("PDF completo ⇒ nada herdado (mesmo objeto)", () => {
    const novo = { ...gravado, assinaturas: [ass({ nome: "CARLOS" })] };
    const r = herdarTratamentos(novo, gravado, 2027);
    assert.deepEqual(r.herdados, []);
    assert.equal(r.dfd, novo);
  });
  it("em PARTES: a validação da assinatura espera o OCR (tratamentos primeiro, assinaturas depois)", () => {
    const validada = ass({ nome: "JOAO", fonte: "dropsigner", ocr: true, validacao: { por: "equipe" as const, responsavel: "JOAO" } });
    const g = { ...gravado, assinaturas: [validada] };
    // Antes do OCR: o PDF só tem o carimbo (sem nome) — nada de assinatura é herdado ainda.
    const semNome: Assinatura[] = [ass({ nome: "", fonte: "dropsigner" })];
    const antes = herdarTratamentos({ ...gravado, tipo: null, assinaturas: semNome }, g, 2027, { assinaturas: false });
    assert.equal(antes.dfd.tipo, "DFD-R — Renovação");
    assert.equal(antes.dfd.assinaturas, semNome);
    assert.ok(!antes.herdados.includes("Validação da assinatura (equipe)"));
    // Depois do OCR (mesmo assinante/data/formato): a validação da equipe é herdada.
    const depois = herdarTratamentos({ ...antes.dfd, assinaturas: [ass({ nome: "JOAO", fonte: "dropsigner", ocr: true })] }, g, 2027, { tratamentos: false });
    assert.equal(depois.dfd.assinaturas[0].validacao?.responsavel, "JOAO");
    assert.deepEqual(depois.herdados, ["Validação da assinatura (equipe)"]);
  });
  it("assinatura manual (equipe) segue quando o PDF continua sem assinatura nomeada", () => {
    const manual = ass({ nome: "", fonte: "manual" as const, validacao: { por: "equipe" as const, responsavel: "ANA" } });
    const semAssinatura: Assinatura[] = [];
    const r = herdarTratamentos({ ...gravado, assinaturas: semAssinatura }, { ...gravado, assinaturas: [manual] }, 2027);
    assert.equal(r.dfd.assinaturas.length, 1);
    assert.equal(r.dfd.assinaturas[0].fonte, "manual");
  });
});
