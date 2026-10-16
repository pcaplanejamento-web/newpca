"use client";

import { useCallback, useEffect, useState } from "react";
import { type AcessoRegistro, aparelhosDistintos, haQuanto, ROTULO_CANAL, rotuloDispositivo } from "@/lib/acessos-core";
import { dataHoraBR } from "@/lib/format";
import { Badge } from "./Badge";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";

export type DadosAcesso = { ultimoAcesso: string | null; acessos: AcessoRegistro[] };

const COLUNAS: Column<AcessoRegistro>[] = [
  { key: "em", header: "Data e hora", filter: "date", value: (a) => a.em, render: (a) => <span className="tabular-nums">{dataHoraBR(a.em)}</span>, nowrap: true },
  {
    key: "dispositivo",
    header: "Dispositivo",
    value: (a) => rotuloDispositivo(a),
    render: (a) => (
      <span className="inline-flex items-center gap-2">
        {rotuloDispositivo(a)}
        {a.novo && <Badge tone="amber">Novo</Badge>}
      </span>
    ),
    nowrap: true,
  },
  { key: "canal", header: "Entrada", value: (a) => ROTULO_CANAL[a.canal] ?? a.canal, render: (a) => ROTULO_CANAL[a.canal] ?? a.canal, nowrap: true },
  { key: "ip", header: "IP", value: (a) => a.ip ?? "—", render: (a) => <span className="font-mono text-[12.5px]">{a.ip ?? "—"}</span>, nowrap: true },
];

/** O HISTÓRICO DE ACESSO (apresentacional): o último acesso, os números e cada login com data/hora, dispositivo, canal e IP. */
export function TabelaAcessos({ dados, nomeExportacao = "Histórico de acesso" }: { dados: DadosAcesso; nomeExportacao?: string }) {
  const agora = Date.now();
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-3">
        <StatMini label="Último acesso" value={dados.ultimoAcesso ? dataHoraBR(dados.ultimoAcesso) : "Nunca"} hint={haQuanto(dados.ultimoAcesso, agora)} tone="accent" />
        <StatMini label="Logins guardados" value={dados.acessos.length} hint="os 50 mais recentes" />
        <StatMini label="Aparelhos" value={aparelhosDistintos(dados.acessos)} hint="diferentes no histórico" />
      </div>
      <DataTable
        columns={COLUNAS}
        rows={dados.acessos}
        getKey={(a) => a.id}
        density="compact"
        pageSize={10}
        exportar={{ nome: nomeExportacao }}
        vazio="Nenhum login registrado ainda (o histórico começa a partir desta versão)."
      />
    </div>
  );
}

/** O histórico carregado de uma rota (`/api/perfil/acessos` ou `/api/admin/usuarios/<id>/acessos`). */
export function HistoricoAcessos({ url, nomeExportacao }: { url: string; nomeExportacao?: string }) {
  const [dados, setDados] = useState<DadosAcesso | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    setErro(null);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as { ok: boolean; error?: string } & DadosAcesso;
        if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível carregar o histórico de acesso.");
        setDados({ ultimoAcesso: j.ultimoAcesso, acessos: j.acessos });
      })
      .catch((e) => setErro((e as Error).message));
  }, [url]);
  useEffect(carregar, [carregar]);
  if (erro) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!dados) return <SkeletonLinhas linhas={3} />;
  return <TabelaAcessos dados={dados} nomeExportacao={nomeExportacao} />;
}
