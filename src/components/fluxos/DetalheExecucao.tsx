"use client";

import { useMemo } from "react";
import { Badge, type Tone } from "../Badge";
import { BotaoCopiar } from "../BotaoCopiar";
import { Button } from "../Button";
import { Callout } from "../Callout";
import { type Column, DataTable } from "../DataTable";
import { Modal } from "../Modal";
import { Progress } from "../Progress";
import { SecaoBanner, ValorCampo } from "../SecaoBanner";
import { StatMini } from "../StatMini";

/** O resultado de um item processado (o selo da coluna Estado): rótulo, tom e o detalhe (a mensagem). */
export type EstadoItemFluxo = { rotulo: string; tom: Tone; texto: string };
/** Um dado do item mostrado no banner (DFD, planejamento, protocolo, órgão…). */
export type CampoItemFluxo = { rotulo: string; valor: string };

const FEEDBACK: Partial<Record<Tone, "ok" | "warn" | "danger" | "info">> = { emerald: "ok", amber: "warn", red: "danger", blue: "info" };
const TOM_STAT: Partial<Record<Tone, "ok" | "warn" | "danger">> = { emerald: "ok", amber: "warn", red: "danger" };

/**
 * O BANNER de UM item processado pela automação (o toque no selo da coluna Estado): o resultado, a MENSAGEM inteira (a
 * da falha, da divergência ou da correção — com Copiar), os dados do item e as ações (abrir o registro; executar de novo
 * só com ele).
 */
