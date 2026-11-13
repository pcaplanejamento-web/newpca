"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import {
  aceiteVale,
  blocosRelatorioCenti,
  comparacaoConferencias,
  contarDivergencias,
  type DfdRelatorioCenti,
  divergenciasDoMotivo,
  type FormatoRelatorioCenti,
  type GrupoDivergencias,
  lerAceite,
  MAX_JUSTIFICATIVA,
  MIN_JUSTIFICATIVA,
  orientacoesDivergencias,
  textoRelatorioCenti,
  tiposDivergencia,
  tiposDoMotivo,
} from "@/lib/conferencia-dfd-centi";
import { dataHoraBR } from "@/lib/format";
import { classeExecucao } from "@/lib/execucao-centi";
import { Badge, type Tone } from "./Badge";
import { BotaoCopiar, copiarTexto } from "./BotaoCopiar";
import { Button } from "./Button";
import { ChipsEscolha } from "./ChipsEscolha";
import { Dropdown } from "./Dropdown";
import { usePodeExportar } from "./ExportarTabelas";
import { TextArea, TextField } from "./Field";
import { IconBuilding, IconCheck, IconClock, IconCopy, IconDownload, IconMerge, IconPencil, IconRefresh, IconTrash, IconUndo } from "./icons";
import { toast } from "./Toast";

const TOM: Record<"executado" | "cancelado" | "outro", Tone> = { executado: "emerald", cancelado: "red", outro: "amber" };

/** A EXECUÇÃO do DFD na Centi (a situação do planejamento na CM002): verde = executado · vermelho = cancelado · âmbar =
 * outra situação · "—" = ainda não verificado. Na Mesa (DFDs/Itens) e na tarefa "Verificar execução" da Automação. */
export const rotuloConferencia = (s: string | null | undefined) => (s === "convergente" ? "Convergente" : s === "divergente" ? "Divergente" : "Não conferido");

/** O rótulo do FILTRO da conferência DESATUALIZADA (o DFD mudou depois dela). */
export const ROTULO_RECONFERIR = "Reconferir";

/** O rótulo da divergência ACEITA (a Centi é que está errada — vale enquanto o motivo for o mesmo). */
export const ROTULO_RESSALVA = "Convergente com ressalva";

/** A divergência foi ACEITA (o aceite gravado é deste MESMO motivo). */
export const comRessalva = (s: string | null | undefined, motivo: string | null | undefined, aceite: string | null | undefined) =>
  aceiteVale(s, motivo ?? null, lerAceite(aceite));

/** Os valores do FILTRO da coluna Centi: o status, "Reconferir" quando desatualizada e, no divergente, cada TIPO de
 * divergência ("Divergente · Valor total") — ou, ACEITA, "Convergente com ressalva" (os tipos seguem filtráveis). */
export const valoresConferencia = (s: string | null | undefined, motivo?: string | null, desatualizada = false, ressalva = false): string[] => [
  ressalva && s === "divergente" ? ROTULO_RESSALVA : rotuloConferencia(s),
  ...(desatualizada && (s === "convergente" || s === "divergente") ? [ROTULO_RECONFERIR] : []),
  ...(s === "divergente" ? tiposDoMotivo(motivo).map((t) => `Divergente · ${t}`) : []),
];

/**
 * As AÇÕES da Mesa sobre a conferência com a Centi (o painel do selo): reconferir os DFDs e trocar os dados deles pelos da
 * Centi — rodam a automação em segundo plano (quem fornece confirma antes). Sem o provedor (ou sem a automação), as ações
 * não aparecem. O histórico precisa só do id do DFD.
 */
export type AcoesCenti = {
  reconferir?: (dfdIds: number[]) => void;
  substituir?: (dfdIds: number[]) => void;
  /** Abre o banner do DFD na correção pela Centi (Manter sistema | Usar Centi, dado a dado). */
  corrigir?: (dfdId: number) => void;
  /** Exclui o DFD (a situação é "cancelado" na Centi) — quem fornece confirma. */
  excluir?: (dfdId: number) => void;
  /** As ações gravadas na conferência (`POST /api/dfd/[id]/conferencia-centi`): recalcular, aceitar, desfazer o aceite e
   * corrigir o nº de planejamento. Devolve se deu certo (o erro já foi avisado). */
  servidor?: (dfdId: number, corpo: Record<string, unknown>) => Promise<boolean>;
  /** O Administrador: corrige o nº de planejamento (identificador). */
  admin?: boolean;
};
const AcoesCentiCtx = createContext<AcoesCenti>({});
export const ProvedorAcoesCenti = AcoesCentiCtx.Provider;

