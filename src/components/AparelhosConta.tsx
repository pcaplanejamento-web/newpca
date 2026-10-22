"use client";

import { useCallback, useEffect, useState } from "react";
import { emTrava } from "@/lib/acesso-conta-core";
import { baixarComprovanteTermo } from "@/lib/comprovante-termo";
import { dataBR, dataHoraBR, ROTULO_METODO } from "@/lib/termo-uso-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { ErroCarga } from "./ErroCarga";
import { SelectField, TextField } from "./Field";
import { IconCheck, IconDownload, IconPencil, IconTermo, IconTrash } from "./icons";
import { LinhaAparelho } from "./NomearAparelho";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

type Aparelho = { id: number; nome: string; navegador: string; ip: string; criadoEm: string; vistoEm: string | null; teste: boolean };
type Termo = { id: number; versao: number; em: string; metodo: string; codigo: string; teste: boolean; aparelhoNome: string };
type Dados = { lista: Aparelho[]; atualId?: number | null; limite: number; limiteProprio?: number | null; padrao?: number; trocaAte: string | null; termos: Termo[] };

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
  return (
    <div className="space-y-5">
      {confirmacao}
      <div className="space-y-3">
        <p className="text-[13px] text-muted">
          {d.lista.length} de {d.limite} aparelho(s) vinculado(s).
          {travado && d.trocaAte ? ` Troca de aparelho bloqueada até ${dataBR(d.trocaAte)}.` : ""}
        </p>
        {admin && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <SelectField label="Limite desta pessoa" compacto value={d.limiteProprio ? String(d.limiteProprio) : ""} onChange={(e) => conta({ limite: e.target.value ? Number(e.target.value) : null })} disabled={ocupado === "conta"}>
                <option value="">O do papel / padrão</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </SelectField>
            </div>
            {travado && (
              <Button size="sm" variant="secondary" loading={ocupado === "conta"} onClick={() => conta({ liberarTroca: true })}>
                Liberar troca
              </Button>
            )}
          </div>
        )}
        {d.lista.length === 0 && <Callout kind="info">Nenhum aparelho nomeado ainda.</Callout>}
        {d.lista.map((a) =>
          editando?.id === a.id ? (
            <div key={a.id} className="flex items-end gap-2">
              <div className="flex-1">
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
            <LinhaAparelho
              key={a.id}
              a={a}
              extra={
                <div className="flex shrink-0 items-center gap-1">
                  {a.id === d.atualId && <Badge tone="blue">Este aparelho</Badge>}
                  {a.teste && <Badge tone="amber">Teste</Badge>}
                  {!admin && (
                    <Button size="xs" variant="icon" aria-label={`Renomear ${a.nome}`} title="Renomear" onClick={() => setEditando({ id: a.id, nome: a.nome })} icon={<IconPencil className="h-4 w-4" />} />
                  )}
                  {(admin || a.id !== d.atualId) && (
                    <Button size="xs" variant="icon" aria-label={`Retirar ${a.nome}`} title="Retirar" loading={ocupado === a.id} onClick={() => retirar(a)} icon={<IconTrash className="h-4 w-4" />} />
                  )}
                </div>
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
          <div key={t.id} className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-text">
                Versão {t.versao} {t.teste && <Badge tone="amber">Teste</Badge>}
              </div>
              <div className="truncate text-[12px] text-muted">
                {dataHoraBR(t.em)} · {ROTULO_METODO[t.metodo] ?? t.metodo}
                {t.aparelhoNome ? ` · ${t.aparelhoNome}` : ""} · <span className="font-mono">{t.codigo}</span>
              </div>
            </div>
            <Button size="sm" variant="secondary" loading={ocupado === `t${t.id}`} onClick={() => baixar(t)} icon={<IconDownload className="h-4 w-4" />}>
              Comprovante
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
