"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import {
  ACOES_DFD_PCA,
  type AcaoDfdPca,
  acaoSugerida,
  localDoProtocolo,
  motivoNaoDevolver,
  motivosNaoEnviar,
  motivosNaoIncorporar,
  ROTULO_ACAO,
} from "@/lib/pca-core";
import type { ItemDfdRow } from "@/lib/dfd";
import type { ProtocoloNaMesa } from "@/lib/mesa-redacao";
import { impactoSaidaPca } from "@/lib/pca-numeracao-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import type { Column } from "./DataTable";
import { DfdsView } from "./DfdsView";
import { acaoProtocolosPca, EnviarAoPca, type ResultadoAcaoPca } from "./EnviarAoPca";
import { selectCls } from "./formStyles";
import { IconCheck, IconTrash, IconUndo } from "./icons";
import { useListasMesa } from "./MesaSistema";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { toast } from "./Toast";

type Escopo = "todos" | "sistema" | "enviados" | "incorporados";

type Props = Omit<ComponentProps<typeof DfdsView>, "modoPca" | "protocolos" | "dfds"> & {
  /** As listas grandes (protocolos + DFDs) num ÚNICO texto (`carregarMesaDoPca` — `mesa-listas.ts`). */
  listas: string;
  pca: { id: number; nome: string; ano: number | null };
  /** Por protocolo: quantos DFDs dele já estão em OUTRO PCA (ficam de fora da incorporação). */
  emOutroPcaPorProtocolo: Record<number, number>;
  /** Por protocolo incorporado: a ação com que os DFDs dele entraram no PCA. */
  acaoPorProtocolo: Record<number, AcaoDfdPca>;
  /** A visão dos MARCADOS está ligada (Configuração do PCA): a lista traz também os da Mesa do sistema com o ano do PCA. */
  marcados?: boolean;
};

const incorporado = (p: ProtocoloNaMesa) => localDoProtocolo(p) === "incorporado";
const ROTULO_ESCOPO: Record<Exclude<Escopo, "todos">, string> = { sistema: "Na Mesa do sistema", enviados: "Enviados", incorporados: "Incorporados" };
const ESCOPO_DO_LOCAL = { sistema: "sistema", enviado: "enviados", incorporado: "incorporados" } as const;

/**
 * Aba MESA do PCA (fonte protocolo) — INDEPENDENTE da Mesa principal: só os protocolos ENVIADOS a este PCA
 * (Mesa principal → barra de seleção → "Enviar ao PCA"), com a MESMA Mesa (Protocolos · DFDs · Itens, Estado,
 * Situação na célula, banners). Escopo **Todos | Enviados | Incorporados**; a seleção de protocolos só tem
 * **Incorporar** (os DFDs e os itens passam a compor o PCA com a ação por protocolo e cada item ganha o SEQUENCIAL
 * único do PCA — o incorporado segue EDITÁVEL: o PCA acompanha) e **Devolver à Mesa** (o enviado e também o incorporado:
 * desincorpora, os nºs dos itens ficam baixados). Na visão Itens, a coluna **Seq. PCA** e a ação **Retirar do PCA**.
 * Com a visão dos **MARCADOS** (Configuração do PCA), a lista traz também os protocolos marcados com o ano do PCA ainda na
 * Mesa do SISTEMA — só uma visão: seguem na Mesa principal, editáveis, e a seleção os envia ("Enviar a este PCA"). A coluna
 * **Local** diz onde cada um está (`localDoProtocolo`).
 */
