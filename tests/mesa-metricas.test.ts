import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DfdPainel, ProtocoloPainel } from "../src/lib/mesa-dashboard.ts";
import {
  type Atividade,
  anosComDados,
  baldesData,
  CHAVE_OUTRAS,
  DADOS_METRICAS,
  type DadoMetricas,
  desempenhoPorPessoa,
  FILTRO_METRICAS_PADRAO,
  type FiltroMetricas,
  type FocoMetricas,
  type MedidaMetricas,
  graficoMetricas,
  type GraficoMetricas,
  MEDIDAS_METRICAS,
  naturezaDoProtocolo,
  noFoco,
  papelDoDado,
  protocolosDaPessoa,
  recorteMetricas,
  resumoMetricas,
  tituloGrafico,
} from "../src/lib/mesa-metricas.ts";
import { intervaloDoPeriodo, type Periodo } from "../src/lib/periodo.ts";

// Hoje = terça-feira 29/09/2026 (Brasília).
const HOJE = "2026-09-29";

let seq = 0;
/** Protocolo da Mesa; `criadoEm` em UTC (como o banco). */
const P = (criadoEm: string | null, extra: Partial<ProtocoloPainel> = {}): ProtocoloPainel => ({
  id: ++seq,
  numero: `P${seq}`,
  assunto: "INCLUSÃO DE DEMANDA NO PCA",
  anoPca: 2027,
  criadoEm,
  responsavelId: null,
  distribuidorId: null,
  situacaoId: null,
  estado: "regular",
  ...extra,
});
const D = (protocoloId: number | null, tipo: string | null, itens: number, valor: number, unidadeId: number | null = 1): DfdPainel => ({
  unidadeId,
  unidade: unidadeId == null ? null : `U${unidadeId}`,
  unidadeNome: unidadeId == null ? null : `Unidade ${unidadeId}`,
  protocoloId,
  tipo,
  itens,
  valor,
});
const F = (f: Partial<FiltroMetricas> = {}): FiltroMetricas => ({ ...FILTRO_METRICAS_PADRAO, ...f });
const MES: Periodo = { preset: "mes" };
const SIT = [
  { id: 20, nome: "Em análise" },
  { id: 10, nome: "Recebido" },
];
/** Σ da origem de uma ou mais barras (protocolos: o valor; eventos: os reenvios/ações). */
const somaOrigem = (g: GraficoMetricas<ProtocoloPainel>, chaves: string[]) => {
  const o = g.origem(chaves);
  return o.tipo === "eventos" ? o.lista.reduce((s, e) => s + e.n, 0) : o.lista.reduce((s, x) => s + x.valor, 0);
};
const valores = (g: GraficoMetricas<ProtocoloPainel>) => Object.fromEntries(g.linhas.map((l) => [l.chave, l.valor]));

