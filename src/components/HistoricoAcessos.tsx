"use client";

import { useCallback, useEffect, useState } from "react";
import { CelulaTexto } from "./CelulaLista";
import { Segmented } from "./Segmented";
import {
  type AcessoRegistro,
  aparelhosDistintos,
  duracaoAcesso,
  type EventoRegistro,
  haQuanto,
  ROTULO_CANAL,
  ROTULO_EVENTO,
  ROTULO_SAIDA,
  rotuloDispositivo,
  type TipoEvento,
  tempoNosUltimosDias,
  textoDuracaoAcesso,
} from "@/lib/acessos-core";
import { dataHoraBR } from "@/lib/format";
import { Badge } from "./Badge";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";

export type DadosAcesso = { ultimoAcesso: string | null; acessos: AcessoRegistro[]; eventos?: EventoRegistro[] };

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
  {
    key: "saida",
    header: "Saída",
    filter: "date",
    value: (a) => a.saidaEm ?? "",
    render: (a) =>
      a.saidaEm ? (
        <span className="tabular-nums">
          {dataHoraBR(a.saidaEm)} <span className="text-muted">· {ROTULO_SAIDA[a.saidaMotivo ?? ""] ?? a.saidaMotivo}</span>
        </span>
      ) : (
        <span className="text-muted">{a.ultimoEm ? `Ativo por último ${dataHoraBR(a.ultimoEm)}` : "—"}</span>
      ),
    nowrap: true,
  },
  {
    key: "duracao",
    header: "Duração",
    total: false,
    value: (a) => { const d = duracaoAcesso(a); return d ? textoDuracaoAcesso(d.ms) : "—"; },
    render: (a) => {
      const d = duracaoAcesso(a);
      return d ? (
        <span className="tabular-nums" title={d.estimada ? "Estimada pela última atividade (sem saída registrada)" : undefined}>
          {textoDuracaoAcesso(d.ms)}
          {d.estimada && <span className="text-muted"> (estimada)</span>}
        </span>
      ) : (
        "—"
      );
    },
    nowrap: true,
  },
  { key: "ip", header: "IP", value: (a) => a.ip ?? "—", render: (a) => <span className="font-mono text-[12.5px]">{a.ip ?? "—"}</span>, nowrap: true },
];

const COLUNAS_EVENTOS: Column<EventoRegistro>[] = [
  { key: "em", header: "Data e hora", filter: "date", value: (e) => e.em, render: (e) => <span className="tabular-nums">{dataHoraBR(e.em)}</span>, nowrap: true },
  {
    key: "tipo",
    header: "Tipo",
    value: (e) => ROTULO_EVENTO[e.tipo as TipoEvento] ?? e.tipo,
    render: (e) => (
      <span className="inline-flex items-center gap-2">
        <Badge tone={e.tipo === "copia" ? "blue" : "amber"}>{ROTULO_EVENTO[e.tipo as TipoEvento] ?? e.tipo}</Badge>
        {e.origem === "sistema" && <span className="text-muted text-[12px]">botão Copiar</span>}
      </span>
    ),
    nowrap: true,
  },
  { key: "tela", header: "Tela", value: (e) => e.tela || e.rota, render: (e) => <span title={e.rota}>{e.tela || e.rota}</span>, nowrap: true },
  { key: "itens", header: "Aberto na tela", value: (e) => e.itens || "—", render: (e) => <CelulaTexto texto={e.itens || "—"} />, minWidth: 180 },
  {
    key: "texto",
    header: "Texto copiado",
    value: (e) => e.texto ?? "",
    render: (e) => (e.texto ? <CelulaTexto texto={e.tamanho > e.texto.length ? `${e.texto}… (${e.tamanho} caracteres)` : e.texto} /> : <span className="text-muted">—</span>),
    minWidth: 220,
  },
  { key: "dispositivo", header: "Navegador", value: (e) => e.navegador, render: (e) => e.navegador, nowrap: true },
];

/** O HISTÓRICO DE ACESSO (apresentacional): o último acesso, os números e cada login com data/hora, dispositivo, canal e IP. */
export function TabelaAcessos({ dados, nomeExportacao = "Histórico de acesso" }: { dados: DadosAcesso; nomeExportacao?: string }) {
  const agora = Date.now();
  const [aba, setAba] = useState<"acessos" | "eventos">("acessos");
  const eventos = dados.eventos ?? [];
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-4">
        <StatMini label="Último acesso" value={dados.ultimoAcesso ? dataHoraBR(dados.ultimoAcesso) : "Nunca"} hint={haQuanto(dados.ultimoAcesso, agora)} tone="accent" />
        <StatMini label="Logins guardados" value={dados.acessos.length} hint="os 50 mais recentes" />
        <StatMini label="Aparelhos" value={aparelhosDistintos(dados.acessos)} hint="diferentes no histórico" />
        <StatMini label="Tempo de uso" value={textoDuracaoAcesso(tempoNosUltimosDias(dados.acessos, agora))} hint="nos últimos 30 dias" />
      </div>
      <Segmented
        ariaLabel="Histórico"
        value={aba}
        onChange={(v) => setAba(v as "acessos" | "eventos")}
        options={[
          { value: "acessos", label: `Acessos (${dados.acessos.length})` },
          { value: "eventos", label: `Cópias e prints (${eventos.length})` },
        ]}
      />
      {aba === "eventos" ? (
        <DataTable
          columns={COLUNAS_EVENTOS}
          rows={eventos}
          getKey={(e) => e.id}
          density="compact"
          pageSize={10}
          exportar={{ nome: `${nomeExportacao} - cópias e prints` }}
          vazio="Nenhuma cópia, captura ou impressão registrada."
        />
      ) : (
      <DataTable
        columns={COLUNAS}
        rows={dados.acessos}
        getKey={(a) => a.id}
        density="compact"
        pageSize={10}
        exportar={{ nome: nomeExportacao }}
        vazio="Nenhum login registrado ainda (o histórico começa a partir desta versão)."
      />
      )}
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
        setDados({ ultimoAcesso: j.ultimoAcesso, acessos: j.acessos, eventos: j.eventos ?? [] });
      })
      .catch((e) => setErro((e as Error).message));
  }, [url]);
  useEffect(carregar, [carregar]);
  if (erro) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!dados) return <SkeletonLinhas linhas={3} />;
  return <TabelaAcessos dados={dados} nomeExportacao={nomeExportacao} />;
}