export function BannerItemFluxo({
  aberto,
  onClose,
  titulo,
  etapa,
  estado,
  campos,
  onAbrirRegistro,
  rotuloAbrir = "Abrir o registro",
  onExecutarDeNovo,
}: {
  aberto: boolean;
  onClose: () => void;
  /** O item pelo nome que a pessoa reconhece ("DFD 1209 · Planej. 1509"). */
  titulo: string;
  /** A etapa que processou o item (ex.: "Executar fluxo"). */
  etapa?: string;
  estado: EstadoItemFluxo;
  campos: CampoItemFluxo[];
  onAbrirRegistro?: () => void;
  rotuloAbrir?: string;
  /** Executa o fluxo de novo só com este item (sem ele: a ação não aparece — fluxo rodando ou que não recebe itens). */
  onExecutarDeNovo?: () => void;
}) {
  const falhou = estado.tom === "red";
  const mensagem = estado.texto.trim();
  return (
    <Modal
      open={aberto}
      onClose={onClose}
      titulo={titulo}
      size="md"
      cabecalho={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate text-base font-semibold text-text">{titulo}</h2>
          <Badge tone={estado.tom} dot>
            {estado.rotulo}
          </Badge>
        </div>
      }
      rodape={
        onAbrirRegistro || onExecutarDeNovo ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onExecutarDeNovo && (
              <Button size="sm" variant="secondary" onClick={onExecutarDeNovo}>
                Executar de novo só com este
              </Button>
            )}
            {onAbrirRegistro && (
              <Button size="sm" onClick={onAbrirRegistro}>
                {rotuloAbrir}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <SecaoBanner titulo={falhou ? "Motivo da falha" : "Resultado"} acao={mensagem ? <BotaoCopiar texto={mensagem} rotulo="Copiar" /> : undefined}>
          <Callout kind={FEEDBACK[estado.tom] ?? "info"}>
            <p className="whitespace-pre-wrap break-words text-sm">
              {mensagem || (falhou ? "A etapa falhou sem informar o motivo." : `${estado.rotulo}${etapa ? ` — ${etapa}` : ""}.`)}
            </p>
          </Callout>
        </SecaoBanner>
        {campos.length > 0 && (
          <SecaoBanner titulo="Item">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {campos.map((c) => (
                <div key={c.rotulo} className="min-w-0">
                  <dt className="text-xs text-muted">{c.rotulo}</dt>
                  <dd>
                    <ValorCampo>{c.valor || "—"}</ValorCampo>
                  </dd>
                </div>
              ))}
            </dl>
          </SecaoBanner>
        )}
      </div>
    </Modal>
  );
}

/** Uma linha da execução no banner: o item, o resultado e a mensagem. */
export type LinhaExecucaoFluxo = { chave: string; item: string; estado: EstadoItemFluxo };

/**
 * O BANNER da EXECUÇÃO (o toque no selo "Executando"/"Concluído"/"Falhou" da Análise): a situação, o que roda agora, o
 * andamento, um cartão por resultado e a lista dos itens (as falhas primeiro) com a MENSAGEM de cada um — tocar abre o item.
 */
export function BannerExecucaoFluxo({
  aberto,
  onClose,
  titulo,
  situacao,
  texto,
  feito,
  total,
  restante,
  linhas,
  onAbrirLinha,
}: {
  aberto: boolean;
  onClose: () => void;
  /** O nome do fluxo. */
  titulo: string;
  situacao: { rotulo: string; tom: Tone };
  /** O que a execução faz agora (ou o erro / quando terminou). */
  texto: string;
  feito: number;
  total: number;
  /** O tempo restante já em texto ("≈ 4 min"). */
  restante?: string | null;
  linhas: LinhaExecucaoFluxo[];
  onAbrirLinha?: (chave: string) => void;
}) {
  // Um cartão por resultado (verde › âmbar › vermelho › outros).
  const resultados = useMemo(() => {
    const m = new Map<string, { rotulo: string; tom: Tone; n: number }>();
    for (const l of linhas) {
      const x = m.get(l.estado.rotulo) ?? { rotulo: l.estado.rotulo, tom: l.estado.tom, n: 0 };
      x.n++;
      m.set(l.estado.rotulo, x);
    }
    const ordem = (t: Tone) => ({ emerald: 0, amber: 1, red: 2 })[t as string] ?? 3;
    return [...m.values()].sort((a, b) => ordem(a.tom) - ordem(b.tom) || b.n - a.n);
  }, [linhas]);
  // As falhas e as atenções primeiro (o que pede ação), depois o resto na ordem do processamento.
  const ordenadas = useMemo(() => {
    const peso = (t: Tone) => ({ red: 0, amber: 1 })[t as string] ?? 2;
    return linhas.map((l, i) => ({ l, i })).sort((a, b) => peso(a.l.estado.tom) - peso(b.l.estado.tom) || a.i - b.i).map((x) => x.l);
  }, [linhas]);
  const colunas: Column<LinhaExecucaoFluxo>[] = [
    { key: "item", header: "Item", nowrap: true, align: "left", value: (l) => l.item, render: (l) => l.item },
    {
      key: "estado",
      header: "Estado",
      nowrap: true,
      value: (l) => l.estado.rotulo,
      render: (l) => (
        <Badge tone={l.estado.tom} dot>
          {l.estado.rotulo}
        </Badge>
      ),
    },
    { key: "mensagem", header: "Mensagem", align: "left", minWidth: 320, value: (l) => l.estado.texto || "—", render: (l) => <span className="whitespace-normal">{l.estado.texto || "—"}</span> },
  ];
  return (
    <Modal
      open={aberto}
      onClose={onClose}
      titulo={titulo}
      size="xl"
      cabecalho={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate text-base font-semibold text-text">{titulo}</h2>
          <Badge tone={situacao.tom} dot>
            {situacao.rotulo}
          </Badge>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <SecaoBanner titulo="Agora" acao={texto ? <BotaoCopiar texto={texto} rotulo="Copiar" /> : undefined}>
          <p className="whitespace-pre-wrap break-words text-sm text-text">{texto || "—"}</p>
          {total > 0 && (
            <div className="mt-3 space-y-1">
              <Progress value={(Math.min(feito, total) / total) * 100} label={`${feito.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`} />
              {restante && <p className="text-xs tabular-nums text-muted">{restante}</p>}
            </div>
          )}
        </SecaoBanner>
        {resultados.length > 0 && (
          <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
            <StatMini label="Processados" value={linhas.length.toLocaleString("pt-BR")} hint={total ? `de ${total.toLocaleString("pt-BR")}` : undefined} />
            {resultados.map((r) => (
              <StatMini key={r.rotulo} label={r.rotulo} value={r.n.toLocaleString("pt-BR")} tone={TOM_STAT[r.tom] ?? "default"} />
            ))}
          </div>
        )}
        {linhas.length > 0 && (
          <DataTable
            columns={colunas}
            rows={ordenadas}
            getKey={(l) => l.chave}
            density="compact"
            pageSize={10}
            onRowClick={onAbrirLinha ? (l) => onAbrirLinha(l.chave) : undefined}
            exportar={{ nome: `${titulo} — itens` }}
          />
        )}
      </div>
    </Modal>
  );
}