/** A conferência do DFD com a Centi: convergente (verde) | divergente (vermelho). Tocar no DIVERGENTE abre o painel com
 * TODAS as divergências encontradas (uma por linha, agrupadas por origem) e "Copiar". */
export function CelulaConferenciaCenti({
  status,
  motivo,
  dfdId,
  conferidoEm,
  desatualizada = false,
  rotulo,
  aceite = null,
  ressalvaDoDfd = false,
}: {
  status: string | null | undefined;
  motivo?: string | null;
  /** O aceite da divergência (JSON gravado) — vale só para o MESMO motivo. */
  aceite?: string | null;
  /** (item) A ressalva do DFD vale para as divergências dele — o motivo do item é um recorte do aceito. */
  ressalvaDoDfd?: boolean;
  /** O DFD gravado: as ações e o histórico (sem ele, só a lista). */
  dfdId?: number;
  conferidoEm?: string | null;
  /** O DFD foi gravado DEPOIS da conferência: o selo vira "Reconferir" (âmbar). */
  desatualizada?: boolean;
  /** Título do painel (ex.: "Item 4"). */
  rotulo?: string;
}) {
  if (status !== "convergente" && status !== "divergente") return <span className="text-faint" title="Ainda não conferido com a Centi">—</span>;
  const quando = conferidoEm ? ` em ${dataHoraBR(conferidoEm)}` : "";
  const ac = lerAceite(aceite);
  const ressalva = ac && status === "divergente" && (ressalvaDoDfd || aceiteVale(status, motivo ?? null, ac)) ? ac : null;
  const selo = desatualizada ? (
    <Badge tone="amber" dot>
      {ROTULO_RECONFERIR}
    </Badge>
  ) : ressalva ? (
    <Badge tone="blue" dot>
      Com ressalva
    </Badge>
  ) : (
    <Badge tone={status === "convergente" ? "emerald" : "red"} dot>
      {rotuloConferencia(status)}
    </Badge>
  );
  const grupos = status === "divergente" ? divergenciasDoMotivo(motivo) : [];
  // Convergente em dia e sem DFD: só o selo (não há o que listar nem fazer).
  if (!desatualizada && status === "convergente" && dfdId == null) return <span title={`Confere com a Centi${quando}`}>{selo}</span>;
  if (!desatualizada && status === "divergente" && !grupos.length && dfdId == null)
    return <span title="Divergente — sem detalhes gravados">{selo}</span>;
  const total = contarDivergencias(grupos);
  const titulo = desatualizada
    ? `O DFD mudou depois da conferência (${rotuloConferencia(status).toLowerCase()}${quando}) — reconfira`
    : status === "convergente"
      ? `Confere com a Centi${quando}`
      : ressalva
        ? `Divergência aceita — ${ressalva.justificativa}`
        : "Ver todas as divergências";
  return (
    <Dropdown
      papel="dialog"
      ariaLabel={status === "divergente" ? `Divergências com a Centi (${total})` : "Conferência com a Centi"}
      title={titulo}
      width={460}
      triggerClassName="cursor-pointer min-h-11 desktop:min-h-0 hover:opacity-80"
      trigger={selo}
    >
      {(fechar) => (
        <PainelDivergencias
          grupos={grupos}
          total={total}
          status={status}
          dfdId={dfdId}
          conferidoEm={conferidoEm}
          desatualizada={desatualizada}
          rotulo={rotulo}
          ressalva={ressalva}
          fechar={fechar}
        />
      )}
    </Dropdown>
  );
}

const TODOS = "__todos";

type HistoricoCenti = { id: number; status: string; motivo: string | null; em: string; porNome: string | null };

/** O painel do selo: os TIPOS em chips (filtram a lista e o "Copiar"), a lista agrupada por origem, o que fazer, as ações
 * (reconferir · usar os dados da Centi) e o histórico das conferências. */
