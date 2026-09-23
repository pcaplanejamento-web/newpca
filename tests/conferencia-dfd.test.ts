import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { regrasPadrao } from "../src/lib/avaliacao-core.ts";
import {
  avaliarLinhaDfd,
  avaliarProtocolo,
  somatorioProcesso,
  type DfdConferivel,
  estadoDeMensagens,
  mensagensDoDfd,
  type RepConferencia,
} from "../src/lib/conferencia-dfd.ts";
import { aplicarMassaDfd, buildPrevisao, conciliacaoCapa, textoSecao } from "../src/lib/dfd-tratamento.ts";
import type { Assinatura } from "../src/lib/parse-dfd-comum.ts";

const assinatura = (over: Partial<Assinatura> = {}): Assinatura => ({
  nome: "MARIA DA SILVA",
  eCpf: "***.123.456-**",
  usuario: "maria",
  local: "",
  data: "10/02/2026 10:00:00",
  ip: "",
  codigo: "ABC123",
  url: "",
  fonte: "certificado",
  ...over,
});

const secOk = [
  { numero: 3, titulo: "JUSTIFICATIVA DA NECESSIDADE", texto: "Atender a demanda." },
  { numero: 5, titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "ANUAL" },
  { numero: 6, titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", texto: "ALTA" },
  { numero: 7, titulo: "FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" },
];

const dfd = (over: Partial<DfdConferivel> = {}): DfdConferivel => ({
  planejamento: "640",
  itens: [{ item: 1, codigo: "1001", descricao: "CANETA", unidade: "UN", quantidade: 2, valorUnitario: 5, valorTotal: 10 }],
  secoes: secOk,
  tipo: "DFD-S · Solução",
  numeroContrato: null,
  numeroAta: null,
  numeroLicitacao: null,
  anoPca: 2026,
  assinaturas: [assinatura()],
  nomeArquivo: "protocolo.pdf",
  orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE",
  ...over,
});

const rep: RepConferencia = {
  id: 3,
  orgaoId: 1,
  responsaveis: {
    padroes: [{ nome: "Maria da Silva", matricula: "1", funcao: "Secretária", nomeacao: { tipo: null, numero: "", link: "" } }],
    temporarios: [],
  },
};

describe("avaliarLinhaDfd — conferência ÚNICA por linha (análise = gravado)", () => {
  it("DFD completo e assinado pelo responsável → regular, validação auto, sem resumo", () => {
    const r = avaliarLinhaDfd(dfd(), rep);
    assert.equal(r.estado, "regular");
    assert.equal(r.validacao, "auto");
    assert.equal(r.resumo, undefined);
    assert.deepEqual(r.mensagens, []);
  });

  it("sem tipo → ERRO apontado ('Sem tipo'); regularizado/editado seguem o ciclo quando não há problema", () => {
    const r = avaliarLinhaDfd(dfd({ tipo: null }), rep);
    assert.equal(r.estado, "erro");
    assert.equal(r.resumo?.rotulo, "Sem tipo");
    assert.equal(avaliarLinhaDfd(dfd(), rep, { auto: true }).estado, "regularizado");
    assert.equal(avaliarLinhaDfd(dfd(), rep, { auto: true, editado: true }).estado, "editado");
  });

  it("DFD-R sem referência → ATENÇÃO (não erro)", () => {
    const r = avaliarLinhaDfd(dfd({ tipo: "DFD-R · Renovação" }), rep);
    assert.equal(r.estado, "atencao");
    assert.equal(r.resumo?.rotulo, "DFD-R sem referência");
  });

  it("sem unidade → erro de unidade e de assinatura (sem responsável)", () => {
    const r = avaliarLinhaDfd(dfd(), null);
    assert.equal(r.estado, "erro");
    assert.ok(r.mensagens.some((m) => m.chave === "dfd.reparticao"));
    assert.ok(r.mensagens.some((m) => m.chave === "dfd.assinatura"));
    assert.equal(r.validacao, null);
  });

  it("o ANO DO PCA não entra na linha (portão do protocolo), mas entra nas mensagens do banner", () => {
    assert.equal(avaliarLinhaDfd(dfd({ anoPca: null }), rep, { anoPca: null }).estado, "regular");
    assert.ok(mensagensDoDfd(dfd({ anoPca: null }), rep, null).some((m) => m.chave === "dfd.anoPca" && m.status === "erro"));
  });

  it("duplicado pendente entra como a 1ª mensagem (erro/atenção conforme o ADM)", () => {
    const e = avaliarLinhaDfd(dfd(), rep, { duplicado: "erro" });
    assert.equal(e.estado, "erro");
    assert.equal(e.resumo?.rotulo, "DFD duplicado");
    assert.equal(avaliarLinhaDfd(dfd(), rep, { duplicado: "atencao" }).estado, "atencao");
  });

  it("órgão não identificado (cadastro de órgãos informado) → atenção na linha, igual ao banner", () => {
    const orgaos = [{ id: 1, sigla: "PMRV", nome: "Prefeitura Municipal de Rio Verde", orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE" }];
    assert.equal(avaliarLinhaDfd(dfd(), rep, { orgaos }).estado, "regular");
    const r = avaliarLinhaDfd(dfd({ orgaoEntidade: "OUTRO ÓRGÃO" }), rep, { orgaos });
    assert.equal(r.estado, "atencao");
    assert.equal(r.resumo?.rotulo, "Órgão não identificado");
  });

  it("INVARIANTE: estado 'erro' ⇔ o painel (sem o ano do PCA) tem alguma mensagem de erro", () => {
    const casos = [dfd(), dfd({ tipo: null }), dfd({ secoes: [] }), dfd({ assinaturas: [] }), dfd({ tipo: "DFD-R" })];
    for (const c of casos) {
      const temErro = mensagensDoDfd(c, rep, 2026).some((m) => m.status === "erro" && m.chave !== "dfd.anoPca");
      assert.equal(avaliarLinhaDfd(c, rep, { anoPca: 2026 }).estado === "erro", temErro);
    }
  });

  it("estadoDeMensagens: a MESMA régua p/ célula, rodapé e painel (erro › atenção › ciclo)", () => {
    assert.equal(estadoDeMensagens([{ status: "acerto" }, { status: "erro" }, { status: "atencao" }]), "erro");
    assert.equal(estadoDeMensagens([{ status: "acerto" }, { status: "atencao" }]), "atencao");
    assert.equal(estadoDeMensagens([{ status: "acerto" }]), "regular");
    assert.equal(estadoDeMensagens([], { auto: true }), "regularizado");
    assert.equal(estadoDeMensagens([], { auto: true, editado: true }), "editado");
  });

  it("respeita o ADM: ponto em 'ignorar' some da linha", () => {
    const regras = { ...regrasPadrao(), pontos: { "dfd.tipo": "ignorar" as const } };
    assert.equal(avaliarLinhaDfd(dfd({ tipo: null }), rep, { regras }).estado, "regular");
  });
});

describe("conciliacaoCapa — valor da capa × somatória dos DFDs", () => {
  it("inativa sem DFDs, com somatória incompleta ou com o ponto em 'ignorar'", () => {
    assert.equal(conciliacaoCapa({ valorCapa: null, somatorio: 0, totalDfds: 0 }).ativa, false);
    assert.equal(conciliacaoCapa({ valorCapa: 10, somatorio: 5, totalDfds: 2, completo: false }).ativa, false);
    const regras = { ...regrasPadrao(), pontos: { "protocolo.valorCapa": "ignorar" as const } };
    assert.equal(conciliacaoCapa({ valorCapa: 10, somatorio: 5, totalDfds: 2 }, regras).divergente, false);
  });

  it("capa nula/zerada → divergente + zerada; bloqueia no padrão; motivo aponta a somatória", () => {
    const c = conciliacaoCapa({ valorCapa: null, somatorio: 97588.2, totalDfds: 15 });
    assert.equal(c.ativa, true);
    assert.equal(c.zerada, true);
    assert.equal(c.divergente, true);
    assert.equal(c.bloqueia, true);
    assert.match(c.motivo ?? "", /ausente\/zerado/);
    assert.match(c.motivo ?? "", /97\.588,20/);
    assert.equal(conciliacaoCapa({ valorCapa: 0, somatorio: 10, totalDfds: 1 }).zerada, true);
  });

  it("capa diferente da somatória (caso real: 52.029 × 97.588,20) → divergente; igual → ok", () => {
    const c = conciliacaoCapa({ valorCapa: 52029, somatorio: 97588.2, totalDfds: 15 });
    assert.equal(c.divergente, true);
    assert.equal(c.zerada, false);
    assert.match(c.motivo ?? "", /52\.029,00/);
    assert.equal(conciliacaoCapa({ valorCapa: 97588.2, somatorio: 97588.2, totalDfds: 15 }).divergente, false);
  });

  it("arredonda a somatória ao centavo (sem falso positivo de ponto flutuante)", () => {
    const c = conciliacaoCapa({ valorCapa: 0.3, somatorio: 0.1 + 0.2, totalDfds: 2 });
    assert.equal(c.divergente, false);
    assert.equal(c.somatorio, 0.3);
  });

  it("'avisa' aponta sem bloquear; o estado do protocolo usa a MESMA régua", () => {
    const regras = { ...regrasPadrao(), pontos: { "protocolo.valorCapa": "intermediario" as const } };
    const c = conciliacaoCapa({ valorCapa: 1, somatorio: 2, totalDfds: 1 }, regras);
    assert.equal(c.divergente, true);
    assert.equal(c.bloqueia, false);
    assert.equal(avaliarProtocolo({ valorCapa: 1, valorTotal: 2, totalDfds: 1 }, [], regras).estado, "atencao");
    assert.equal(avaliarProtocolo({ valorCapa: 2, valorTotal: 2, totalDfds: 1 }, [], regras).estado, "regular");
  });
});

describe("avaliarProtocolo — o protocolo ACUMULA os problemas dos DFDs e itens", () => {
  const msg = (status: "erro" | "atencao" | "acerto", chave: string, texto = chave) => ({ status, chave, texto });
  const dfd = (numero: string, mensagens: ReturnType<typeof msg>[]) => ({ numero, planejamento: `P${numero}`, mensagens });
  it("capa conferida e DFDs sem problema ⇒ regular (sem resumo)", () => {
    const r = avaliarProtocolo({ valorCapa: 100, valorTotal: 100, totalDfds: 1 }, [dfd("1", [msg("acerto", "dfd.tipo")])]);
    assert.equal(r.estado, "regular");
    assert.equal(r.resumo, undefined);
  });
  it("capa divergente (padrão: bloqueia) ⇒ erro; zerada tem rótulo próprio", () => {
    assert.equal(avaliarProtocolo({ valorCapa: 90, valorTotal: 100, totalDfds: 1 }, []).resumo?.rotulo, "Capa ≠ somatória");
    const z = avaliarProtocolo({ valorCapa: null, valorTotal: 100, totalDfds: 1 }, []);
    assert.equal(z.estado, "erro");
    assert.equal(z.resumo?.rotulo, "Capa sem valor");
  });
  it("sem DFDs ⇒ atenção 'Sem DFDs'", () => {
    const r = avaliarProtocolo({ valorCapa: null, valorTotal: 0, totalDfds: 0 }, []);
    assert.equal(r.estado, "atencao");
    assert.deepEqual(r.resumo?.rotulos, ["Sem DFDs"]);
  });
  it("agrupa o MESMO problema de vários DFDs (principal com a contagem) e junta todos no filtro", () => {
    const r = avaliarProtocolo({ valorCapa: 300, valorTotal: 300, totalDfds: 3 }, [
      dfd("531", [msg("erro", "dfd.prioridade"), msg("erro", "item.valorUnitario")]),
      dfd("532", [msg("erro", "dfd.prioridade")]),
      dfd("540", [msg("atencao", "dfd.assinaturaValidar")]),
    ]);
    assert.equal(r.estado, "erro");
    assert.equal(r.resumo?.rotulo, "Sem prioridade (2)");
    assert.deepEqual(r.resumo?.rotulos, ["Sem prioridade", "Item sem valor", "Validar assinatura"]);
    assert.equal(r.resumo?.extraErros, 1);
    assert.equal(r.resumo?.extraAtencoes, 1);
    assert.equal(r.dfdsComErro, 2);
    assert.equal(r.dfdsEmAtencao, 1);
    assert.match(r.resumo?.titulo ?? "", /2 de 3 DFD\(s\) com erro/);
    assert.match(r.resumo?.titulo ?? "", /Sem prioridade — 2 DFDs: 531 \(Planej\. P531\), 532/);
  });
  it("conferência dos DFDs ainda não chegou (null) ⇒ só a capa conta", () => {
    const r = avaliarProtocolo({ valorCapa: 100, valorTotal: 100, totalDfds: 5 }, null);
    assert.equal(r.estado, "regular");
    assert.equal(r.dfdsComErro, 0);
  });
  it("RASTRO: os DFDs sobrescritos por outro protocolo (valor da época) entram na conciliação e não é 'Sem DFDs'", () => {
    // A capa (300) foi emitida com 3 DFDs; 1 (100) foi sobrescrito depois por outro protocolo.
    const conferida = avaliarProtocolo({ valorCapa: 300, valorTotal: 200, totalDfds: 2, sobrescritos: 1, valorSobrescritos: 100 }, []);
    assert.equal(conferida.estado, "regular");
    // Sem contar o rastro, a capa pareceria divergente.
    assert.equal(avaliarProtocolo({ valorCapa: 300, valorTotal: 200, totalDfds: 2 }, []).resumo?.rotulo, "Capa ≠ somatória");
    // Todos os DFDs foram sobrescritos: o processo tem o rastro — não é "Sem DFDs".
    const soRastro = avaliarProtocolo({ valorCapa: 100, valorTotal: 0, totalDfds: 0, sobrescritos: 1, valorSobrescritos: 100 }, []);
    assert.equal(soRastro.estado, "regular");
  });
  it("somatorioProcesso (fonte única da massa 'valor da capa = somatória'): vivos + rastro, ao centavo", () => {
    assert.deepEqual(somatorioProcesso({ valorTotal: 200.004, totalDfds: 2, sobrescritos: 1, valorSobrescritos: 100 }), { somatorio: 300, dfds: 3 });
    assert.deepEqual(somatorioProcesso({ valorTotal: 0, totalDfds: 0 }), { somatorio: 0, dfds: 0 });
  });
});

describe("aplicarMassaDfd + buildPrevisao — edição em massa (fonte única)", () => {
  const base = { tipo: null as string | null, secoes: [{ numero: 3, titulo: "JUSTIFICATIVA", texto: "x" }] };

  it("tipo: aceita o código curto e grava o rótulo canônico; inválido não mexe", () => {
    assert.equal(aplicarMassaDfd(base, { campo: "tipo", valor: "DFD-R" }).tipo, "DFD-R · Renovação");
    assert.equal(aplicarMassaDfd(base, { campo: "tipo", valor: "DFD-S · Solução" }).tipo, "DFD-S · Solução");
    assert.equal(aplicarMassaDfd(base, { campo: "tipo", valor: "XYZ" }), base);
  });

  it("seções tratáveis: cria a seção quando falta e mantém as demais", () => {
    const p = aplicarMassaDfd(base, { campo: "prioridade", valor: "ALTA" });
    assert.equal(textoSecao(p.secoes, "PRIORIDADE"), "ALTA");
    assert.equal(textoSecao(p.secoes, "JUSTIFICATIVA"), "x");
    const v = aplicarMassaDfd(p, { campo: "previsao", valor: buildPrevisao("MARÇO", "2027", false) });
    assert.equal(textoSecao(v.secoes, "PREVISAO DE ENTREGA"), "MARÇO/2027");
    const f = aplicarMassaDfd(v, { campo: "fundamentacao", valor: "Lei 14.133/2021" });
    assert.equal(textoSecao(f.secoes, "FUNDAMENTACAO LEGAL"), "Lei 14.133/2021");
  });

  it("valor vazio e unidade (do host) não mexem", () => {
    assert.equal(aplicarMassaDfd(base, { campo: "fundamentacao", valor: "  " }), base);
    assert.equal(aplicarMassaDfd(base, { campo: "reparticao", reparticaoId: 3 }), base);
  });

  it("buildPrevisao: ANUAL (com/sem ano) OU MÊS/AAAA (exige os dois)", () => {
    assert.equal(buildPrevisao("", "", true), "ANUAL");
    assert.equal(buildPrevisao("", "2027", true), "ANUAL/2027");
    assert.equal(buildPrevisao("MAIO", "2027", false), "MAIO/2027");
    assert.equal(buildPrevisao("MAIO", "", false), "");
  });
});