export function MesaPca({ pca, emOutroPcaPorProtocolo, acaoPorProtocolo, marcados = false, listas, ...mesa }: Props) {
  const { protocolos, dfds } = useListasMesa(listas);
  const router = useRouter();
  const [escopo, setEscopo] = useState<Escopo>("todos");
  const [incorporar, setIncorporar] = useState<ProtocoloNaMesa[] | null>(null);
  const [acoes, setAcoes] = useState<Record<number, AcaoDfdPca>>({});
  const [gravando, setGravando] = useState(false);

  const dfdsPorProto = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of dfds) if (d.protocoloId != null) m.set(d.protocoloId, (m.get(d.protocoloId) ?? 0) + 1);
    return m;
  }, [dfds]);
  const totalDfds = (p: ProtocoloNaMesa) => dfdsPorProto.get(p.id) ?? p.totalDfds;
  const motivosInc = (p: ProtocoloNaMesa) =>
    motivosNaoIncorporar({ enviadoAEste: p.pcaId === pca.id, incorporado: incorporado(p), totalDfds: totalDfds(p), dfdsEmOutroPca: emOutroPcaPorProtocolo[p.id] ?? 0 });

  const motivosEnv = (p: ProtocoloNaMesa) =>
    motivosNaoEnviar({ anoProtocolo: p.anoPca, anoPca: pca.ano, totalDfds: totalDfds(p), fonteProtocolo: true, jaEmPca: null });
  const contagem = useMemo(() => {
    const c = { sistema: 0, enviados: 0, incorporados: 0 };
    for (const p of protocolos) c[ESCOPO_DO_LOCAL[localDoProtocolo(p)]]++;
    return c;
  }, [protocolos]);
  // A visão dos marcados desligada (ou recém-desligada) nunca deixa o escopo preso em "Na Mesa do sistema".
  const escopoEf: Escopo = escopo === "sistema" && !marcados ? "todos" : escopo;
  const protos = useMemo(
    () => (escopoEf === "todos" ? protocolos : protocolos.filter((p) => ESCOPO_DO_LOCAL[localDoProtocolo(p)] === escopoEf)),
    [protocolos, escopoEf],
  );
  const dfdsVis = useMemo(() => {
    if (escopoEf === "todos") return dfds;
    const ids = new Set(protos.map((p) => p.id));
    return dfds.filter((d) => d.protocoloId != null && ids.has(d.protocoloId));
  }, [dfds, protos, escopoEf]);

  const colunaPca: Column<ProtocoloNaMesa> = {
    key: "pca",
    header: marcados ? "Local" : "PCA",
    nowrap: true,
    value: (r) => ({ sistema: "Mesa do sistema", enviado: "Enviado", incorporado: "Incorporado" })[localDoProtocolo(r)],
    render: (r) => {
      const local = localDoProtocolo(r);
      if (local === "sistema") {
        const m = motivosEnv(r);
        return (
          <span title={`Na Mesa do sistema (marcado com ${pca.ano ?? "o ano"}) — ${m.length ? m.join(" · ") : "pronto para enviar a este PCA"}`}>
            <Badge tone="slate">Mesa do sistema</Badge>
          </span>
        );
      }
      if (local === "incorporado") {
        const a = acaoPorProtocolo[r.id];
        return (
          <span title="Incorporado — as alterações no protocolo, nos DFDs e nos itens entram no PCA na hora">
            <Badge tone="blue" dot>
              Incorporado{a ? ` · ${ROTULO_ACAO[a]}` : ""}
            </Badge>
          </span>
        );
      }
      const m = motivosInc(r);
      return (
        <span title={m.length ? m.join("\n") : "Pronto para incorporar"}>
          <Badge tone={m.length ? "slate" : "amber"} dot>
            {marcados ? "Mesa do PCA · Enviado" : "Enviado"}
          </Badge>
        </span>
      );
    },
  };

  /** Executa a ação com trava de duplo clique, aviso global e recarga. */
  async function executar(corpo: Record<string, unknown>, sucesso: (r: ResultadoAcaoPca) => string, limpar?: () => void): Promise<boolean> {
    if (gravando) return false;
    setGravando(true);
    try {
      const r = await acaoProtocolosPca(pca.id, corpo);
      // Fora do escopo, o servidor não devolve o número: vale o da própria linha.
      const numero = (f: { id: number; numero: string }) => f.numero || protocolos.find((p) => p.id === f.id)?.numero || "—";
      if (r.falhas.length) toast.error(`${sucesso(r)} Não aplicados: ${r.falhas.map((f) => `${numero(f)} (${f.motivo})`).join(" · ")}`);
      else toast.success(sucesso(r));
      limpar?.();
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
      return false;
    } finally {
      setGravando(false);
    }
  }

  function abrirIncorporar(sel: ProtocoloNaMesa[]) {
    const eleg = sel.filter((p) => motivosInc(p).length === 0);
    if (eleg.length === 0) {
      toast.error('Nenhum protocolo selecionado pode ser incorporado — passe o mouse em "Enviado" na coluna PCA para ver o motivo.');
      return;
    }
    setAcoes(Object.fromEntries(eleg.map((p) => [p.id, acaoSugerida(p.assunto)])));
    setIncorporar(eleg);
  }

  async function confirmarIncorporar() {
    if (!incorporar) return;
    const alvo = incorporar;
    const okk = await executar(
      { acao: "incorporar", ids: alvo.map((p) => p.id), acoes: Object.fromEntries(alvo.map((p) => [String(p.id), acoes[p.id] ?? acaoSugerida(p.assunto)])) },
      (r) => `${num(r.alterados)} protocolo(s) incorporado(s) ao ${pca.nome}.`,
    );
    if (okk) setIncorporar(null);
  }

  async function retirarItens(sel: ItemDfdRow[], limpar: () => void) {
    const alvo = sel.filter((it) => it.pcaSequencial != null && it.pcaAtivo);
    if (
      !alvo.length ||
      gravando ||
      !confirm(`Retirar ${alvo.length} item(ns) do ${pca.nome}? O nº sequencial fica INATIVO (nunca é reaproveitado) e o item sai do Dashboard.`)
    )
      return;
    setGravando(true);
    try {
      const r = await fetch(`/api/pca/${pca.id}/itens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "retirar", ids: alvo.map((it) => it.id) }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; alterados?: number; falhas?: { motivo: string }[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível retirar.");
      const msg = `${num(j.alterados ?? 0)} item(ns) retirado(s) do PCA.`;
      if (j.falhas?.length) toast.error(`${msg} Não retirados: ${j.falhas.map((f) => f.motivo).join(" · ")}`);
      else toast.success(msg);
      limpar();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível retirar.");
    } finally {
      setGravando(false);
    }
  }

  const colunaSeq: Column<ItemDfdRow> = {
    key: "pcaSeq",
    header: "Seq. PCA",
    nowrap: true,
    numero: (it) => it.pcaSequencial,
    value: (it) => (it.pcaSequencial == null ? "" : String(it.pcaSequencial)),
    render: (it) =>
      it.pcaSequencial == null ? (
        <span className="text-faint">—</span>
      ) : it.pcaAtivo ? (
        <span className="font-semibold tabular-nums text-text">{it.pcaSequencial}</span>
      ) : (
        <span className="tabular-nums text-faint line-through" title="Nº inativo — item retirado do PCA">
          {it.pcaSequencial}
        </span>
      ),
  };

  function devolver(sel: ProtocoloNaMesa[], limpar: () => void) {
    const alvo = sel.filter((p) => motivoNaoDevolver(p, pca.id) == null);
    const inc = alvo.filter(incorporado);
    // O incorporado DESINCORPORA: os DFDs saem do PCA e os itens perdem o nº (a confirmação diz quantos).
    const aviso = inc.length
      ? ` ${inc.length} incorporado(s): ${impactoSaidaPca(pca.nome, inc.reduce((t, p) => t + p.totalItens, 0))}`
      : "";
    if (!alvo.length || !confirm(`Devolver ${alvo.length} protocolo(s) à Mesa principal?${aviso}`)) return;
    void executar({ acao: "devolver", ids: alvo.map((p) => p.id) }, (r) => `${num(r.alterados)} protocolo(s) devolvido(s) à Mesa principal.`, limpar);
  }

  return (
    <>
      <DfdsView
        {...mesa}
        protocolos={protos}
        dfds={dfdsVis}
        modoPca={{
          pcaId: pca.id,
          ferramenta: (
            <Segmented<Escopo>
              value={escopoEf}
              onChange={setEscopo}
              ariaLabel="Protocolos da Mesa do PCA"
              options={[
                { value: "todos", label: `Todos (${protocolos.length})` },
                ...(marcados ? [{ value: "sistema" as const, label: `${ROTULO_ESCOPO.sistema} (${contagem.sistema})` }] : []),
                { value: "enviados", label: `${ROTULO_ESCOPO.enviados} (${contagem.enviados})` },
                { value: "incorporados", label: `${ROTULO_ESCOPO.incorporados} (${contagem.incorporados})` },
              ]}
            />
          ),
          colunasProtocolo: [colunaPca],
          rodapeProtocolos: (linhas) =>
            `${linhas.length} protocolo${linhas.length === 1 ? "" : "s"} · ${num(linhas.reduce((s, p) => s + p.totalDfds, 0))} DFDs · ${brl(
              linhas.reduce((s, p) => s + p.valorTotal, 0),
            )}`,
          // Incorporar/Devolver = Manipular no PCA; "Enviar a este PCA" (os marcados da Mesa do sistema) = Manipular nas duas.
          acoesProtocolos: mesa.pode.pca.manipular
            ? (sel, limpar) => {
                const noSistema = mesa.pode.sistema.manipular ? sel.filter((p) => localDoProtocolo(p) === "sistema") : [];
                const n = sel.filter((p) => localDoProtocolo(p) === "enviado").length;
                const devolviveis = sel.filter((p) => localDoProtocolo(p) !== "sistema").length;
                const pcaFixo = mesa.pcas?.find((x) => x.id === pca.id);
                if (devolviveis === 0 && noSistema.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-2">
                    {noSistema.length > 0 && pcaFixo && <EnviarAoPca selecionados={noSistema} pcas={[pcaFixo]} pcaFixo={pcaFixo} onConcluido={limpar} />}
                    {n > 0 && (
                      <Button icon={<IconCheck className="h-4 w-4" />} onClick={() => abrirIncorporar(sel)} disabled={gravando}>
                        Incorporar ({n})
                      </Button>
                    )}
                    {devolviveis > 0 && (
                      <Button variant="secondary" icon={<IconUndo className="h-4 w-4" />} onClick={() => devolver(sel, limpar)} loading={gravando}>
                        Devolver à Mesa ({devolviveis})
                      </Button>
                    )}
                  </div>
                );
              }
            : undefined,
          colunasItens: [colunaSeq],
          // Retirar itens do PCA = Excluir no PCA.
          acoesItens: mesa.pode.pca.excluir
            ? (sel, limpar) => {
                const n = sel.filter((it) => it.pcaSequencial != null && it.pcaAtivo).length;
                return n > 0 ? (
                  <Button variant="danger" icon={<IconTrash className="h-4 w-4" />} onClick={() => void retirarItens(sel, limpar)} loading={gravando}>
                    Retirar do PCA ({n})
                  </Button>
                ) : null;
              }
            : undefined,
        }}
      />

      <Modal
        open={!!incorporar}
        onClose={() => setIncorporar(null)}
        titulo={`Incorporar ao ${pca.nome}`}
        size="lg"
        bloqueado={gravando}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIncorporar(null)} disabled={gravando}>
              Cancelar
            </Button>
            <Button icon={<IconCheck className="h-4 w-4" />} onClick={confirmarIncorporar} loading={gravando}>
              Incorporar {incorporar?.length ?? 0} protocolo(s)
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Os DFDs (e os itens) de cada protocolo passam a compor o PCA com a ação escolhida: <b>Incorporar</b> (DFD novo),{" "}
            <b>Substituir</b> (troca o DFD de mesmo nº de planejamento) ou <b>Excluir</b> (retira o DFD de mesmo planejamento). A incorporação é{" "}
            <b>permanente</b>: cada item ganha um <b>nº sequencial único no PCA</b> e o protocolo, os DFDs e os itens ficam{" "}
            <b>somente leitura</b> (a situação e o responsável seguem editáveis).
          </p>
          <ul className="divide-y divide-border rounded-card border border-border">
            {(incorporar ?? []).map((p) => (
              <li key={p.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-text">Protocolo {p.numero}</div>
                  <div className="truncate text-xs text-muted">
                    {p.assunto ?? "Sem assunto"} · {num(totalDfds(p))} DFD(s) · {brl(p.valorTotal)}
                    {(emOutroPcaPorProtocolo[p.id] ?? 0) > 0 ? ` · ${emOutroPcaPorProtocolo[p.id]} já em outro PCA (ficam de fora)` : ""}
                  </div>
                </div>
                <select
                  className={`${selectCls} sm:w-44`}
                  value={acoes[p.id] ?? "incorporar"}
                  onChange={(e) => setAcoes((a) => ({ ...a, [p.id]: e.target.value as AcaoDfdPca }))}
                  aria-label={`Ação do protocolo ${p.numero}`}
                  disabled={gravando}
                >
                  {ACOES_DFD_PCA.map((a) => (
                    <option key={a} value={a}>
                      {ROTULO_ACAO[a]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
}