function PainelDivergencias({
  grupos,
  total,
  status,
  dfdId,
  conferidoEm,
  desatualizada,
  rotulo,
  ressalva,
  fechar,
}: {
  ressalva: ReturnType<typeof lerAceite>;
  grupos: GrupoDivergencias[];
  total: number;
  status: "convergente" | "divergente";
  dfdId?: number;
  conferidoEm?: string | null;
  desatualizada: boolean;
  rotulo?: string;
  fechar: () => void;
}) {
  const acoes = useContext(AcoesCentiCtx);
  const [tipo, setTipo] = useState<string>(TODOS);
  const [verHistorico, setVerHistorico] = useState(false);
  // O formulário aberto no painel: aceitar a divergência (justificativa) ou corrigir o nº de planejamento (ADM).
  const [form, setForm] = useState<"aceitar" | "planejamento" | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [planej, setPlanej] = useState("");
  const [gravando, setGravando] = useState(false);
  const conta = new Map<string, number>();
  for (const g of grupos) for (const i of g.itens) for (const t of tiposDivergencia(i)) conta.set(t, (conta.get(t) ?? 0) + 1);
  const ativo = tipo !== TODOS && conta.has(tipo) ? tipo : TODOS;
  const vistos =
    ativo === TODOS ? grupos : grupos.map((g) => ({ ...g, itens: g.itens.filter((i) => tiposDivergencia(i).includes(ativo)) })).filter((g) => g.itens.length);
  const nVistos = ativo === TODOS ? total : (conta.get(ativo) ?? 0);
  const texto = vistos.map((g) => [g.titulo, ...g.itens.map((i) => `- ${i}`)].filter(Boolean).join("\n")).join("\n\n");
  const orientacoes = status === "divergente" ? orientacoesDivergencias([...conta.keys()]) : [];
  const rodar = (f: ((ids: number[]) => void) | undefined) =>
    f && dfdId != null
      ? () => {
          fechar();
          f([dfdId]);
        }
      : undefined;
  const reconferir = rodar(acoes.reconferir);
  const substituir = status === "divergente" ? rodar(acoes.substituir) : undefined;
  const corrigir =
    status === "divergente" && acoes.corrigir && dfdId != null
      ? () => {
          fechar();
          acoes.corrigir?.(dfdId);
        }
      : undefined;
  const excluir =
    status === "divergente" && conta.has("Situação") && acoes.excluir && dfdId != null
      ? () => {
          fechar();
          acoes.excluir?.(dfdId);
        }
      : undefined;
  const servidor = acoes.servidor && dfdId != null ? acoes.servidor : undefined;
  const planejavel = status === "divergente" && !!acoes.admin && !!servidor && (conta.has("Nº do DFD") || conta.has("Não encontrado na Centi"));
  const enviar = async (corpo: Record<string, unknown>, fecharDepois = true) => {
    if (!servidor || dfdId == null || gravando) return;
    setGravando(true);
    const certo = await servidor(dfdId, corpo);
    setGravando(false);
    if (certo && fecharDepois) fechar();
  };
  const justOk = justificativa.trim().length >= MIN_JUSTIFICATIVA;
  return (
    /* O painel PARA o clique: numa célula, o toque atravessaria o portal e abriria a linha. */
    <div role="none" className="-m-2 space-y-2 p-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] font-semibold text-text">
          {status === "divergente" ? (
            <>
              {rotulo ? `${rotulo} — d` : "D"}ivergências com a Centi <span className="font-normal text-muted">({ativo === TODOS ? total : `${nVistos} de ${total}`})</span>
            </>
          ) : (
            "Confere com a Centi"
          )}
        </p>
        {status === "divergente" && texto && (
          <BotaoCopiar texto={texto} rotulo="Copiar" titulo={ativo === TODOS ? "Copiar todas as divergências" : `Copiar as divergências de ${ativo}`} />
        )}
      </div>
      {(conferidoEm || desatualizada) && (
        <p className={`text-[12px] ${desatualizada ? "text-[var(--warn)]" : "text-muted"}`}>
          {conferidoEm ? `Conferido em ${dataHoraBR(conferidoEm)}.` : ""}
          {desatualizada ? " O DFD foi alterado depois — o resultado pode não valer mais: reconfira." : ""}
        </p>
      )}
      {conta.size > 1 && (
        <ChipsEscolha
          rolar
          ariaLabel="Filtrar por tipo de divergência"
          valor={ativo}
          onEscolher={(v) => setTipo(v === ativo ? TODOS : v)}
          opcoes={[{ value: TODOS, label: "Todas", conta: total }, ...[...conta].map(([t, n]) => ({ value: t, label: t, conta: n }))]}
        />
      )}
      {vistos.length > 0 && (
        <div className="max-h-[45vh] space-y-3 overflow-y-auto overscroll-contain pr-1">
          {vistos.map((g, gi) => (
            <section key={gi} className="space-y-1">
              {g.titulo && <p className="text-[12px] font-medium text-muted">{g.titulo}</p>}
              <ListaDivergencias itens={g.itens} />
            </section>
          ))}
        </div>
      )}
      {ressalva && (
        <div className="space-y-1 rounded-control border border-[color-mix(in_srgb,var(--info)_40%,transparent)] bg-[color-mix(in_srgb,var(--info)_8%,transparent)] px-2 py-1.5 text-[12.5px]">
          <p className="font-medium text-text">Divergência aceita (convergente com ressalva)</p>
          <p className="break-words text-text-2">{ressalva.justificativa}</p>
          <p className="text-[12px] text-muted">
            {ressalva.por} · {dataHoraBR(ressalva.em)} — vale enquanto as divergências forem as mesmas.
          </p>
        </div>
      )}
      {orientacoes.length > 0 && (
        <details className="rounded-control border border-border px-2 py-1.5 text-[12px] text-text-2">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium text-text desktop:min-h-0">O que fazer</summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {orientacoes.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </details>
      )}
      {form === "aceitar" && (
        <div className="space-y-2 border-t border-border pt-2">
          <TextArea
            label="Por que aceitar a divergência?"
            hint={`A Centi é que está errada? Diga o motivo (${MIN_JUSTIFICATIVA} a ${MAX_JUSTIFICATIVA} caracteres). Uma divergência nova derruba o aceite.`}
            rows={3}
            maxLength={MAX_JUSTIFICATIVA}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
          />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setForm(null)} disabled={gravando}>
              Cancelar
            </Button>
            <Button
              size="sm"
              icon={<IconCheck className="h-4 w-4" />}
              disabled={!justOk}
              loading={gravando}
              onClick={() => void enviar({ acao: "aceitar", justificativa: justificativa.trim() })}
            >
              Aceitar divergência
            </Button>
          </div>
        </div>
      )}
      {form === "planejamento" && (
        <div className="space-y-2 border-t border-border pt-2">
          <TextField label="Nº de planejamento correto" inputMode="numeric" value={planej} onChange={(e) => setPlanej(e.target.value.replace(/\D/g, "").slice(0, 12))} />
          <TextArea
            label="Justificativa"
            hint="O nº de planejamento é identificador: a troca fica no histórico e a conferência volta a “não conferido” até a próxima leitura da Centi."
            rows={2}
            maxLength={MAX_JUSTIFICATIVA}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
          />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setForm(null)} disabled={gravando}>
              Cancelar
            </Button>
            <Button
              size="sm"
              icon={<IconCheck className="h-4 w-4" />}
              disabled={!planej || !justOk}
              loading={gravando}
              onClick={() => void enviar({ acao: "planejamento", planejamento: planej, justificativa: justificativa.trim() })}
            >
              Gravar o nº
            </Button>
          </div>
        </div>
      )}
      {status === "divergente" && form == null && (corrigir || excluir || servidor || conta.has("Órgão")) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          {corrigir && (
            <Button size="sm" icon={<IconMerge className="h-4 w-4" />} onClick={corrigir}>
              Corrigir pela Centi
            </Button>
          )}
          {servidor && !ressalva && (
            <Button size="sm" variant="secondary" icon={<IconCheck className="h-4 w-4" />} onClick={() => setForm("aceitar")}>
              Aceitar divergência
            </Button>
          )}
          {servidor && ressalva && (
            <Button size="sm" variant="secondary" icon={<IconUndo className="h-4 w-4" />} loading={gravando} onClick={() => void enviar({ acao: "desfazerAceite" }, false)}>
              Desfazer o aceite
            </Button>
          )}
          {excluir && (
            <Button size="sm" variant="danger" icon={<IconTrash className="h-4 w-4" />} onClick={excluir}>
              Excluir o DFD
            </Button>
          )}
          {conta.has("Órgão") && (
            <Link
              href="/painel/orgaos"
              className="inline-flex h-11 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-accent hover:bg-surface-2 desktop:h-[var(--h-control-sm)]"
            >
              <IconBuilding className="h-4 w-4" /> Conferir o ID na Centi do órgão
            </Link>
          )}
          {planejavel && (
            <Button size="sm" variant="ghost" icon={<IconPencil className="h-4 w-4" />} onClick={() => setForm("planejamento")}>
              Corrigir o nº de planejamento
            </Button>
          )}
        </div>
      )}
      {(reconferir || substituir || dfdId != null) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          {servidor && (
            <Button
              size="sm"
              variant="secondary"
              icon={<IconRefresh className="h-4 w-4" />}
              loading={gravando && form == null}
              title="Compara de novo com os dados da Centi guardados na última conferência — sem a extensão"
              onClick={() => void enviar({ acao: "recalcular" }, false)}
            >
              Recalcular
            </Button>
          )}
          {reconferir && (
            <Button size="sm" variant="secondary" icon={<IconRefresh className="h-4 w-4" />} onClick={reconferir}>
              Reconferir
            </Button>
          )}
          {substituir && (
            <Button size="sm" variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={substituir}>
              Usar os dados da Centi
            </Button>
          )}
          {dfdId != null && (
            <Button
              size="sm"
              variant="ghost"
              icon={<IconClock className="h-4 w-4" />}
              aria-expanded={verHistorico}
              onClick={() => setVerHistorico((v) => !v)}
            >
              Histórico
            </Button>
          )}
        </div>
      )}
      {verHistorico && dfdId != null && <HistoricoConferencias dfdId={dfdId} />}
    </div>
  );
}