// NATY = 1, MARIA = 2, CRIS = 3 (protocola), JHONE = 9 (só executa).
const a = P("2026-09-01 15:00:00", { responsavelId: 1, distribuidorId: 3, situacaoId: 10 });
const b = P("2026-09-02 15:00:00", { responsavelId: 1, distribuidorId: 3, estado: "erro", dfdsErro: 2, dfdsAtencao: 1, situacaoId: 20 });
const c = P("2026-07-01 15:00:00", { responsavelId: 2, distribuidorId: 3, estado: "atencao", situacaoId: 99 });
const d = P("2026-09-20 15:00:00", { estado: "atencao" });
const e = P("2026-09-25 15:00:00", { responsavelId: 2, distribuidorId: 1, assunto: "EXCLUSÃO", anoPca: 2026, estado: "conferindo" });
const f = P("2026-09-26 15:00:00", { distribuidorId: 3 });
const g = P(null, { responsavelId: 1, distribuidorId: 2 }); // sem data
const PROTOS = [a, b, c, d, e, f, g];
const DFDS = [
  D(a.id, "DFD-S", 2, 10, 1),
  D(b.id, "DFD-R", 3, 20, 1),
  D(b.id, "DFD-S", 1, 5, 2),
  D(c.id, "DFD-S", 1, 5, 2),
  D(e.id, "DFD-O", 4, 40, null),
  D(null, "DFD-S", 1, 1, 1), // avulso: fora das métricas
];
const AT: Atividade[] = [
  { protocoloId: b.id, usuarioId: 2, dia: "2026-09-15", tipo: "reenvio", n: 1 },
  { protocoloId: c.id, usuarioId: 2, dia: "2026-07-03", tipo: "reenvio", n: 1 },
  { protocoloId: a.id, usuarioId: 2, dia: "2026-09-20", tipo: "acao", n: 4 }, // Maria nos protocolos da Naty
  { protocoloId: b.id, usuarioId: 9, dia: "2026-09-21", tipo: "acao", n: 2 }, // Jhone só executa
  { protocoloId: b.id, usuarioId: null, dia: "2026-09-21", tipo: "acao", n: 5 }, // ator removido: não conta
  { protocoloId: c.id, usuarioId: 1, dia: "2026-09-22", tipo: "acao", n: 3 }, // Naty nos protocolos da Maria
  { protocoloId: e.id, usuarioId: 1, dia: "2026-09-23", tipo: "acao", n: 1 },
  { protocoloId: c.id, usuarioId: 3, dia: "2026-09-24", tipo: "acao", n: 5 },
];
/** O recorte como o Dashboard monta: o período em dias e o papel pelo Dado. */
const recDe = (ps: ProtocoloPainel[], ds: DfdPainel[], at: Atividade[] | null, filtro: Partial<FiltroMetricas>, foco: FocoMetricas = "todos") => {
  const f = F(filtro);
  return recorteMetricas(ps, ds, at, { intervalo: intervaloDoPeriodo(f.periodo, HOJE), papel: papelDoDado(f.dado), hoje: HOJE, foco });
};
const rec = (filtro: Partial<FiltroMetricas>, foco: FocoMetricas = "todos", atividades: Atividade[] | null = AT) => recDe(PROTOS, DFDS, atividades, filtro, foco);
const grafico = (filtro: Partial<FiltroMetricas>, foco: FocoMetricas = "todos") => {
  const f = F(filtro);
  return graficoMetricas(rec(filtro, foco), f.dado, f.medida, SIT);
};

