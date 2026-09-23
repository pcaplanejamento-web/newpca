"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import { ACOES_DFD_PCA, type AcaoDfdPca, acaoSugerida, motivosNaoMover, ROTULO_ACAO } from "@/lib/pca-core";
import type { ProtocoloResumo } from "@/lib/protocolo";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Badge } from "./Badge";
import { Button } from "./Button";
import type { Column } from "./DataTable";
import { DfdsView } from "./DfdsView";
import { selectCls } from "./formStyles";
import { IconArrowRight, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";

type Escopo = "todos" | "neste";

type Props = Omit<ComponentProps<typeof DfdsView>, "modoPca"> & {
  pca: { id: number; nome: string; ano: number | null };
  /** Protocolos com DFD neste PCA. */
  protocolosNoPca: number[];
  /** DFDs vinculados a este PCA (inclusive os sem protocolo, do legado). */
  dfdsNoPca: number[];
  /** Por protocolo: quantos DFDs dele já estão em OUTRO PCA. */
  emOutroPcaPorProtocolo: Record<number, number>;
};

/**
 * Aba MESA do PCA (fonte protocolo): a MESMA Mesa (Protocolos · DFDs · Itens — Estado, Situação na
 * célula, banners) restrita aos protocolos do ANO do PCA, com o seletor **Todos | Neste PCA** e as ações
 * da seleção: **Mover para o PCA** (vincula os DFDs; a ação de cada protocolo é sugerida pelo assunto e
 * editável) e **Retirar do PCA**. As travas (`motivosNaoMover`) aparecem na coluna "PCA".
 */
export function MesaPca({ pca, protocolosNoPca, dfdsNoPca, emOutroPcaPorProtocolo, protocolos, dfds, situacoes = [], ...mesa }: Props) {
  const router = useRouter();
  const [escopo, setEscopo] = useState<Escopo>("todos");
  const [mover, setMover] = useState<ProtocoloResumo[] | null>(null);
  const [acoes, setAcoes] = useState<Record<number, AcaoDfdPca>>({});
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);

  const noPca = useMemo(() => new Set(protocolosNoPca), [protocolosNoPca]);
  const dfdNoPca = useMemo(() => new Set(dfdsNoPca), [dfdsNoPca]);
  const sit = useMemo(() => new Map(situacoes.map((s) => [s.id, s])), [situacoes]);
  const dfdsPorProto = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of dfds) if (d.protocoloId != null) m.set(d.protocoloId, (m.get(d.protocoloId) ?? 0) + 1);
    return m;
  }, [dfds]);

  const motivos = (p: ProtocoloResumo) => {
    const s = p.situacaoId != null ? sit.get(p.situacaoId) : undefined;
    return motivosNaoMover({
      situacaoPermite: s ? s.permiteMoverPca : null,
      situacaoNome: s?.nome,
      anoProtocolo: p.anoPca,
      anoPca: pca.ano,
      totalDfds: dfdsPorProto.get(p.id) ?? p.totalDfds,
      dfdsEmOutroPca: emOutroPcaPorProtocolo[p.id] ?? 0,
      fonteProtocolo: true,
    });
  };

  const doAno = useMemo(() => protocolos.filter((p) => noPca.has(p.id) || (pca.ano != null && p.anoPca === pca.ano)), [protocolos, noPca, pca.ano]);
  const nesse = useMemo(() => doAno.filter((p) => noPca.has(p.id)), [doAno, noPca]);
  const protos = escopo === "todos" ? doAno : nesse;
  const idsProto = useMemo(() => new Set(protos.map((p) => p.id)), [protos]);
  const dfdsVis = useMemo(
    () => dfds.filter((d) => (d.protocoloId != null && idsProto.has(d.protocoloId)) || (escopo === "neste" && dfdNoPca.has(d.id))),
    [dfds, idsProto, escopo, dfdNoPca],
  );

  const colunaPca: Column<ProtocoloResumo> = {
    key: "pca",
    header: "PCA",
    nowrap: true,
    value: (r) => (noPca.has(r.id) ? "Neste PCA" : motivos(r).length ? "Bloqueado" : "Elegível"),
    render: (r) => {
      if (noPca.has(r.id)) return <Badge tone="blue">Neste PCA</Badge>;
      const m = motivos(r);
      return m.length ? (
        <span title={m.join("\n")}>
          <Badge tone="slate">Bloqueado</Badge>
        </span>
      ) : (
        <Badge tone="emerald">Elegível</Badge>
      );
    },
  };

  function abrirMover(sel: ProtocoloResumo[]) {
    const eleg = sel.filter((p) => !noPca.has(p.id) && motivos(p).length === 0);
    if (eleg.length === 0) {
      setAviso({ kind: "danger", texto: "Nenhum protocolo selecionado pode ser movido — veja o motivo na coluna PCA (passe o mouse em \"Bloqueado\")." });
      return;
    }
    setAcoes(Object.fromEntries(eleg.map((p) => [p.id, acaoSugerida(p.assunto)])));
    setMover(eleg);
  }

  async function confirmarMover() {
    if (!mover) return;
    setGravando(true);
    try {
      // A ação escolhida por protocolo vale para cada DFD dele.
      const porDfd: Record<string, AcaoDfdPca> = {};
      for (const d of dfds) if (d.protocoloId != null && acoes[d.protocoloId]) porDfd[String(d.id)] = acoes[d.protocoloId];
      const r = await fetch(`/api/pca/${pca.id}/dfds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocoloIds: mover.map((p) => p.id), acoes: porDfd }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; vinculados?: number; falhas?: { numero: string; motivo: string }[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível mover.");
      const f = j.falhas ?? [];
      setAviso(
        f.length
          ? { kind: "danger", texto: `${num(j.vinculados ?? 0)} DFD(s) movidos. Não movidos: ${f.map((x) => `${x.numero} (${x.motivo})`).join(" · ")}` }
          : { kind: "ok", texto: `${num(j.vinculados ?? 0)} DFD(s) de ${mover.length} protocolo(s) movidos para o ${pca.nome}.` },
      );
      setMover(null);
      router.refresh();
    } catch (e) {
      setAviso({ kind: "danger", texto: e instanceof Error ? e.message : "Não foi possível mover." });
    } finally {
      setGravando(false);
    }
  }

  async function retirar(sel: ProtocoloResumo[], limpar: () => void) {
    const alvo = sel.filter((p) => noPca.has(p.id));
    if (alvo.length === 0) return;
    if (!confirm(`Retirar ${alvo.length} protocolo(s) (e os DFDs deles) do ${pca.nome}?`)) return;
    const r = await fetch(`/api/pca/${pca.id}/dfds`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocoloIds: alvo.map((p) => p.id) }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; retirados?: number };
    setAviso(r.ok && j.ok ? { kind: "ok", texto: `${num(j.retirados ?? 0)} DFD(s) retirados do PCA.` } : { kind: "danger", texto: j.error ?? "Não foi possível retirar." });
    limpar();
    router.refresh();
  }

  return (
    <>
      <DfdsView
        {...mesa}
        protocolos={protos}
        dfds={dfdsVis}
        situacoes={situacoes}
        modoPca={{
          ferramenta: (
            <Segmented<Escopo>
              value={escopo}
              onChange={setEscopo}
              options={[
                { value: "todos", label: `Todos (${doAno.length})` },
                { value: "neste", label: `Neste PCA (${nesse.length})` },
              ]}
            />
          ),
          colunasProtocolo: [colunaPca],
          rodapeProtocolos: (linhas) =>
            `${linhas.length} protocolo${linhas.length === 1 ? "" : "s"} · ${num(linhas.reduce((s, p) => s + p.totalDfds, 0))} DFDs · ${brl(
              linhas.reduce((s, p) => s + p.valorTotal, 0),
            )} · a situação define a elegibilidade e a camada — altere direto na coluna Situação`,
          acoesProtocolos: mesa.podeEditar
            ? (sel, limpar) => {
                const podeMover = sel.some((p) => !noPca.has(p.id));
                const podeRetirar = sel.some((p) => noPca.has(p.id));
                return (
                  <div className="flex flex-wrap gap-2">
                    {podeMover && (
                      <Button icon={<IconArrowRight className="h-4 w-4" />} onClick={() => abrirMover(sel)}>
                        Mover para o PCA
                      </Button>
                    )}
                    {podeRetirar && (
                      <Button variant="secondary" icon={<IconTrash className="h-4 w-4" />} onClick={() => retirar(sel, limpar)}>
                        Retirar do PCA
                      </Button>
                    )}
                  </div>
                );
              }
            : undefined,
        }}
      />

      <Modal
        open={!!mover}
        onClose={() => setMover(null)}
        titulo={`Mover para o ${pca.nome}`}
        size="lg"
        bloqueado={gravando}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMover(null)} disabled={gravando}>
              Cancelar
            </Button>
            <Button onClick={confirmarMover} loading={gravando}>
              Mover {mover?.length ?? 0} protocolo(s)
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Os DFDs de cada protocolo entram no PCA com a ação escolhida: <b>Incorporar</b> (DFD novo), <b>Substituir</b> (troca o DFD
            do PCA com o mesmo nº de planejamento) ou <b>Excluir</b> (retira do PCA o DFD de mesmo planejamento). A sugestão vem do
            assunto do protocolo.
          </p>
          <ul className="divide-y divide-border rounded-card border border-border">
            {(mover ?? []).map((p) => (
              <li key={p.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-text">Protocolo {p.numero}</div>
                  <div className="truncate text-xs text-muted">
                    {p.assunto ?? "Sem assunto"} · {num(dfdsPorProto.get(p.id) ?? p.totalDfds)} DFD(s) · {brl(p.valorTotal)}
                    {(emOutroPcaPorProtocolo[p.id] ?? 0) > 0 ? ` · ${emOutroPcaPorProtocolo[p.id]} já em outro PCA (ficam de fora)` : ""}
                  </div>
                </div>
                <select
                  className={`${selectCls} sm:w-44`}
                  value={acoes[p.id] ?? "incorporar"}
                  onChange={(e) => setAcoes((a) => ({ ...a, [p.id]: e.target.value as AcaoDfdPca }))}
                  aria-label={`Ação do protocolo ${p.numero}`}
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

      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Pronto" : "Atenção"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 6000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}
    </>
  );
}
