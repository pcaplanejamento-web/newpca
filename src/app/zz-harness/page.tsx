"use client";

import { useMemo } from "react";
import { DashboardExecucao } from "@/components/DashboardExecucao";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { montarBase, type PacoteExec } from "@/lib/execucao-dash-core";

// HARNESS TEMPORÁRIO (não vai ao repositório): o dashboard com dados sintéticos no volume real.
function gerar(): PacoteExec {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const dic = {
    unidade: ["SEMED", "SEMUS", "SEFAZ", "SAUDE — PMRV", "SAUDE — FMS", "GCM", "PROCON", "FMS"],
    orgaoGestor: ["PREFEITURA MUNICIPAL DE RIO VERDE", "FUNDO MUNICIPAL DE SAÚDE", "FUNDO MUNICIPAL DE EDUCAÇÃO"],
    unidadeOrcamentaria: ["SECRETARIA MUNICIPAL DE EDUCAÇÃO", "FUNDEB", "SEC. MUNIC. DE AÇÃO URBANA E SERVICOS PÚBLICOS", "SECRETARIA DA FAZENDA"],
    funcao: ["12 - Educação", "10 - Saúde", "04 - Administração"],
    subfuncao: ["361 - Ensino Fundamental", "301 - Atenção Básica", "122 - Administração Geral"],
    programa: ["0001 - Gestão", "0002 - Educação de Qualidade", "0003 - Saúde"],
    acao: ["MANTER O PROGRAMA DE ASSISTÊNCIA HOSPITALAR", "MANTER AS ATIVIDADES DO ENSINO FUNDAMENTAL", "CIDADE LIMPA", "MANTER TRANSPORTE ESCOLAR", "GESTÃO DA GUARDA MUNICIPAL"],
    elemento: ["3.3.90.30 - Material de Consumo", "3.3.90.39 - Outros Serviços de Terceiros PJ", "3.1.90.11 - Vencimentos", "4.4.90.52 - Equipamentos"],
    subelemento: ["01", "02", "03"],
    fonte: ["1.500.000 - Recursos não vinculados", "1.540.000 - FUNDEB", "1.600.000 - SUS"],
    modalidade: ["Pregão", "Dispensa", "Inexigibilidade"],
    licitacao: ["12/2025", "33/2025", "7/2026"],
    fornecedor: Array.from({ length: 900 }, (_, i) => `FORNECEDOR ${i + 1} LTDA`),
  } as const;
  const DIM = Object.keys(dic);
  const dicOut = Object.fromEntries(DIM.map((d) => [d, (dic as Record<string, readonly string[]>)[d].map((v, i) => [i, v])]));
  const d0 = Date.UTC(2000, 0, 1);
  const dia = (y: number, doy: number) => Math.round((Date.UTC(y, 0, 1) - d0) / 86400000) + doy;
  const emp: (number | string | null)[][] = [];
  const liq: (number | null)[][] = [];
  const pag: (number | null)[][] = [];
  for (let i = 0; i < 20000; i++) {
    const ano = r() < 0.55 ? 2025 : 2026;
    const doy = Math.floor(r() * (ano === 2026 ? 297 : 365));
    const v = Math.round((r() ** 3) * 2_000_000 * 10000);
    const an = r() < 0.15 ? Math.round(v * r() * 0.5) : 0;
    const dims = DIM.map((d) => Math.floor(r() * (dic as Record<string, readonly string[]>)[d].length));
    emp.push([i + 1, String(100000 + i), 1, 1 + (i % 2), dia(ano, doy), ...dims, v, an, 0, 0, 0]);
    let resto = v - an;
    let dd = doy;
    for (let k = 0; k < 3 && resto > 0; k++) {
      dd += Math.floor(r() * 40);
      if (dd > (ano === 2026 ? 297 : 364)) break;
      const lv = Math.round(resto * (0.3 + r() * 0.7));
      resto -= lv;
      liq.push([i, null, dia(ano, dd), lv, 0, 1, 0]);
      if (r() < 0.8) pag.push([i, null, dia(ano, Math.min(dd + Math.floor(r() * 15), ano === 2026 ? 297 : 364)), lv, Math.round(lv * 0.08), Math.round(lv * 0.92), r() < 0.02 ? lv : 0, 1, 0]);
    }
  }
  for (let k = 0; k < 400; k++) liq.push([-1, 2, dia(2025, Math.floor(r() * 300)), Math.round(r() * 50000 * 10000), 0, 1, 0]);
  return {
    v: "h",
    anos: [2026, 2025],
    disponiveis: [2026, 2025, 2024],
    fontes: { liquidacoes: true, pagamentos: true },
    meta: [
      { tipo: "empenhos", cards: 1, atualizado: "2026-10-24 21:34:51", lendo: 0, problemas: 0 },
      { tipo: "liquidacoes", cards: 1, atualizado: "2026-10-24 21:30:00", lendo: 1, problemas: 0 },
      { tipo: "pagamentos", cards: 1, atualizado: "2026-10-20 10:00:00", lendo: 0, problemas: 0 },
    ],
    orgaos: [
      [1, "PMRV", "Prefeitura Municipal de Rio Verde"],
      [2, "FMS", "Fundo Municipal de Saúde"],
    ],
    dic: dicOut as PacoteExec["dic"],
    emp,
    liq,
    pag,
  };
}

export default function Harness() {
  const base = useMemo(() => montarBase(gerar()), []);
  return (
    <main className="mx-auto max-w-[1600px] px-[var(--pad-canvas)] py-[var(--pad-canvas-y)]">
      <PermissaoExportar permitido>
        <DashboardExecucao base={base} anos={[2026, 2025]} onAnos={() => {}} carregando={false} erro={null} onTentar={() => {}} hoje="2026-10-25" podeExportar />
      </PermissaoExportar>
    </main>
  );
}