"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_AGENDAS_EXTERNAS } from "@/lib/ics-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { EventoCalendario } from "@/lib/tarefas-core";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { ColorField } from "./ColorField";
import { useConfirmacao } from "./Confirmacao";
import { TextField } from "./Field";
import { IconLink, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { toast } from "./Toast";

export type AgendaCarregada = { id: number; nome: string; url: string; cor: string | null; eventos: EventoCalendario[]; erro: string | null };

/**
 * As AGENDAS EXTERNAS da pessoa no intervalo à vista — carregadas DEPOIS da tela (o calendário nunca espera um servidor de
 * fora); só a resposta do intervalo mais recente vale.
 */
export function useAgendasExternas(de: string, ate: string) {
  const [agendas, setAgendas] = useState<AgendaCarregada[]>([]);
  const [carregando, setCarregando] = useState(false);
  const pedido = useRef(0);
  const recarregar = useCallback(async () => {
    const n = ++pedido.current;
    setCarregando(true);
    try {
      const j = await chamar<{ agendas: AgendaCarregada[] }>(`/api/calendario/externos?de=${de}&ate=${ate}`);
      if (n === pedido.current) setAgendas(j.agendas);
    } catch {
      /* Auxiliar: sem as agendas de fora, o calendário segue. */
    } finally {
      if (n === pedido.current) setCarregando(false);
    }
  }, [de, ate]);
  useEffect(() => {
    void recarregar();
  }, [recarregar]);
  return { agendas, carregando, recarregar };
}

/**
 * O CADASTRO das agendas externas (modal): assinar pelo link `.ics` (Google Agenda: "Endereço secreto no formato iCal";
 * Outlook: "Publicar calendário → ICS"), a cor, e remover. O link é conferido pelo servidor antes de gravar.
 */
export function GerirAgendasExternas({ aberto, onFechar, agendas, onMudou }: { aberto: boolean; onFechar: () => void; agendas: AgendaCarregada[]; onMudou: () => void }) {
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [cor, setCor] = useState("#0ea5e9");
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  const adicionar = async () => {
    setOcupado(true);
    setFalha(null);
    try {
      const j = await chamar<{ eventos: number }>("/api/calendario/externos", "POST", { nome: nome.trim(), url: url.trim(), cor });
      toast.success(`Agenda assinada (${j.eventos} evento(s)).`);
      setNome("");
      setUrl("");
      onMudou();
    } catch (e) {
      setFalha((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const remover = async (a: AgendaCarregada) => {
    if (!(await confirmar({ titulo: `Remover a agenda "${a.nome}"?`, texto: "Os eventos dela saem do seu calendário (nada muda na origem).", confirmar: "Remover", perigo: true }))) return;
    try {
      await chamar(`/api/calendario/externos/${a.id}`, "DELETE");
      onMudou();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const trocarCor = async (a: AgendaCarregada, c: string) => {
    try {
      await chamar(`/api/calendario/externos/${a.id}`, "PATCH", { cor: c });
      onMudou();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const cheio = agendas.length >= MAX_AGENDAS_EXTERNAS;
  return (
    <Modal open={aberto} onClose={onFechar} titulo="Outras agendas" size="md">
      <div className="space-y-5">
        {agendas.length > 0 && (
          <ul className="divide-y divide-border rounded-card border border-border">
            {agendas.map((a) => (
              <li key={a.id} className="flex items-center gap-3 p-2.5">
                <div className="w-24 shrink-0">
                  <ColorField label="" value={a.cor ?? "#64748b"} onChange={(c) => trocarCor(a, c)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-text">{a.nome}</p>
                  <p className="truncate font-mono text-[11px] text-faint" title={a.url}>
                    {a.url}
                  </p>
                  {a.erro ? <p className="text-[11.5px] font-semibold text-[var(--warn)]">{a.erro}</p> : <p className="text-[11.5px] text-muted">{a.eventos.length} evento(s) no período à vista</p>}
                </div>
                <Button variant="ghost" size="sm" aria-label={`Remover ${a.nome}`} icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />} onClick={() => remover(a)} />
              </li>
            ))}
          </ul>
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!cheio && nome.trim() && url.trim()) void adicionar();
          }}
        >
          <p className="text-[13px] font-semibold text-text">Assinar uma agenda</p>
          <p className="text-[12px] text-muted">
            Cole o link <strong>.ics</strong> (ou webcal://) de outra agenda — no Google Agenda, "Endereço secreto no formato iCal"; no Outlook, "Publicar calendário". Os eventos
            aparecem só para você, somente leitura, e atualizam a cada 10 minutos.
          </p>
          <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Ex.: Feriados do Estado" />
          <TextField label="Link da agenda" icon={<IconLink className="h-4 w-4" />} value={url} onChange={(e) => setUrl(e.target.value)} maxLength={1000} placeholder="https://…/basic.ics" inputMode="url" />
          <ColorField value={cor} onChange={setCor} />
          {falha && <Callout kind="danger">{falha}</Callout>}
          {cheio && <Callout kind="info">Limite de {MAX_AGENDAS_EXTERNAS} agendas atingido — remova uma para assinar outra.</Callout>}
          <div className="flex justify-end">
            <Button type="submit" loading={ocupado} disabled={cheio || !nome.trim() || !url.trim()}>
              Assinar
            </Button>
          </div>
        </form>
      </div>
      {confirmacao}
    </Modal>
  );
}
