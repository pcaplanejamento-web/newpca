"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import { ACOES_DFD_PCA, type AcaoDfdPca, acaoSugerida, motivoNaoDevolver, motivosNaoIncorporar, ROTULO_ACAO } from "@/lib/pca-core";
import type { ProtocoloResumo } from "@/lib/protocolo";
import { Badge } from "./Badge";
import { Button } from "./Button";
import type { Column } from "./DataTable";
import { DfdsView } from "./DfdsView";
import { acaoProtocolosPca, type ResultadoAcaoPca } from "./EnviarAoPca";
import { selectCls } from "./formStyles";
import { IconUndo, IconCheck, IconLockOpen } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { toast } from "./Toast";

type Escopo = "todos" | "enviados" | "incorporados";

type Props = Omit<ComponentProps<typeof DfdsView>, "modoPca"> & {
  pca: { id: number; nome: string; ano: number | null };
  /** Por protocolo: quantos DFDs dele já estão em OUTRO PCA (ficam de fora da incorporação). */
  emOutroPcaPorProtocolo: Record<number, number>;
  /** Por protocolo incorporado: a ação com que os DFDs dele entraram no PCA. */
  acaoPorProtocolo: Record<number, AcaoDfdPca>;
};

const incorporado = (p: ProtocoloResumo) => p.pcaIncorporadoEm != null;

/**
 * Aba MESA do PCA (fonte protocolo) — INDEPENDENTE da Mesa principal: só os protocolos ENVIADOS a este PCA
 * (Mesa principal → barra de seleção → "Enviar ao PCA"), com a MESMA Mesa (Protocolos · DFDs · Itens, Estado,
 * Situação na célula, banners). Escopo **Todos | Enviados | Incorporados** e as ações da seleção:
 * **Incorporar** (os DFDs e os itens passam a compor o PCA com a ação por protocolo — a partir daí protocolo,
 * DFDs e itens ficam TRAVADOS), **Desincorporar** (destrava) e **Devolver à Mesa** (só o não incorporado).
 */
export function MesaPca({ pca, emOutroPcaPorProtocolo, acaoPorProtocolo, protocolos, dfds, ...mesa }: Props) {
  const router = useRouter();
  const [escopo, setEscopo] = useState<Escopo>("todos");
  const [incorporar, setIncorporar] = useState<ProtocoloResumo[] | null>(null);
  const [acoes, setAcoes] = useState<Record<number, AcaoDfdPca>>({});
  const [gravando, setGravando] = useState(false);

  const dfdsPorProto = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of dfds) if (d.protocoloId != null) m.set(d.protocoloId, (m.get(d.protocoloId) ?? 0) + 1);
    return m;
  }, [dfds]);
  const totalDfds = (p: ProtocoloResumo) => dfdsPorProto.get(p.id) ?? p.totalDfds;
  const motivosInc = (p: ProtocoloResumo) =>
    motivosNaoIncorporar({ enviadoAEste: p.pcaId === pca.id, incorporado: incorporado(p), totalDfds: totalDfds(p), dfdsEmOutroPca: emOutroPcaPorProtocolo[p.id] ?? 0 });

  const nIncorporados = useMemo(() => protocolos.filter(incorporado).length, [protocolos]);
  const protos = useMemo(
    () => (escopo === "todos" ? protocolos : protocolos.filter((p) => incorporado(p) === (escopo === "incorporados"))),
    [protocolos, escopo],
  );
  const dfdsVis = useMemo(() => {
    if (escopo === "todos") return dfds;
    const ids = new Set(protos.map((p) => p.id));
    return dfds.filter((d) => d.protocoloId != null && ids.has(d.protocoloId));
  }, [dfds, protos, escopo]);

  const colunaPca: Column<ProtocoloResumo> = {
    key: "pca",
    header: "PCA",
    nowrap: true,
    value: (r) => (incorporado(r) ? "Incorporado" : "Enviado"),
    render: (r) => {
      if (incorporado(r)) {
        const a = acaoPorProtocolo[r.id];
        return (
          <span title="Protocolo, DFDs e itens travados enquanto incorporado">
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
            Enviado
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
      if (r.falhas.length) toast.error(`${sucesso(r)} Não aplicados: ${r.falhas.map((f) => `${f.numero} (${f.motivo})`).join(" · ")}`);
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

  function abrirIncorporar(sel: ProtocoloResumo[]) {
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

  function desincorporar(sel: ProtocoloResumo[], limpar: () => void) {
    const alvo = sel.filter(incorporado);
    if (!alvo.length || !confirm(`Desincorporar ${alvo.length} protocolo(s)? Os DFDs saem do ${pca.nome} e voltam a ser editáveis.`)) return;
    void executar({ acao: "desincorporar", ids: alvo.map((p) => p.id) }, (r) => `${num(r.alterados)} protocolo(s) desincorporado(s).`, limpar);
  }

  function devolver(sel: ProtocoloResumo[], limpar: () => void) {
    const alvo = sel.filter((p) => motivoNaoDevolver(p, pca.id) == null);
    if (!alvo.length || !confirm(`Devolver ${alvo.length} protocolo(s) à Mesa principal?`)) return;
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
              value={escopo}
              onChange={setEscopo}
              ariaLabel="Protocolos da Mesa do PCA"
              options={[
                { value: "todos", label: `Todos (${protocolos.length})` },
                { value: "enviados", label: `Enviados (${protocolos.length - nIncorporados})` },
                { value: "incorporados", label: `Incorporados (${nIncorporados})` },
              ]}
            />
          ),
          colunasProtocolo: [colunaPca],
          rodapeProtocolos: (linhas) =>
            `${linhas.length} protocolo${linhas.length === 1 ? "" : "s"} · ${num(linhas.reduce((s, p) => s + p.totalDfds, 0))} DFDs · ${brl(
              linhas.reduce((s, p) => s + p.valorTotal, 0),
            )}`,
          acoesProtocolos: mesa.podeEditar
            ? (sel, limpar) => {
                const nInc = sel.filter((p) => !incorporado(p)).length;
                const nDes = sel.length - nInc;
                return (
                  <div className="flex flex-wrap gap-2">
                    {nInc > 0 && (
                      <Button icon={<IconCheck className="h-4 w-4" />} onClick={() => abrirIncorporar(sel)} disabled={gravando}>
                        Incorporar ({nInc})
                      </Button>
                    )}
                    {nDes > 0 && (
                      <Button variant="secondary" icon={<IconLockOpen className="h-4 w-4" />} onClick={() => desincorporar(sel, limpar)} loading={gravando}>
                        Desincorporar ({nDes})
                      </Button>
                    )}
                    {nInc > 0 && (
                      <Button variant="secondary" icon={<IconUndo className="h-4 w-4" />} onClick={() => devolver(sel, limpar)} disabled={gravando}>
                        Devolver à Mesa ({nInc})
                      </Button>
                    )}
                  </div>
                );
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
            <b>Substituir</b> (troca o DFD de mesmo nº de planejamento) ou <b>Excluir</b> (retira o DFD de mesmo planejamento). Enquanto
            incorporado, o protocolo, os DFDs e os itens ficam <b>somente leitura</b> (a situação e o responsável seguem editáveis).
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