describe("natureza, período e recorte", () => {
  it("natureza = categoria do assunto + ano do PCA (OUTROS sem categoria)", () => {
    assert.equal(naturezaDoProtocolo("Inclusão de itens no PCA", 2027).rotulo, "INCLUSÃO 2027");
    assert.equal(naturezaDoProtocolo("EXCLUSÃO DE DFD", 2026).rotulo, "EXCLUSÃO 2026");
    assert.equal(naturezaDoProtocolo("ALTERAÇÃO NÃO ONEROSA", null).rotulo, "ALTERAÇÃO NÃO ONEROSA");
    assert.equal(naturezaDoProtocolo("COMUNICAÇÃO INTERNA", 2026).rotulo, "OUTROS 2026");
    assert.equal(naturezaDoProtocolo(null, null).rotulo, "OUTROS");
  });

  it("dia de Brasília (a madrugada UTC é o dia anterior) e data futura = hoje", () => {
    const x = P("2026-09-28 02:00:00");
    const y = P("2026-10-05 12:00:00");
    const r = recDe([x, y], [], null, {});
    assert.equal(r.dia.get(x.id), "2026-09-27");
    assert.equal(r.dia.get(y.id), HOJE);
  });

  it("o período recorta pela protocolação: sem limites = todos (inclusive sem data); com limites, só os datados", () => {
    assert.equal(rec({}).coorte.length, 7);
    assert.deepEqual(
      rec({ periodo: MES }).coorte.map((p) => p.id),
      [a.id, b.id, d.id, e.id, f.id],
    );
    assert.deepEqual(
      rec({ periodo: { preset: "custom", ate: "2026-09-01" } }).coorte.map((p) => p.id),
      [a.id, c.id],
    );
    assert.deepEqual(
      rec({ periodo: { preset: "hoje" } }).coorte.map((p) => p.id),
      [],
    );
    // As correções e ações pela data do EVENTO (o reenvio de julho fica fora de setembro).
    const r = rec({ periodo: MES });
    assert.deepEqual(
      r.reenvios?.map((x) => x.protocoloId),
      [b.id],
    );
    assert.equal(
      r.acoes?.reduce((s, x) => s + x.n, 0),
      15,
    );
  });

  it("um protocolo por id: a cópia repetida conta uma vez (gráfico, resumo e desempenho batem)", () => {
    const x = P("2026-09-10 15:00:00", { responsavelId: 1 });
    const copia = { ...x, responsavelId: 2 };
    const r = recDe([x, copia], [D(x.id, "DFD-S", 1, 7)], [{ protocoloId: x.id, usuarioId: 2, dia: "2026-09-11", tipo: "reenvio", n: 1 }], { periodo: MES });
    const gr = graficoMetricas(r, "responsavel", "protocolos", SIT);
    assert.deepEqual([resumoMetricas(r).protocolos, gr.total, gr.linhas.reduce((s, l) => s + l.valor, 0)], [1, 1, 1]);
    assert.equal(desempenhoPorPessoa(r).reduce((s, l) => s + l.protocolos, 0), 1);
  });

  it("o papel segue o Dado e o foco usa o papel", () => {
    assert.equal(papelDoDado("distribuicao"), "distribuicao");
    assert.equal(papelDoDado("natureza"), "responsavel");
    assert.equal(noFoco(a, 1, "responsavel"), true);
    assert.equal(noFoco(a, 3, "responsavel"), false);
    assert.equal(noFoco(a, 3, "distribuicao"), true);
    assert.equal(noFoco(f, "sem", "distribuicao"), true);
    assert.equal(noFoco(a, "todos", "responsavel"), true);
    assert.deepEqual(
      rec({ dado: "distribuicao" }, 3).base.map((p) => p.id),
      [a.id, b.id, c.id, f.id],
    );
  });

  it("anos do seletor: os do foco + o de hoje, do mais novo ao mais antigo", () => {
    assert.deepEqual(anosComDados(rec({})), [2026]);
    const velho = P("2024-05-10 12:00:00", { responsavelId: 1 });
    const r = recDe([...PROTOS, velho], DFDS, AT, {}, 1);
    assert.deepEqual(anosComDados(r), [2026, 2024]);
  });
});

