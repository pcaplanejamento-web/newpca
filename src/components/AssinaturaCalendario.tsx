"use client";

import { useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { BotaoCopiar } from "./BotaoCopiar";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { IconDownload, IconLink } from "./icons";
import { toast } from "./Toast";

/**
 * EXPORTAR e ASSINAR o calendário (a barra do módulo): **"Baixar .ics"** (os eventos À VISTA — `onExportar`) e o **link de
 * assinatura** — o Google Agenda, o Outlook e o celular assinam e sincronizam sozinhos (só leitura; o que a pessoa vê,
 * sem o que ocultou). O link aparece UMA vez ao ser gerado (o banco guarda só o hash): gerar de novo invalida o anterior;
 * "Desligar" corta os aplicativos que assinavam.
 */
export function AssinaturaCalendario({ ativa: ativaInicial, onExportar, nEventos }: { ativa: boolean; onExportar: () => void; nEventos: number }) {
  const [ativa, setAtiva] = useState(ativaInicial);
  const [url, setUrl] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

  const gerar = async () => {
    if (ativa && !(await confirmar({ titulo: "Gerar um link novo?", texto: "O link atual deixa de funcionar — os aplicativos que o assinam precisam do novo.", confirmar: "Gerar novo" }))) return;
    setOcupado(true);
    try {
      const j = await chamar<{ token: string }>("/api/calendario/assinatura", "POST");
      setUrl(`${window.location.origin}/api/calendario/ics/${j.token}.ics`);
      setAtiva(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const desligar = async () => {
    if (!(await confirmar({ titulo: "Desligar o link de assinatura?", texto: "Os aplicativos que assinam o calendário param de receber os eventos.", confirmar: "Desligar", perigo: true }))) return;
    setOcupado(true);
    try {
      await chamar("/api/calendario/assinatura", "DELETE");
      setAtiva(false);
      setUrl(null);
      toast.success("Link de assinatura desligado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="space-y-2 rounded-card border border-border bg-surface p-2" aria-label="Exportar e assinar">
      <p className="px-1 text-[12px] font-semibold text-text-2">Exportar e assinar</p>
      <Button variant="secondary" size="sm" className="w-full" icon={<IconDownload className="h-4 w-4" />} disabled={!nEventos} onClick={onExportar}>
        Baixar .ics ({nEventos})
      </Button>
      {url ? (
        <div className="space-y-1.5 rounded-control bg-surface-2 p-2">
          <p className="text-[11.5px] text-muted">Copie agora — o link só aparece uma vez. Cole em "Adicionar agenda por URL" no Google Agenda ou no Outlook.</p>
          <p className="break-all font-mono text-[10.5px] text-text-2">{url}</p>
          <BotaoCopiar texto={url} rotulo="Copiar link" />
        </div>
      ) : (
        <p className="px-1 text-[11.5px] text-muted">{ativa ? "Link de assinatura ativo." : "Assine no Google Agenda, Outlook ou celular."}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button variant="ghost" size="sm" icon={<IconLink className="h-4 w-4" />} loading={ocupado} onClick={gerar}>
          {ativa ? "Gerar novo link" : "Gerar link"}
        </Button>
        {ativa && (
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={desligar}>
            Desligar
          </Button>
        )}
      </div>
      {confirmacao}
    </section>
  );
}
