"use client";

import { useState } from "react";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { EstadoPresenca, StatusPresenca } from "@/lib/presenca-core";
import { ROTULO_STATUS } from "@/lib/presenca-core";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { IconUsers } from "./icons";
import { SeloAoVivo } from "./PresencaGrupo";

type GrupoOnline = {
  id: number;
  nome: string;
  falhou: boolean;
  pessoas: { pessoa: Pessoa; estado: EstadoPresenca; status: StatusPresenca; recado: string }[];
};

/**
 * Armazenamento → ONLINE AGORA (ADM): quem está com o sistema aberto em CADA grupo (pergunta ao objeto de presença de
 * cada grupo — só ao tocar; os invisíveis não aparecem). Fotos com o ponto online/ausente e o total por grupo.
 */
export function OnlineAgoraAdmin() {
  const [dados, setDados] = useState<{ grupos: GrupoOnline[]; truncado: boolean; em: Date } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ver = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const j = await chamar<{ grupos: GrupoOnline[]; truncado: boolean }>("/api/admin/presenca/online");
      setDados({ ...j, em: new Date() });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };
  const total = dados ? new Set(dados.grupos.flatMap((g) => g.pessoas.map((p) => p.pessoa.id))).size : 0;
  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <div className="flex flex-wrap items-center gap-2">
        <IconUsers className="h-4 w-4 text-accent" />
        <p className="flex-1 text-[14px] font-semibold text-text">{dados ? `${total} pessoa${total === 1 ? "" : "s"} online agora` : "Quem está online agora, por grupo"}</p>
        {dados && <SeloAoVivo aoVivo />}
        <Button size="sm" variant={dados ? "secondary" : "primary"} loading={carregando} onClick={ver} title="Perguntar a cada grupo quem está com o sistema aberto">
          {dados ? "Atualizar" : "Ver quem está online"}
        </Button>
      </div>
      {erro && <Callout kind="warn">{erro}</Callout>}
      {dados && (
        <ul className="divide-y divide-border">
          {dados.grupos.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-[10rem] flex-1 text-[13px] font-medium text-text">{g.nome}</span>
              {g.falhou ? (
                <span className="text-[12px] text-[var(--warn)]">não respondeu</span>
              ) : g.pessoas.length === 0 ? (
                <span className="text-[12px] text-faint">ninguém</span>
              ) : (
                <span className="flex flex-wrap items-center gap-1.5">
                  {g.pessoas.map(({ pessoa, estado, status, recado }) => (
                    <span
                      key={pessoa.id}
                      title={`${nomeExibicao(pessoa)} — ${estado === "online" ? "online" : "ausente"}${status !== "disponivel" ? ` · ${ROTULO_STATUS[status]}` : ""}${recado ? ` · ${recado}` : ""}`}
                    >
                      <Avatar nome={pessoa.nome} foto={pessoa.foto} size="sm" presenca={estado} pulsar={estado === "online"} />
                    </span>
                  ))}
                  <span className="ml-1 text-[12px] tabular-nums text-muted">{g.pessoas.length}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {dados?.truncado && <p className="text-[12px] text-muted">Mostrando os 40 primeiros grupos.</p>}
      {dados && <p className="text-[11.5px] text-faint">Consultado às {dados.em.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</p>}
    </div>
  );
}
