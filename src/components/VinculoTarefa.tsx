"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { hrefVinculo, ROTULO_VINCULO, TIPOS_VINCULO, type TipoVinculo, type VinculoTarefa as Vinculo } from "@/lib/tarefas-core";
import { Button } from "./Button";
import { IconClose, IconLink } from "./icons";
import { Segmented } from "./Segmented";
import { type OpcaoBusca, SeletorBusca } from "./SeletorBusca";

/** O rótulo do vínculo ("Protocolo 144756/2026"; o alvo excluído depois = "… (excluído)"). */
export const rotuloDoVinculo = (v: Vinculo) => `${ROTULO_VINCULO[v.tipo]} ${v.rotulo ?? `#${v.id} (excluído)`}`;

/**
 * VÍNCULO de uma tarefa com o sistema — um PROTOCOLO, um DFD, um PCA ou um ORÇAMENTO. Ligado: o chip leva ao alvo
 * (protocolo/DFD abrem o banner na Mesa) + desligar. Desligado: "Vincular" abre o tipo (`Segmented`) e a busca
 * (`SeletorBusca` — a busca vai ao servidor, até 50 resultados no escopo do usuário).
 */
export function VinculoTarefa({ valor, onChange, disabled = false }: { valor: Vinculo | null; onChange: (v: Vinculo | null) => void; disabled?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoVinculo>("protocolo");
  const [q, setQ] = useState("");
  const [opcoes, setOpcoes] = useState<(OpcaoBusca & { r: string })[]>([]);
  const [carregando, setCarregando] = useState(false);
  const pedido = useRef(0);

  // A busca vai ao servidor (com uma pausa curta enquanto digita); só vale a resposta MAIS RECENTE.
  useEffect(() => {
    if (!aberto) return;
    const n = ++pedido.current;
    setCarregando(true);
    const t = window.setTimeout(() => {
      chamar<{ opcoes: { id: number; rotulo: string; detalhe: string }[] }>(`/api/tarefas/vinculos?tipo=${tipo}&q=${encodeURIComponent(q)}`)
        .then((j) => n === pedido.current && setOpcoes(j.opcoes.map((o) => ({ valor: String(o.id), rotulo: o.rotulo, detalhe: o.detalhe, r: o.rotulo }))))
        .catch(() => n === pedido.current && setOpcoes([]))
        .finally(() => n === pedido.current && setCarregando(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [aberto, tipo, q]);

  if (valor)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={hrefVinculo(valor)}
          className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-control border border-accent/40 bg-accent-soft px-3 text-[13px] font-semibold text-accent hover:underline lg:min-h-9"
        >
          <IconLink className="h-4 w-4 shrink-0" />
          <span className="truncate">{rotuloDoVinculo(valor)}</span>
        </Link>
        {!disabled && (
          <Button variant="ghost" size="sm" icon={<IconClose className="h-4 w-4" />} onClick={() => onChange(null)}>
            Desvincular
          </Button>
        )}
      </div>
    );
  if (disabled) return <p className="text-[12.5px] text-muted">Sem vínculo.</p>;
  if (!aberto)
    return (
      <Button variant="secondary" size="sm" icon={<IconLink className="h-4 w-4" />} onClick={() => setAberto(true)}>
        Vincular a protocolo, DFD, PCA ou orçamento
      </Button>
    );
  return (
    <div className="space-y-2 rounded-card border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<TipoVinculo>
          ariaLabel="Vincular a"
          value={tipo}
          onChange={(t) => {
            setTipo(t);
            setQ("");
            setOpcoes([]);
          }}
          options={TIPOS_VINCULO.map((t) => ({ value: t, label: ROTULO_VINCULO[t] }))}
        />
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
      <SeletorBusca
        key={tipo}
        opcoes={opcoes}
        valor=""
        ariaLabel={`Escolher ${ROTULO_VINCULO[tipo]}`}
        placeholder={tipo === "protocolo" ? "Nº, Id ou assunto" : tipo === "dfd" ? "Nº do DFD, planejamento ou objeto" : "Nome ou ano"}
        vazio={carregando ? "Buscando…" : "Nada encontrado"}
        onBusca={setQ}
        onChange={(v) => {
          const o = opcoes.find((x) => x.valor === v);
          if (!o) return;
          onChange({ tipo, id: Number(v), rotulo: tipo === "dfd" ? o.r.replace(/^DFD /, "") : o.r });
          setAberto(false);
        }}
      />
    </div>
  );
}