describe("gráfico único: Dado × Medida", () => {
  it("responsável: as barras pelo valor, 'Sem responsável' por último; o valor zero some", () => {
    const pr = grafico({ periodo: MES });
    assert.deepEqual(
      pr.linhas.map((l) => [l.chave, l.valor, l.pessoaId, !!l.apagada]),
      [
        ["1", 2, 1, false],
        ["2", 1, 2, false],
        ["sem", 2, null, true],
      ],
    );
    assert.equal(pr.total, 5);
    assert.deepEqual(
      grafico({ periodo: MES, medida: "valor" }).linhas.map((l) => [l.chave, l.valor]),
      [
        ["2", 40],
        ["1", 35],
      ],
    );
  });

  it("tipo de DFD e unidade: o protocolo cai em cada grupo dele; DFDs/itens/valor se dividem; o total é distinto", () => {
    const tipo = grafico({ periodo: MES, dado: "tipo" });
    assert.deepEqual(
      tipo.linhas.map((l) => [l.chave, l.valor]),
      [
        ["DFD-S", 2],
        ["DFD-R", 1],
        ["DFD-O", 1],
        ["DFD-E", 0],
        ["sem-dfds", 2],
      ],
    );
    assert.deepEqual([tipo.total, tipo.repete], [5, true]);
    const tipoValor = grafico({ periodo: MES, dado: "tipo", medida: "valor" });
    assert.deepEqual(valores(tipoValor), { "DFD-S": 15, "DFD-R": 20, "DFD-O": 40, "DFD-E": 0 });
    assert.deepEqual([tipoValor.total, tipoValor.repete], [75, false]);
    const unidade = grafico({ periodo: MES, dado: "unidade" });
    assert.deepEqual(
      unidade.linhas.map((l) => [l.chave, l.rotulo, l.valor]),
      [
        ["1", "U1", 2],
        ["2", "U2", 1],
        ["sem-unidade", "Sem unidade", 1],
        ["sem-dfds", "Sem DFDs", 2],
      ],
    );
    assert.equal(unidade.linhas[0].titulo, "U1 — Unidade 1");
    assert.deepEqual([unidade.total, unidade.repete], [5, true]);
  });

  it("natureza, estado (os três sempre; conferindo quando há) e situação (na ordem do ADM; a desconhecida = sem)", () => {
    assert.deepEqual(valores(grafico({ periodo: MES, dado: "natureza" })), { "INCLUSÃO 2027": 4, "EXCLUSÃO 2026": 1 });
    assert.deepEqual(
      grafico({ periodo: MES, dado: "estado" }).linhas.map((l) => [l.chave, l.valor]),
      [
        ["regular", 2],
        ["atencao", 1],
        ["erro", 1],
        ["conferindo", 1],
      ],
    );
    assert.deepEqual(
      grafico({ periodo: { preset: "hoje" }, dado: "estado" }).linhas.map((l) => [l.chave, l.valor]),
      [
        ["regular", 0],
        ["atencao", 0],
        ["erro", 0],
      ],
    );
    assert.deepEqual(
      grafico({ dado: "situacao" }).linhas.map((l) => [l.chave, l.rotulo, l.valor, !!l.apagada]),
      [
        ["20", "Em análise", 1, false],
        ["10", "Recebido", 1, false],
        ["sem", "Sem situação", 5, true],
      ],
    );
  });

  it("tempo na Mesa: as faixas todas e, por último, 'Sem data'", () => {
    const t = grafico({ dado: "tempo" });
    assert.deepEqual(
      t.linhas.map((l) => l.valor),
      [2, 1, 2, 0, 1, 0, 1], // e,f · d · a,b · — · c (90 dias) · — · g
    );
    assert.deepEqual([t.linhas.at(-1)?.chave, t.linhas.at(-1)?.apagada, t.fora, t.total], ["sem-data", true, 0, 7]);
  });

  it("correções pelo protocolo da pessoa; ações por QUEM FEZ (nunca o ator removido)", () => {
    const cor = grafico({ periodo: MES, medida: "correcoes" });
    assert.deepEqual(valores(cor), { "1": 1 });
    const o = cor.origem(["1"]);
    assert.equal(o.tipo, "eventos");
    assert.deepEqual(o.tipo === "eventos" ? o.lista.map((x) => [x.protocolo.id, x.dia, x.usuarioId, x.n]) : [], [[b.id, "2026-09-15", 2, 1]]);
    const acoes = grafico({ periodo: MES, medida: "acoes" });
    assert.deepEqual(
      acoes.linhas.map((l) => [l.chave, l.valor]),
      [
        ["3", 5],
        ["1", 4],
        ["2", 4],
        ["9", 2],
      ],
    );
    assert.equal(acoes.total, 15);
    // Em "Quem protocolou" as ações seguem sendo de quem fez; nos demais Dados, pelo protocolo em que foram feitas.
    assert.deepEqual(valores(grafico({ periodo: MES, medida: "acoes", dado: "distribuicao" })), valores(acoes));
    assert.deepEqual(valores(grafico({ periodo: MES, medida: "acoes", dado: "natureza" })), { "INCLUSÃO 2027": 14, "EXCLUSÃO 2026": 1 });
  });

  it("data: os dias do mês escolhido (o de hoje é o atual); sem limites, do 1º dia com dado até hoje", () => {
    const mes = grafico({ periodo: MES, dado: "data" });
    assert.equal(mes.granularidade, "dia");
    assert.equal(mes.linhas.length, 30);
    assert.deepEqual(
      mes.linhas.filter((l) => l.valor > 0).map((l) => l.chave),
      ["2026-09-01", "2026-09-02", "2026-09-20", "2026-09-25", "2026-09-26"],
    );
    assert.deepEqual(
      mes.linhas.filter((l) => l.atual).map((l) => l.chave),
      [HOJE],
    );
    const tudo = grafico({ dado: "data" });
    assert.equal(tudo.granularidade, "semana"); // 01/07 → 29/09 = 91 dias
    assert.equal(tudo.linhas[0].chave, "2026-07-01");
    assert.equal(tudo.linhas.at(-1)?.chave, "2026-09-27");
    assert.equal(tudo.fora, 1);
    assert.equal(
      tudo.linhas.reduce((s, l) => s + l.valor, 0),
      6,
    );
    // Correções pela data do reenvio (o 1º balde começa no 1º reenvio).
    assert.deepEqual(
      grafico({ dado: "data", medida: "correcoes" })
        .linhas.filter((l) => l.valor > 0)
        .map((l) => l.chave),
      ["2026-07-03", "2026-09-13"],
    );
    // Sem nenhum dado e sem limites: nenhum balde; com o início no futuro, um balde só.
    assert.deepEqual(graficoMetricas(recDe([], [], [], { dado: "data" }), "data", "protocolos", SIT).linhas, []);
    assert.equal(graficoMetricas(recDe([], [], [], { periodo: { preset: "custom", de: "2026-12-01" } }), "data", "protocolos", SIT).linhas.length, 1);
  });

  it("data: período de mais de 3 anos vai só do 1º ao último dia com dado — um ano digitado errado não vira mil colunas", () => {
    const tudo = grafico({ dado: "data" });
    const longe = grafico({ periodo: { preset: "custom", de: "1026-01-01" }, dado: "data" });
    assert.equal(longe.granularidade, "semana"); // 01/07 → hoje, não 1.001 anos
    assert.deepEqual([longe.linhas[0].chave, longe.linhas.at(-1)?.chave], ["2026-07-01", "2026-09-27"]);
    // Nada some ao cortar as pontas vazias: as mesmas barras do período sem limites (o sem data fica fora em ambos).
    assert.deepEqual(valores(longe), valores(tudo));
    const futuro = grafico({ periodo: { preset: "custom", de: "2026-01-01", ate: "2199-12-31" }, dado: "data", medida: "valor" });
    assert.equal(futuro.granularidade, "semana"); // corta em hoje (o último dia com dado vem antes)
    assert.equal(futuro.linhas.at(-1)?.chave, "2026-09-27");
    assert.equal(somaOrigem(futuro, futuro.linhas.map((l) => l.chave)), futuro.total);
    // Até 36 meses, o período escolhido inteiro (os meses sem dado, zerados).
    const ano = grafico({ periodo: { ano: 2026 }, dado: "data" });
    assert.deepEqual([ano.granularidade, ano.linhas.length], ["mes", 12]);
    // Período longo sem nenhum dia com dado: nenhuma coluna.
    assert.deepEqual(graficoMetricas(recDe([], [], [], { periodo: { preset: "custom", de: "1026-01-01", ate: "2199-12-31" } }), "data", "protocolos", SIT).linhas, []);
  });

  it("Σ da origem = a barra (e o total) em TODO Dado × Medida, período e foco", () => {
    const periodos: Periodo[] = [{ preset: "todo" }, MES, { ano: 2026 }, { preset: "custom", de: "2026-07-01", ate: "2026-09-02" }];
    for (const { value: dado } of DADOS_METRICAS)
      for (const { value: medida } of MEDIDAS_METRICAS)
        for (const periodo of periodos)
          for (const foco of ["todos", 1, 3, "sem"] as FocoMetricas[]) {
            const gr = grafico({ dado, medida, periodo }, foco);
            const ctx = `${dado}/${medida}/${JSON.stringify(periodo)}/${foco}`;
            for (const l of gr.linhas) assert.equal(somaOrigem(gr, [l.chave]), l.valor, `${ctx}/${l.chave}`);
            assert.equal(
              somaOrigem(
                gr,
                gr.linhas.map((l) => l.chave),
              ),
              gr.total,
              ctx,
            );
          }
  });

  it("o total é o MESMO em todo Dado (a Data soma o que ficou fora) e bate com o resumo", () => {
    for (const { value: medida } of MEDIDAS_METRICAS)
      for (const periodo of [{ preset: "todo" }, MES, { preset: "custom", ate: "2026-09-02" }] as Periodo[])
        for (const foco of ["todos", 1, 3] as FocoMetricas[]) {
          const base = grafico({ medida, periodo }, foco).total;
          for (const { value: dado } of DADOS_METRICAS) {
            if (dado === "distribuicao" && medida !== "acoes") continue; // outro papel = outro foco
            const gr = grafico({ dado, medida, periodo }, foco);
            assert.equal(gr.total + gr.fora, base, `${dado}/${medida}/${JSON.stringify(periodo)}/${foco}`);
          }
          const res = resumoMetricas(rec({ medida, periodo }, foco));
          const doResumo: Record<MedidaMetricas, number | null> = {
            protocolos: res.protocolos,
            dfds: res.dfds,
            itens: res.itens,
            valor: res.valor,
            correcoes: res.correcoes,
            acoes: res.acoes,
          };
          assert.equal(doResumo[medida], base, `resumo/${medida}/${foco}`);
        }
  });

  it("pessoas e unidades além de 10 viram 'Outras N' — o protocolo em duas unidades da cauda conta UMA vez", () => {
    const ps: ProtocoloPainel[] = [];
    const ds: DfdPainel[] = [];
    for (let u = 1; u <= 10; u++)
      for (let k = 0; k < 3; k++) {
        const p = P("2026-09-10 12:00:00", { responsavelId: u });
        ps.push(p);
        ds.push(D(p.id, "DFD-S", 1, 100, u));
      }
    const p11 = P("2026-09-10 12:00:00", { responsavelId: 11 });
    const p12 = P("2026-09-10 12:00:00", { responsavelId: 12 });
    const q = P("2026-09-10 12:00:00", { responsavelId: 12 });
    ps.push(p11, p12, q);
    ds.push(D(p11.id, "DFD-S", 1, 1, 11), D(p12.id, "DFD-S", 1, 1, 12), D(q.id, "DFD-S", 1, 1, 11), D(q.id, "DFD-R", 1, 1, 12));
    const un = graficoMetricas(recDe(ps, ds, [], { dado: "unidade" }), "unidade", "protocolos", SIT);
    assert.equal(un.linhas.length, 11);
    const outras = un.linhas.at(-1);
    assert.deepEqual([outras?.chave, outras?.rotulo, outras?.valor, outras?.apagada], [CHAVE_OUTRAS, "Outras 2 unidades", 3, true]);
    assert.equal(somaOrigem(un, [CHAVE_OUTRAS]), 3);
    assert.equal(un.total, 33);
    const pessoas = graficoMetricas(recDe(ps, ds, [], {}), "responsavel", "protocolos", SIT);
    assert.equal(pessoas.linhas.at(-1)?.rotulo, "Outras 2 pessoas");
    assert.equal(pessoas.linhas.at(-1)?.valor, 3);
  });

  it("título", () => {
    assert.equal(tituloGrafico("responsavel", "protocolos", null), "Protocolos por responsável");
    assert.equal(tituloGrafico("distribuicao", "acoes", null), "Ações por quem executou");
    assert.equal(tituloGrafico("data", "valor", "mes"), "Valor por mês");
    assert.equal(tituloGrafico("tipo", "correcoes", null), "Correções por tipo de DFD");
  });
});

