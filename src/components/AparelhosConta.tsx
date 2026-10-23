"use client";

import { useCallback, useEffect, useState } from "react";
import { emTrava, LIMITE_MAX, LIMITE_MIN, ROTULO_ORIGEM_LIMITE } from "@/lib/acesso-conta-core";
import { baixarComprovanteTermo } from "@/lib/comprovante-termo";
import { dataBR, dataHoraBR, ROTULO_METODO } from "@/lib/termo-uso-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { ErroCarga } from "./ErroCarga";
import { SelectField, TextField } from "./Field";
import { IconCheck, IconDownload, IconLock, IconPencil, IconTermo, IconTrash } from "./icons";
import { CartaoAparelho } from "./NomearAparelho";
import type { DocumentoResumo } from "@/lib/documentos";
import dynamic from "next/dynamic";

const VisualizadorPdf = dynamic(() => import("./DocumentosView").then((m) => m.VisualizadorPdf), { ssr: false });
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";

type Aparelho = { id: number; nome: string; navegador: string; ip: string; criadoEm: string; vistoEm: string | null; teste: boolean };
type Termo = { id: number; versao: number; em: string; metodo: string; codigo: string; teste: boolean; aparelhoNome: string };
type Dados = {
  lista: Aparelho[];
  atualId?: number | null;
  limite: number;
  limiteProprio?: number | null;
  origemLimite: keyof typeof ROTULO_ORIGEM_LIMITE;
  trocaDias: number;
  trocaAte: string | null;
  valem: boolean;
  termos: Termo[];
  /** Pode BAIXAR o comprovante (senão, só visualiza). */
  baixar?: boolean;
};

