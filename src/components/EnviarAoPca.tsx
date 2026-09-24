"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PcaResumo } from "@/lib/dfd";
import { brl, num } from "@/lib/format";
import { motivosNaoEnviar } from "@/lib/pca-core";
import type { ProtocoloResumo } from "@/lib/protocolo";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { labelCls, selectCls } from "./formStyles";
import { IconArrowRight, IconBox } from "./icons";
import { Modal } from "./Modal";
import { toast } from "./Toast";

/** Resultado da ação sobre protocolos na Mesa do PCA (`POST /api/pca/[id]/protocolos`). */
export type ResultadoAcaoPca = { alterados: number; falhas: { numero: string; motivo: string }[] };

/** Envia a ação ao servidor e devolve o resultado (lança em erro de rede/servidor). */
export async function acaoProtocolosPca(pcaId: number, corpo: Record<string, unknown>): Promise<ResultadoAcaoPca> {
  const r = await fetch(`/api/pca/${pcaId}/protocolos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<ResultadoAcaoPca>;
  if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível concluir.");
  return { alterados: j.alterados ?? 0, falhas: j.falhas ?? [] };
}

/**
 * "ENVIAR AO PCA" — a ação da barra de seleção de PROTOCOLOS da Mesa principal: escolhe o PCA (só os de fonte
 * protocolo), mostra por protocolo se pode ir (as MESMAS travas do servidor: ano do PCA, ter DFD, não estar em
 * outro PCA — a situação NÃO interfere) e envia os elegíveis. Enviados SAEM da Mesa principal e vão para a Mesa daquele PCA.
 */
export function EnviarAoPca({
  selecionados,
  pcas,
  onConcluido,
}: {
  selecionados: ProtocoloResumo[];
  pcas: PcaResumo[];
  onConcluido: () => void;
}) {
  const router = useRouter();
  const destinos = useMemo(() => pcas.filter((p) => p.fonte === "protocolo"), [pcas]);
  const [aberto, setAberto] = useState(false);
  const [pcaId, setPcaId] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const pca = destinos.find((p) => p.id === pcaId) ?? null;

  const motivos = (p: ProtocoloResumo) =>
    motivosNaoEnviar({
      anoProtocolo: p.anoPca,
      anoPca: pca?.ano ?? null,
      totalDfds: p.totalDfds,
      fonteProtocolo: true,
      jaEmPca: p.pcaId != null ? (p.pcaNome ?? "outro PCA") : null,
    });
  const elegiveis = pca ? selecionados.filter((p) => motivos(p).length === 0) : [];

  function abrir() {
    // Sugere o PCA do ano dos protocolos (o mais comum); senão o primeiro.
    const anos = selecionados.map((p) => p.anoPca).filter((a): a is number => a != null);
    const ano = anos.sort((a, b) => anos.filter((x) => x === b).length - anos.filter((x) => x === a).length)[0];
    setPcaId((destinos.find((d) => d.ano === ano) ?? destinos[0])?.id ?? null);
    setAberto(true);
  }

  async function enviar() {
    if (!pca || elegiveis.length === 0) return;
    setEnviando(true);
    try {
      const r = await acaoProtocolosPca(pca.id, { acao: "enviar", ids: elegiveis.map((p) => p.id) });
      // Aviso GLOBAL (Toaster): a barra de seleção some ao limpar a seleção — o aviso não pode morar nela.
      if (r.falhas.length) toast.error(`${num(r.alterados)} enviado(s). Não enviados: ${r.falhas.map((f) => `${f.numero} (${f.motivo})`).join(" · ")}`);
      else toast.success(`${num(r.alterados)} protocolo(s) enviado(s) ao ${pca.nome} — estão agora na Mesa do PCA.`);
      setAberto(false);
      onConcluido();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Button variant="secondary" icon={<IconBox className="h-4 w-4" />} onClick={abrir} disabled={destinos.length === 0} title={destinos.length === 0 ? "Nenhum PCA de fonte Protocolos cadastrado" : undefined}>
        Enviar ao PCA
      </Button>
      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        titulo="Enviar ao PCA"
        size="lg"
        bloqueado={enviando}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button icon={<IconArrowRight className="h-4 w-4" />} onClick={enviar} loading={enviando} disabled={!pca || elegiveis.length === 0}>
              Enviar {elegiveis.length} protocolo(s)
            </Button>
          </div>
        }
      >
        <div className="space-y-[var(--gap-block)]">
          <div>
            <label className={labelCls} htmlFor="enviar-pca">
              PCA de destino
            </label>
            <select id="enviar-pca" className={selectCls} value={pcaId ?? ""} onChange={(e) => setPcaId(e.target.value ? Number(e.target.value) : null)}>
              {destinos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                  {d.ano ? ` (${d.ano})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted">
              Os enviados saem da Mesa principal e vão para a Mesa do PCA, onde são incorporados (permanente) ou devolvidos.
            </p>
          </div>
          <ul className="divide-y divide-border rounded-card border border-border">
            {selecionados.map((p) => {
              const m = pca ? motivos(p) : [];
              return (
                <li key={p.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-text">Protocolo {p.numero}</div>
                    <div className="truncate text-xs text-muted">
                      {p.assunto ?? "Sem assunto"} · {num(p.totalDfds)} DFD(s) · {brl(p.valorTotal)}
                    </div>
                    {m.length > 0 && <div className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{m.join(" · ")}</div>}
                  </div>
                  <Badge tone={m.length ? "slate" : "emerald"}>{m.length ? "Não vai" : "Vai"}</Badge>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </>
  );
}
