import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type DfdPainel,
  DIAS_ALERTA,
  type EstadoPainel,
  MAX_RESPONSAVEIS,
  MAX_UNIDADES,
  painelMesa,
  type ProtocoloPainel,
  SEMANAS_PAINEL,
} from "../src/lib/mesa-dashboard.ts";

// Quinta, 24/09/2026 — 12:00 em Brasília (UTC−3).
const AGORA = new Date("2026-09-24T15:00:00Z");
const P = (id: number, criadoEm: string | null, extra: Partial<ProtocoloPainel> = {}): ProtocoloPainel => ({
  id,
  criadoEm,
  valor: 100,
  responsavelId: null,
  situacaoId: null,
  estado: "regular",
  ...extra,
});
const D = (unidade: string | null, valor: number | null, extra: Partial<DfdPainel> = {}): DfdPainel => ({ unidade, unidadeNome: null, valor, itens: 1, ...extra });
const vazio = { protocolos: [], dfds: [], situacoes: [] };

describe("painelMesa — Dashboard de governança da Mesa (puro)", () => {
  it("sem dados: zeros, sem médias e a série de semanas completa", () => {
    const r = painelMesa(vazio, AGORA);
    assert.equal(r.protocolos, 0);
    assert.equal(r.dfds, 0);
    assert.equal(r.itens, 0);
    assert.equal(r.valor, 0);
    assert.equal(r.diasMedio, null);
    assert.equal(r.diasMaximo, null);
    assert.equal(r.acimaAlerta, 0);
    assert.equal(r.semanas.length, SEMANAS_PAINEL);
    assert.ok(r.semanas.every((s) => s.n === 0 && s.valor === 0));
    assert.equal(r.semanas.at(-1)?.atual, true);
    assert.deepEqual(r.responsaveis, []);
    assert.deepEqual(r.situacoes, []);
    assert.deepEqual(r.unidades, []);
    assert.equal(r.outrosResponsaveis, null);
    assert.equal(r.outrasUnidades, null);
  });

  it("tempo na Mesa em dias de CALENDÁRIO de Brasília (a madrugada UTC ainda é o dia anterior)", () => {
    const r = painelMesa(
      {
        ...vazio,
        protocolos: [
          P(1, "2026-09-24 10:00:00"), // 07:00 de 24/09 → 0 dia
          P(2, "2026-09-24 02:00:00"), // 23:00 de 23/09 → 1 dia
          P(3, "2026-09-17 12:00:00"), // 7 dias → ainda "até 7"
          P(4, "2026-09-16 12:00:00"), // 8 dias
          P(5, "2026-09-20 12:00:00"), // domingo → 4 dias
          P(6, "2026-08-01 12:00:00"), // 54 dias
          P(7, null), // sem data: fora do tempo e da série
          P(8, "2025-01-10 12:00:00"), // 622 dias
        ],
      },
      AGORA,
    );
    assert.equal(r.diasMaximo, 622);
    assert.equal(r.diasMedio, (0 + 1 + 7 + 8 + 4 + 54 + 622) / 7);
    assert.equal(r.acimaAlerta, 2, `acima de ${DIAS_ALERTA} dias: 54 e 622`);
    assert.deepEqual(
      r.faixasIdade.map((f) => f.n),
      [4, 1, 0, 1, 0, 1],
    );
    assert.equal(r.faixasIdade[0].valor, 400);
  });

  it("série semanal: semanas de segunda a domingo, a atual é a última (parcial) e o antigo demais fica de fora", () => {
    const r = painelMesa(
      {
        ...vazio,
        protocolos: [
          P(1, "2026-09-24 10:00:00", { valor: 10 }),
          P(2, "2026-09-21 03:30:00", { valor: 20 }), // segunda 00:30 em Brasília → semana atual
          P(3, "2026-09-21 02:30:00", { valor: 40 }), // domingo 23:30 em Brasília → semana anterior
          P(4, "2026-08-01 12:00:00", { valor: 80 }),
          P(5, "2025-01-10 12:00:00", { valor: 160 }),
        ],
      },
      AGORA,
    );
    const atual = r.semanas.at(-1);
    assert.equal(atual?.inicio, "2026-09-21");
    assert.equal(atual?.rotulo, "21/09");
    assert.deepEqual([atual?.n, atual?.valor], [2, 30]);
    assert.deepEqual([r.semanas.at(-2)?.inicio, r.semanas.at(-2)?.n, r.semanas.at(-2)?.valor], ["2026-09-14", 1, 40]);
    assert.equal(r.semanas.find((s) => s.inicio === "2026-07-27")?.n, 1);
    assert.equal(
      r.semanas.reduce((s, w) => s + w.n, 0),
      4,
      "o de 2025 está fora das 12 semanas",
    );
    assert.equal(r.semanas[0].inicio, "2026-07-06");
  });

  it("data futura (relógio adiantado) conta como hoje", () => {
    const r = painelMesa({ ...vazio, protocolos: [P(1, "2026-09-30 12:00:00")] }, AGORA);
    assert.equal(r.diasMaximo, 0);
    assert.equal(r.semanas.at(-1)?.n, 1);
  });

  it("saúde: quantidade e valor por estado agregado", () => {
    const estados: EstadoPainel[] = ["regular", "regular", "atencao", "erro", "conferindo", "naoConferido"];
    const r = painelMesa({ ...vazio, protocolos: estados.map((estado, i) => P(i + 1, null, { estado, valor: 10 * (i + 1) })) }, AGORA);
    assert.deepEqual(r.saude.regular, { n: 2, valor: 30 });
    assert.deepEqual(r.saude.atencao, { n: 1, valor: 30 });
    assert.deepEqual(r.saude.erro, { n: 1, valor: 40 });
    assert.deepEqual(r.saude.conferindo, { n: 1, valor: 50 });
    assert.deepEqual(r.saude.naoConferido, { n: 1, valor: 60 });
  });

  it("situações: na ORDEM do ADM (inclusive as vazias); desconhecida/sem = 'Sem situação' no fim", () => {
    const r = painelMesa(
      {
        ...vazio,
        situacoes: [30, 10, 20],
        protocolos: [P(1, null, { situacaoId: 10 }), P(2, null, { situacaoId: 10 }), P(3, null, { situacaoId: 99 }), P(4, null)],
      },
      AGORA,
    );
    assert.deepEqual(
      r.situacoes.map((s) => [s.id, s.n]),
      [
        [30, 0],
        [10, 2],
        [20, 0],
        [null, 2],
      ],
    );
    // Sem protocolo sem situação, a linha "Sem situação" não aparece.
    const r2 = painelMesa({ ...vazio, situacoes: [10], protocolos: [P(1, null, { situacaoId: 10 })] }, AGORA);
    assert.deepEqual(
      r2.situacoes.map((s) => s.id),
      [10],
    );
  });

  it("responsáveis: mais carregados primeiro, 'Sem responsável' por último, estados por pessoa", () => {
    const r = painelMesa(
      {
        ...vazio,
        protocolos: [
          P(1, null, { responsavelId: 5, estado: "erro" }),
          P(2, null, { responsavelId: 5, estado: "regular" }),
          P(3, null, { responsavelId: 5, estado: "atencao" }),
          P(4, null, { responsavelId: 2, valor: 50 }),
          P(5, null, { responsavelId: 9, valor: 500 }),
          P(6, null),
          P(7, null, { estado: "conferindo" }),
        ],
      },
      AGORA,
    );
    assert.deepEqual(
      r.responsaveis.map((x) => [x.id, x.n]),
      [
        [5, 3],
        [9, 1],
        [2, 1],
        [null, 2],
      ],
    );
    assert.deepEqual(r.responsaveis[0].porEstado, { regular: 1, atencao: 1, erro: 1, conferindo: 0, naoConferido: 0 });
    assert.equal(r.semResponsavel, 2);
    assert.equal(r.responsaveis.at(-1)?.porEstado.conferindo, 1);
    assert.equal(r.outrosResponsaveis, null);
  });

  it("responsáveis além do limite viram 'Outras N pessoas' (o 'sem' continua à parte)", () => {
    const protocolos = Array.from({ length: MAX_RESPONSAVEIS + 3 }, (_, i) => P(i + 1, null, { responsavelId: i + 1, valor: 1000 - i }));
    const r = painelMesa({ ...vazio, protocolos: [...protocolos, P(99, null)] }, AGORA);
    assert.equal(r.responsaveis.length, MAX_RESPONSAVEIS + 1);
    assert.equal(r.responsaveis.at(-1)?.id, null);
    assert.equal(r.outrosResponsaveis?.pessoas, 3);
    assert.equal(r.outrosResponsaveis?.n, 3);
    assert.equal(r.outrosResponsaveis?.porEstado.regular, 3);
  });

  it("unidades pelos DFDs: maiores valores primeiro, 'sem unidade' e a cauda em 'Outras'", () => {
    const dfds = [
      D("SMS", 300, { unidadeNome: "Secretaria de Saúde", itens: 4 }),
      D("SMS", 200),
      D("SME", 900),
      D(null, 50, { itens: null }),
      D("SMA", Number.NaN),
    ];
    const r = painelMesa({ ...vazio, dfds }, AGORA);
    assert.equal(r.dfds, 5);
    assert.equal(r.itens, 7);
    assert.equal(r.valor, 1450);
    assert.deepEqual(
      r.unidades.map((u) => [u.sigla, u.dfds, u.valor]),
      [
        ["SME", 1, 900],
        ["SMS", 2, 500],
        ["", 1, 50],
        ["SMA", 1, 0],
      ],
    );
    assert.equal(r.unidades[1].nome, "Secretaria de Saúde");
    const muitas = Array.from({ length: MAX_UNIDADES + 2 }, (_, i) => D(`U${i}`, 100 - i));
    const r2 = painelMesa({ ...vazio, dfds: muitas }, AGORA);
    assert.equal(r2.unidades.length, MAX_UNIDADES);
    assert.deepEqual(r2.outrasUnidades, { unidades: 2, dfds: 2, valor: 100 - MAX_UNIDADES + (100 - MAX_UNIDADES - 1) });
  });

  it("valores não numéricos nos protocolos não viram NaN", () => {
    const r = painelMesa({ ...vazio, protocolos: [P(1, null, { valor: Number.NaN }), P(2, null, { valor: 5 })] }, AGORA);
    assert.equal(r.saude.regular.valor, 5);
  });
});
