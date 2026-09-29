import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type DfdPainel,
  DIAS_ALERTA,
  type EstadoPainel,
  painelMesa,
  type ProtocoloPainel,
  ROTULO_ESTADO_PAINEL,
  SEMANAS_PAINEL,
} from "../src/lib/mesa-dashboard.ts";

// Quinta, 24/09/2026 — 12:00 em Brasília (UTC−3). A semana vai de domingo 20/09 a sábado 26/09.
const AGORA = new Date("2026-09-24T15:00:00Z");
const P = (id: number, criadoEm: string | null, extra: Partial<ProtocoloPainel> = {}): ProtocoloPainel => ({
  id,
  criadoEm,
  responsavelId: 1,
  situacaoId: null,
  estado: "regular",
  ...extra,
});
const D = (valor: number | null, itens: number | null = 1): DfdPainel => ({ unidadeId: 1, unidade: "SMS", unidadeNome: null, valor, itens });
const vazio = { protocolos: [], dfds: [] };

describe("painelMesa — os KPIs da Mesa (puro)", () => {
  it("sem dados: zeros, sem média e a linha das semanas zerada", () => {
    const r = painelMesa(vazio, AGORA);
    assert.deepEqual([r.protocolos, r.dfds, r.itens, r.valor, r.semResponsavel, r.acimaAlerta], [0, 0, 0, 0, 0, 0]);
    assert.equal(r.diasMedio, null);
    assert.deepEqual(r.semanas, Array.from({ length: SEMANAS_PAINEL }, () => 0));
  });

  it("tempo na Mesa em dias de CALENDÁRIO de Brasília (a madrugada UTC ainda é o dia anterior) e o alerta", () => {
    const r = painelMesa(
      {
        ...vazio,
        protocolos: [
          P(1, "2026-09-24 10:00:00"), // 07:00 de 24/09 → 0 dia
          P(2, "2026-09-24 02:00:00"), // 23:00 de 23/09 → 1 dia
          P(3, "2026-08-01 12:00:00"), // 54 dias
          P(4, null), // sem data: fora do tempo e da linha semanal
          P(5, "2025-01-10 12:00:00"), // 622 dias
        ],
      },
      AGORA,
    );
    assert.equal(r.diasMedio, (0 + 1 + 54 + 622) / 4);
    assert.equal(r.acimaAlerta, 2, `acima de ${DIAS_ALERTA} dias: 54 e 622`);
  });

  it("semanas de domingo a sábado: a atual é a última (parcial) e o antigo demais fica de fora", () => {
    const r = painelMesa(
      {
        ...vazio,
        protocolos: [
          P(1, "2026-09-24 10:00:00"),
          P(2, "2026-09-20 03:30:00"), // domingo 00:30 em Brasília → semana atual
          P(3, "2026-09-20 02:30:00"), // sábado 23:30 em Brasília → semana anterior
          P(4, "2026-08-10 12:00:00"), // semana de 09/08 → a mais antiga das 7
          P(5, "2026-08-01 12:00:00"), // semana de 26/07 → fora
        ],
      },
      AGORA,
    );
    assert.deepEqual(r.semanas, [1, 0, 0, 0, 0, 1, 2]);
  });

  it("data futura (relógio adiantado) conta como hoje", () => {
    const r = painelMesa({ ...vazio, protocolos: [P(1, "2026-09-30 12:00:00")] }, AGORA);
    assert.deepEqual([r.diasMedio, r.semanas.at(-1)], [0, 1]);
  });

  it("saúde por estado agregado, sem responsável e os totais dos DFDs (não numérico = 0)", () => {
    const estados: EstadoPainel[] = ["regular", "regular", "atencao", "erro", "conferindo", "naoConferido"];
    const r = painelMesa({ protocolos: estados.map((estado, i) => P(i + 1, null, { estado, responsavelId: i % 2 ? null : 1 })), dfds: [D(10, 2), D(Number.NaN, null), D(5)] }, AGORA);
    assert.deepEqual(r.saude, { regular: 2, atencao: 1, erro: 1, conferindo: 1, naoConferido: 1 });
    assert.deepEqual([r.semResponsavel, r.dfds, r.itens, r.valor], [3, 3, 3, 15]);
    assert.equal(ROTULO_ESTADO_PAINEL.conferindo, "Conferindo…");
  });
});