describe("baldes do Dado Data", () => {
  it("até 7 dias: o dia da semana; até 31, o número do dia", () => {
    const s = baldesData("2026-09-27", "2026-10-03", HOJE);
    assert.equal(s.granularidade, "dia");
    assert.deepEqual(
      s.baldes.map((b) => b.rotulo),
      ["dom 27", "seg 28", "ter 29", "qua 30", "qui 01", "sex 02", "sáb 03"],
    );
    assert.equal(s.baldes[2].titulo, "Ter, 29/09/2026");
    assert.equal(s.chaveDoDia("2026-10-04"), null);
    assert.equal(baldesData("2026-09-01", "2026-09-30", HOJE).baldes[8].rotulo, "9");
  });

  it("semanas de domingo a sábado, cortadas nas pontas (inclusive a que vira o ano)", () => {
    const s = baldesData("2026-08-01", "2026-09-30", HOJE);
    assert.equal(s.granularidade, "semana");
    assert.equal(s.baldes.length, 10);
    assert.deepEqual([s.baldes[0].de, s.baldes[0].ate], ["2026-08-01", "2026-08-01"]);
    assert.deepEqual([s.baldes[1].de, s.baldes[1].ate], ["2026-08-02", "2026-08-08"]);
    assert.deepEqual([s.baldes.at(-1)?.de, s.baldes.at(-1)?.ate, s.baldes.at(-1)?.atual], ["2026-09-27", "2026-09-30", true]);
    assert.equal(s.chaveDoDia("2026-08-05"), "2026-08-02");
    assert.equal(s.chaveDoDia("2026-08-01"), "2026-08-01");
    const virada = baldesData("2026-12-01", "2027-02-15", HOJE);
    const b = virada.baldes.find((x) => x.de === "2026-12-27");
    assert.equal(b?.titulo, "Semana de 27/12/2026 a 02/01/2027");
    assert.equal(virada.chaveDoDia("2027-01-01"), "2026-12-27");
  });

  it("meses (o ano no rótulo quando vira o ano) e anos acima de 36 meses", () => {
    const ano = baldesData("2026-01-01", "2026-12-31", HOJE);
    assert.equal(ano.granularidade, "mes");
    assert.deepEqual([ano.baldes.length, ano.baldes[0].rotulo, ano.baldes[8].titulo, ano.baldes[8].atual], [12, "jan", "Setembro de 2026", true]);
    assert.equal(ano.chaveDoDia("2026-02-14"), "2026-02");
    const doze = baldesData("2025-10-01", "2026-09-29", HOJE);
    assert.equal(doze.baldes[0].rotulo, "out/25");
    const anos = baldesData("2020-03-10", HOJE, HOJE);
    assert.equal(anos.granularidade, "ano");
    assert.deepEqual(
      anos.baldes.map((b) => b.chave),
      ["2020", "2021", "2022", "2023", "2024", "2025", "2026"],
    );
    assert.deepEqual([anos.baldes[0].de, anos.baldes.at(-1)?.ate], ["2020-03-10", HOJE]);
  });
});