async function chamar<T>(url: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const r = await fetch(url, { method: metodo, headers: corpo ? { "Content-Type": "application/json" } : undefined, body: corpo ? JSON.stringify(corpo) : undefined, cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || !j.ok) throw new Error(j.error ?? "Falha na operação.");
  return j;
}

/**
 * Os APARELHOS e os TERMOS ACEITOS de uma conta. `admin` = o banner do usuário (o ADM retira qualquer aparelho, muda o
 * limite próprio e libera a troca); sem ele, o Perfil da própria pessoa (renomeia e retira os OUTROS aparelhos).
 */
export function AparelhosConta({ usuarioId, admin = false }: { usuarioId?: number; admin?: boolean }) {
  const url = admin ? `/api/admin/usuarios/${usuarioId}/aparelhos` : "/api/perfil/aparelhos";
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [vendo, setVendo] = useState<Termo | null>(null);
  const [editando, setEditando] = useState<{ id: number; nome: string } | null>(null);
  const [ocupado, setOcupado] = useState<number | string | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  const carregar = useCallback(() => {
    chamar<Dados>(url)
      .then((j) => {
        setD(j);
        setErro(null);
      })
      .catch((e) => setErro((e as Error).message));
  }, [url]);
  useEffect(carregar, [carregar]);
  if (erro && !d) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!d) return <SkeletonLinhas linhas={3} />;

  async function retirar(a: Aparelho) {
    const sim = await confirmar({ titulo: `Retirar “${a.nome}”?`, texto: "As sessões abertas nesse aparelho são encerradas. Para usá-lo de novo, será preciso nomeá-lo outra vez.", confirmar: "Retirar", perigo: true });
    if (!sim) return;
    setOcupado(a.id);
    try {
      if (admin) await chamar(url, "DELETE", { ids: [a.id] });
      else await chamar(`/api/perfil/aparelhos/${a.id}`, "DELETE");
      toast.success("Aparelho retirado.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function renomear() {
    if (!editando) return;
    setOcupado(editando.id);
    try {
      await chamar(`/api/perfil/aparelhos/${editando.id}`, "PATCH", { nome: editando.nome });
      setEditando(null);
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function conta(corpo: { limite?: number | null; liberarTroca?: true }) {
    setOcupado("conta");
    try {
      await chamar(url, "PATCH", corpo);
      toast.success(corpo.liberarTroca ? "Troca de aparelho liberada." : "Limite salvo.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function baixar(t: Termo) {
    setOcupado(`t${t.id}`);
    try {
      await baixarComprovanteTermo(t.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const travado = emTrava(d.trocaAte, Date.now());
  const lotado = d.lista.length >= d.limite;
  const diasRestantes = travado && d.trocaAte ? Math.max(1, Math.ceil((Date.parse(d.trocaAte) - Date.now()) / 86_400_000)) : 0;
  return (
    <div className="space-y-[var(--gap-block)]">
      {confirmacao}
      {vendo && (
        <VisualizadorPdf doc={{ id: vendo.id, nome: `Comprovante — termo de uso v${vendo.versao}`, nomeArquivo: `termo-de-uso-v${vendo.versao}.pdf` } as DocumentoResumo} url={`/api/termo/aceites/${vendo.id}/pdf`} onFechar={() => setVendo(null)} />
      )}
      {!d.valem && <Callout kind="info">As regras de aparelhos ainda não estão em vigor (Configurações → Termo de uso).</Callout>}
      <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-3">
        <StatMini label="Aparelhos vinculados" value={`${d.lista.length} de ${d.limite}`} hint={lotado ? "Limite atingido" : `${d.limite - d.lista.length} vaga(s)`} tone={lotado ? "warn" : "default"} />
        <StatMini label="Limite" value={`${d.limite} aparelho${d.limite === 1 ? "" : "s"}`} hint={ROTULO_ORIGEM_LIMITE[d.origemLimite]} />
        <StatMini
          label="Troca de aparelho"
          value={travado ? "Bloqueada" : "Liberada"}
          hint={travado && d.trocaAte ? `Até ${dataBR(d.trocaAte)} (${diasRestantes} dia${diasRestantes === 1 ? "" : "s"})` : d.trocaDias > 0 ? `Prazo após uma troca: ${d.trocaDias} dia(s)` : "Sem prazo após troca"}
          tone={travado ? "danger" : "ok"}
        />
      </div>
      {admin && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface-2 p-[var(--pad-card)]">
          <div className="w-full sm:w-72">
            <SelectField compacto label="Limite desta pessoa" value={d.limiteProprio ? String(d.limiteProprio) : ""} onChange={(e) => conta({ limite: e.target.value ? Number(e.target.value) : null })} disabled={ocupado === "conta"}>
              <option value="">Do papel / padrão</option>
              {Array.from({ length: LIMITE_MAX - LIMITE_MIN + 1 }, (_, i) => LIMITE_MIN + i).map((n) => (
                <option key={n} value={n}>
                  {n} aparelho{n === 1 ? "" : "s"}
                </option>
              ))}
            </SelectField>
          </div>
          <Button size="sm" variant={travado ? "accent" : "secondary"} disabled={!travado} loading={ocupado === "conta"} onClick={() => conta({ liberarTroca: true })} icon={<IconLock className="h-4 w-4" />}>
            {travado ? "Liberar troca agora" : "Troca liberada"}
          </Button>
        </div>
      )}
      <div className="space-y-2">
        {d.lista.length === 0 && <Callout kind="info">Nenhum aparelho nomeado ainda.</Callout>}
        {d.lista.map((a) =>
          editando?.id === a.id ? (
            <div key={a.id} className="flex flex-wrap items-end gap-2 rounded-card border border-accent bg-surface p-[var(--pad-card)]">
              <div className="min-w-0 flex-1">
                <TextField label="Nome do aparelho" value={editando.nome} maxLength={40} onChange={(e) => setEditando({ id: a.id, nome: e.target.value })} autoFocus />
              </div>
              <Button size="sm" loading={ocupado === a.id} onClick={renomear} icon={<IconCheck className="h-4 w-4" />}>
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <CartaoAparelho
              key={a.id}
              a={a}
              selos={
                <>
                  {a.id === d.atualId && <Badge tone="blue">Este aparelho</Badge>}
                  {a.teste && <Badge tone="amber">Teste</Badge>}
                </>
              }
              acoes={
                <>
                  {!admin && <Button size="xs" variant="icon" aria-label={`Renomear ${a.nome}`} title="Renomear" onClick={() => setEditando({ id: a.id, nome: a.nome })} icon={<IconPencil className="h-4 w-4" />} />}
                  {(admin || a.id !== d.atualId) && (
                    <Button size="xs" variant="icon" aria-label={`Retirar ${a.nome}`} title="Retirar" loading={ocupado === a.id} onClick={() => retirar(a)} icon={<IconTrash className="h-4 w-4" />} />
                  )}
                </>
              }
            />
          ),
        )}
      </div>
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-text-2">
          <IconTermo className="h-4 w-4" /> Termos aceitos
        </p>
        {d.termos.length === 0 && <p className="text-[13px] text-muted">Nenhum termo aceito ainda.</p>}
        {d.termos.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-[var(--pad-card)]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--ok)_12%,var(--surface))] text-[var(--ok)]">
              <IconTermo className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold text-text">
                Versão {t.versao} {t.teste ? <Badge tone="amber">Teste</Badge> : <Badge tone="emerald">Assinado</Badge>}
              </div>
              <div className="truncate text-[12.5px] text-muted">
                {dataHoraBR(t.em)} · {ROTULO_METODO[t.metodo] ?? t.metodo}
                {t.aparelhoNome ? ` · ${t.aparelhoNome}` : ""}
              </div>
              <div className="truncate font-mono text-[11.5px] text-faint">{t.codigo}</div>
            </div>
            <Button size="sm" variant="secondary" loading={ocupado === `t${t.id}`} onClick={() => (admin || d.baixar !== false ? baixar(t) : setVendo(t))} icon={admin || d.baixar !== false ? <IconDownload className="h-4 w-4" /> : <IconTermo className="h-4 w-4" />}>
              {admin || d.baixar !== false ? "Comprovante" : "Ver comprovante"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