function ListaDivergencias({ itens, cor = "var(--danger)", riscado = false }: { itens: string[]; cor?: string; riscado?: boolean }) {
  return (
    <ol className="space-y-1">
      {itens.map((it, i) => (
        <li key={i} className="flex gap-2 rounded-control bg-surface-2 px-2 py-1.5 text-[12.5px] leading-snug text-text">
          <span aria-hidden="true" className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ background: cor }} />
          <span className={`min-w-0 break-words ${riscado ? "text-muted line-through" : ""}`}>{it}</span>
        </li>
      ))}
    </ol>
  );
}

/** As conferências anteriores do DFD: cada uma comparada com a que veio DEPOIS (o que foi resolvido, o que é novo). */
function HistoricoConferencias({ dfdId }: { dfdId: number }) {
  const [lista, setLista] = useState<HistoricoCenti[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/dfd/${dfdId}/conferencia-centi`)
      .then((r) => r.json() as Promise<{ ok?: boolean; historico?: HistoricoCenti[] }>)
      .then((j) => {
        if (!vivo) return;
        if (j?.ok && Array.isArray(j.historico)) setLista(j.historico);
        else setFalhou(true);
      })
      .catch(() => vivo && setFalhou(true));
    return () => {
      vivo = false;
    };
  }, [dfdId]);
  if (falhou) return <p className="text-[12px] text-[var(--danger)]">Não foi possível carregar o histórico.</p>;
  if (!lista) return <p className="text-[12px] text-muted">Carregando o histórico…</p>;
  if (!lista.length) return <p className="text-[12px] text-muted">Nenhuma conferência registrada.</p>;
  return (
    <ol className="max-h-[40vh] space-y-2 overflow-y-auto overscroll-contain pr-1">
      {lista.map((h, i) => {
        const anterior = lista[i + 1];
        const cmp = anterior ? comparacaoConferencias(anterior.motivo, h.motivo) : null;
        const n = contarDivergencias(divergenciasDoMotivo(h.motivo));
        return (
          <li key={h.id} className="space-y-1 rounded-control border border-border px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <Badge tone={h.status === "convergente" ? "emerald" : "red"} dot>
                {rotuloConferencia(h.status)}
              </Badge>
              <span className="text-muted">
                {dataHoraBR(h.em)}
                {h.porNome ? ` · ${h.porNome}` : ""}
                {h.status === "divergente" ? ` · ${n} divergência${n === 1 ? "" : "s"}` : ""}
              </span>
            </div>
            {cmp && (cmp.resolvidas.length > 0 || cmp.novas.length > 0) && (
              <details className="text-[12px]">
                <summary className="flex min-h-11 cursor-pointer items-center text-text-2 desktop:min-h-0">
                  {cmp.resolvidas.length} resolvida{cmp.resolvidas.length === 1 ? "" : "s"} · {cmp.novas.length} nova{cmp.novas.length === 1 ? "" : "s"}
                </summary>
                <div className="mt-1 space-y-1">
                  {cmp.resolvidas.length > 0 && <ListaDivergencias itens={cmp.resolvidas} cor="var(--ok)" riscado />}
                  {cmp.novas.length > 0 && <ListaDivergencias itens={cmp.novas} />}
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const FORMATOS: { value: FormatoRelatorioCenti; label: string }[] = [
  { value: "despacho", label: "Copiar despacho" },
  { value: "whatsapp", label: "Copiar para WhatsApp" },
  { value: "lista", label: "Copiar lista simples" },
];

/** O RELATÓRIO das divergências dos DFDs dados (os divergentes à vista ou os selecionados): copiar no formato escolhido
 * ou baixar o PDF (com a ação Exportar). Some sem nenhum DFD divergente. */
export function RelatorioCenti({ dfds, rotulo = "Relatório da Centi" }: { dfds: DfdRelatorioCenti[]; rotulo?: string }) {
  const podeExportar = usePodeExportar();
  const div = dfds.filter((d) => divergenciasDoMotivo(d.motivo).length > 0);
  if (!div.length) return null;
  const copiar = async (f: FormatoRelatorioCenti) => {
    if (await copiarTexto(textoRelatorioCenti(div, f))) toast.success(`Relatório de ${div.length} DFD(s) copiado.`);
    else toast.error("O navegador não deixou copiar.");
  };
  const pdf = async () => {
    try {
      const { baixarDocumentoPdf } = await import("@/lib/documento-pdf");
      await baixarDocumentoPdf("divergencias-centi.pdf", blocosRelatorioCenti(div, dataHoraBR(new Date().toISOString())));
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    }
  };
  return (
    <Dropdown
      align="end"
      ariaLabel={rotulo}
      title={`${rotulo} — ${div.length} DFD(s) divergente(s)`}
      width={260}
      triggerClassName="h-11 gap-1.5 rounded-control border border-border bg-surface-2 px-3 text-[13px] font-semibold text-text-2 hover:bg-surface desktop:h-[var(--h-control-sm)]"
      trigger={
        <>
          <IconCopy className="h-4 w-4" />
          <span className="max-sm:sr-only">{rotulo}</span>
        </>
      }
    >
      {(fechar) => (
        <div className="p-1">
          <p className="px-3 py-2 text-xs text-muted">{div.length} DFD(s) divergente(s)</p>
          {FORMATOS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center rounded-control px-3 text-left text-sm text-text hover:bg-surface-2 focus-visible:bg-surface-2 desktop:min-h-9"
              onClick={() => {
                fechar();
                void copiar(f.value);
              }}
            >
              {f.label}
            </button>
          ))}
          {podeExportar && (
            <button
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center rounded-control px-3 text-left text-sm text-text hover:bg-surface-2 focus-visible:bg-surface-2 desktop:min-h-9"
              onClick={() => {
                fechar();
                void pdf();
              }}
            >
              Baixar PDF
            </button>
          )}
        </div>
      )}
    </Dropdown>
  );
}

export function CelulaExecucao({ situacao }: { situacao: string | null | undefined }) {
  const c = classeExecucao(situacao);
  if (!c || !situacao) return <span className="text-faint" title="Ainda não verificado na Centi (Automação → Verificar execução)">—</span>;
  return (
    <Badge tone={TOM[c]} dot>
      {situacao}
    </Badge>
  );
}