describe("desempenho por pessoa (governança)", () => {
  it("coorte do mês, estados, DFDs com erro, tempo, correções e ações de quem fez", () => {
    const l = Object.fromEntries(desempenhoPorPessoa(rec({ periodo: MES })).map((x) => [x.chave, x]));
    assert.deepEqual([l["1"].protocolos, l["1"].itens, l["1"].conferidos, l["1"].regulares, l["1"].erro], [2, 6, 2, 1, 1]);
    assert.deepEqual([l["1"].dfdsErro, l["1"].dfdsAtencao, l["1"].acimaAlerta], [2, 1, 0]);
    assert.equal(l["1"].diasMedio, (28 + 27) / 2);
    assert.equal(l["1"].correcoes, 1);
    assert.equal(l["1"].acoes, 4);
    assert.deepEqual([l["2"].protocolos, l["2"].conferidos, l["2"].acoes], [1, 0, 4]);
    assert.deepEqual([l["9"].protocolos, l["9"].acoes], [0, 2]);
    assert.equal(l.sem.protocolos, 2);
    assert.equal(desempenhoPorPessoa(rec({ periodo: MES })).at(-1)?.chave, "sem");
    assert.deepEqual(
      protocolosDaPessoa(rec({ periodo: MES }), "1").map((o) => o.protocolo.id),
      [a.id, b.id],
    );
    // O valor da origem da linha é sempre o R$ dos DFDs (a soma = a coluna Valor).
    assert.deepEqual(
      protocolosDaPessoa(rec({ periodo: MES }), "1").map((o) => o.valor),
      [10, 25],
    );
  });

  it("todo o período: o antigo passa do alerta; sem histórico = null", () => {
    const l = Object.fromEntries(desempenhoPorPessoa(rec({})).map((x) => [x.chave, x]));
    assert.deepEqual([l["2"].protocolos, l["2"].acimaAlerta, l["2"].correcoes], [2, 1, 1]);
    assert.equal(l["1"].protocolos, 3); // a, b e o sem data
    assert.ok(desempenhoPorPessoa(rec({}, "todos", null)).every((x) => x.correcoes === null && x.acoes === null));
  });

  it("quem protocolou: a correção vai para quem protocolou", () => {
    const l = Object.fromEntries(desempenhoPorPessoa(rec({ dado: "distribuicao" })).map((x) => [x.chave, x]));
    assert.deepEqual([l["3"].protocolos, l["3"].correcoes], [4, 2]);
  });

  it("resumo do recorte = a soma das linhas", () => {
    assert.deepEqual(resumoMetricas(rec({ periodo: MES })), { protocolos: 5, dfds: 4, itens: 10, valor: 75, correcoes: 1, corrigidos: 1, acoes: 15 });
    assert.deepEqual(resumoMetricas(rec({ periodo: MES }, "todos", null)).correcoes, null);
  });
});

