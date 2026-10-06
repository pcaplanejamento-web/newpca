"use client";

import { dataHoraBR, num, numeroSemAno } from "@/lib/format";
import type { LinhaSaude, SaudeDados as DadosSaude, VerificacaoSaude } from "@/lib/saude-dados-core";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { BotaoAtualizar } from "./BotaoAtualizar";
import { CelulaCopiavel } from "./BotaoCopiar";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";

const TOM = { ok: "ok", atencao: "warn", alerta: "danger" } as const;

const GRUPOS = [
  { grupo: "integridade", titulo: "Integridade — deve ser zero" },
  { grupo: "dados", titulo: "Dados a tratar" },
] as const;

const colProtocolo: Column<LinhaSaude> = {
  key: "protocolo",
  header: "Protocolo",
  nowrap: true,
  value: (l) => l.protocolo ?? "—",
  render: (l) => (
    <CelulaCopiavel copiar={numeroSemAno(l.protocolo)} rotulo="nº do protocolo">
      {l.protocolo ?? "—"}
    </CelulaCopiavel>
  ),
};

const colDfd: Column<LinhaSaude> = {
  key: "dfd",
  header: "DFD",
  nowrap: true,
  value: (l) => l.dfd ?? "—",
  render: (l) =>
    l.dfd ? (
      <CelulaCopiavel copiar={l.dfd} rotulo="nº do DFD">
        {l.dfd}
        {l.planejamento && <span className="text-muted"> · Planej. {l.planejamento}</span>}
      </CelulaCopiavel>
    ) : (
      "—"
    ),
};

const colProblema: Column<LinhaSaude> = {
  key: "problema",
  header: "Problema",
  align: "left",
  minWidth: 260,
  value: (l) => l.problema,
  render: (l) => <span className="text-text-2">{l.problema}</span>,
};

/** A tabela de UMA verificação com ocorrências; tocar na linha abre o lugar dela (a Mesa com o protocolo ou o DFD). */
function TabelaVerificacao({ v, onAbrir }: { v: VerificacaoSaude; onAbrir?: (href: string) => void }) {
  const comDocumento = v.linhas.some((l) => l.protocolo || l.dfd);
  const colunas = comDocumento ? [colProtocolo, ...(v.linhas.some((l) => l.dfd) ? [colDfd] : []), colProblema] : [colProblema];
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-text">
        {v.titulo}{" "}
        <span className="font-normal text-muted">
          · {num(v.total)} {v.unidade}
        </span>
      </h3>
      <p className="text-[12.5px] text-muted">
        {v.descricao}
        {v.parcial && ` A lista mostra ${num(v.linhas.length)} de ${num(v.total)}.`}
      </p>
      <DataTable
        columns={colunas}
        rows={v.linhas}
        getKey={(l) => l.chave}
        density="compact"
        exportar={{ nome: `Saúde dos dados — ${v.titulo}` }}
        onRowClick={onAbrir && comDocumento ? (l) => l.href && onAbrir(l.href) : undefined}
      />
    </div>
  );
}

/**
 * SAÚDE DOS DADOS (ADM, tela Armazenamento) — apresentacional: a INTEGRIDADE dos totais (deve ser zero) e os DADOS A
 * TRATAR, um indicador por verificação na cor do estado e, para cada uma com ocorrências, a tabela com o lugar de cada
 * uma. Os dados vêm do contêiner (`GET /api/admin/saude-dados`).
 */
export function SaudeDados({
  saude,
  erro = null,
  verificando,
  onVerificar,
  onAbrir,
}: {
  saude: DadosSaude | null;
  erro?: string | null;
  verificando: boolean;
  /** Refaz a verificação (o botão "Verificar" e o "Tentar de novo"). */
  onVerificar: () => void;
  /** Abre o lugar de uma linha. Sem ele, as linhas não abrem. */
  onAbrir?: (href: string) => void;
}) {
  const comProblema = saude?.verificacoes.filter((v) => v.total > 0) ?? [];
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">Saúde dos dados</h2>
            <Ajuda titulo="Saúde dos dados" compacta>
              <div className="space-y-2.5">
                {(saude?.verificacoes ?? []).map((v) => (
                  <TopicoAjuda key={v.chave} titulo={v.titulo}>
                    {v.descricao}
                  </TopicoAjuda>
                ))}
                <p className="text-muted">
                  Integridade deve ser zero: uma ocorrência é defeito do sistema, não do documento. Dados a tratar se corrigem
                  no protocolo ou no DFD — toque na linha para abrir na Mesa.
                </p>
              </div>
            </Ajuda>
          </div>
          {saude && (
            <p className="text-[12px] text-muted">
              Verificado em {dataHoraBR(saude.verificadoEm)} · {num(saude.contagens.protocolos)} protocolos ·{" "}
              {num(saude.contagens.dfds)} DFDs · {num(saude.contagens.itens)} itens
            </p>
          )}
        </div>
        <BotaoAtualizar ativo={verificando} rotulo="Verificar" detalhe="Verificando os dados…" onClick={onVerificar} />
      </div>

      {erro && <ErroCarga msg={erro} kind={saude ? "warn" : "danger"} onTentar={onVerificar} />}
      {!saude && !erro && (
        <div className="rounded-card border border-border p-4">
          <SkeletonLinhas linhas={4} />
        </div>
      )}

      {saude && (
        <div className="space-y-[var(--gap-block)]">
          {GRUPOS.map((g) => (
            <div key={g.grupo} className="space-y-1.5">
              <h3 className="text-[12px] font-medium text-muted">{g.titulo}</h3>
              <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-4">
                {saude.verificacoes
                  .filter((v) => v.grupo === g.grupo)
                  .map((v) => (
                    <StatMini
                      key={v.chave}
                      label={v.titulo}
                      value={v.total === 0 ? "OK" : num(v.total)}
                      hint={v.total === 0 ? "Tudo certo" : v.unidade}
                      tone={TOM[v.nivel]}
                    />
                  ))}
              </div>
            </div>
          ))}
          {comProblema.map((v) => (
            <TabelaVerificacao key={v.chave} v={v} onAbrir={onAbrir} />
          ))}
        </div>
      )}
    </section>
  );
}