describe("foco numa pessoa = a linha da pessoa na visão da equipe", () => {
  const PERIODOS: Periodo[] = [{ preset: "todo" }, MES, { ano: 2026 }, { preset: "hoje" }, { preset: "custom", de: "2026-09-20" }];
  it("o gráfico de pessoa, o desempenho e o resumo no foco = a linha da equipe (Responsável e Quem protocolou)", () => {
    for (const dado of ["responsavel", "distribuicao"] as DadoMetricas[])
      for (const periodo of PERIODOS)
        for (const { value: medida } of MEDIDAS_METRICAS) {
          const filtro = { dado, periodo, medida };
          const equipe = grafico(filtro);
          const desempenho = desempenhoPorPessoa(rec(filtro));
          for (const x of [1, 2, 3, 9]) {
            const ctx = `${dado}/${JSON.stringify(periodo)}/${medida}/${x}`;
            const linha = equipe.linhas.find((l) => l.chave === String(x));
            assert.deepEqual(grafico(filtro, x).linhas, linha ? [linha] : [], ctx);
            const d = desempenho.find((l) => l.pessoaId === x);
            assert.deepEqual(desempenhoPorPessoa(rec(filtro, x)), d ? [d] : [], ctx);
            const res = resumoMetricas(rec(filtro, x));
            assert.deepEqual(
              [res.protocolos, res.dfds, res.itens, res.valor, res.correcoes, res.acoes],
              [d?.protocolos ?? 0, d?.dfds ?? 0, d?.itens ?? 0, d?.valor ?? 0, d?.correcoes ?? 0, d?.acoes ?? 0],
              ctx,
            );
          }
          // Na equipe, o resumo = a soma das linhas (a MESMA régua).
          const res = resumoMetricas(rec(filtro));
          const soma = (k: "protocolos" | "dfds" | "itens" | "valor" | "correcoes" | "acoes") => desempenho.reduce((s, l) => s + (l[k] ?? 0), 0);
          assert.deepEqual(
            [res.protocolos, res.dfds, res.itens, res.valor, res.correcoes, res.acoes],
            [soma("protocolos"), soma("dfds"), soma("itens"), soma("valor"), soma("correcoes"), soma("acoes")],
          );
        }
  });

  it("no foco, as ações da pessoa contam em toda a Mesa — em qualquer Dado", () => {
    assert.deepEqual(valores(grafico({ periodo: MES, medida: "acoes", dado: "natureza" }, 1)), { "INCLUSÃO 2027": 3, "EXCLUSÃO 2026": 1 });
    assert.deepEqual(valores(grafico({ periodo: MES, medida: "acoes", dado: "distribuicao" }, 3)), { "3": 5 });
  });

  it("foco 'sem': pelo Responsável não há de quem contar ações; por Quem protocolou, só de quem tem linha", () => {
    const r = rec({ periodo: MES }, "sem");
    assert.equal(r.semAtores, true);
    assert.equal(resumoMetricas(r).acoes, null);
    assert.deepEqual(grafico({ periodo: MES, medida: "acoes" }, "sem").linhas, []);
    assert.deepEqual(
      desempenhoPorPessoa(r).map((l) => [l.chave, l.protocolos]),
      [["sem", 2]],
    );
    const rd = rec({ periodo: MES, dado: "distribuicao" }, "sem");
    assert.deepEqual(
      desempenhoPorPessoa(rd).map((l) => [l.chave, l.protocolos, l.acoes]),
      [
        ["3", 1, 5],
        ["sem", 1, 0],
      ],
    );
    assert.equal(resumoMetricas(rd).acoes, 5);
  });
});
