"use client";

import { useMemo, useState } from "react";
import { num } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { type ListaTarefas, rotuloTicket, type TarefaResumo } from "@/lib/tarefas-core";
import { Button } from "./Button";
import { SearchField } from "./Field";
import { IconDesarquivar, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { toast } from "./Toast";

/**
 * ITENS ARQUIVADOS do quadro (o "Itens arquivados" do Trello, pelo botão no cabeçalho do quadro): `Segmented` **Cartões |
 * Listas**, busca e, por item, pelo PAPEL no quadro: RESTAURAR o cartão (Manipular) ou a lista (Configurar) e EXCLUIR
 * (Excluir — o cartão direto; a lista pela exclusão com escolha, `onExcluirLista`).
 */
export function ItensArquivados({
  aberto,
  tarefas,
  listas,
  pode,
  onFechar,
  onAbrir,
  onExcluirLista,
  onMudou,
}: {
  aberto: boolean;
  /** TODAS as tarefas do quadro (as arquivadas são filtradas aqui). */
  tarefas: TarefaResumo[];
  /** TODAS as listas (as arquivadas são filtradas aqui). */
  listas: ListaTarefas[];
  /** O que o papel permite no quadro. */
  pode: { manipular: boolean; configurar: boolean; excluir: boolean };
  onFechar: () => void;
  /** Abre o detalhe de um cartão arquivado. */
  onAbrir: (id: number) => void;
  onExcluirLista: (id: number) => void;
  onMudou: () => void;
}) {
  const [aba, setAba] = useState<"cartoes" | "listas">("cartoes");
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const nomeLista = useMemo(() => new Map(listas.map((l) => [l.id, l])), [listas]);
  const p = predicadoBusca(busca);
  const casa = (...campos: string[]) => !p || p(campos);
  const cartoes = tarefas.filter((t) => t.arquivada && casa(t.titulo, rotuloTicket(t.ticket)));
  const arquivadas = listas.filter((l) => l.arquivada && casa(l.nome));
  const nCartoes = tarefas.filter((t) => t.arquivada).length;
  const nListas = listas.filter((l) => l.arquivada).length;

  const agir = async (chave: string, fn: () => Promise<unknown>, sucesso: string) => {
    if (ocupado) return;
    setOcupado(chave);
    try {
      await fn();
      toast.success(sucesso);
      onMudou();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const linha = "flex min-h-14 items-center gap-2 rounded-control border border-border bg-surface px-3 py-2";
  return (
    <Modal open={aberto} onClose={onFechar} titulo="Itens arquivados" size="md">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Itens arquivados"
            value={aba}
            onChange={setAba}
            options={[
              { value: "cartoes", label: `Cartões (${num(nCartoes)})` },
              { value: "listas", label: `Listas (${num(nListas)})` },
            ]}
          />
          <div className="min-w-0 flex-1">
            <SearchField compacto placeholder="Buscar arquivados…" value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} aria-label="Buscar arquivados" />
          </div>
        </div>
        {aba === "cartoes" ? (
          cartoes.length ? (
            <ul className="space-y-2">
              {cartoes.map((t) => (
                <li key={t.id} className={linha}>
                  <button type="button" onClick={() => onAbrir(t.id)} className="min-h-11 min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13.5px] font-medium text-text">{t.titulo}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {rotuloTicket(t.ticket)} · {nomeLista.get(t.listaId)?.nome ?? "Lista"}
                    </span>
                  </button>
                  {pode.manipular && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={ocupado === `c${t.id}`}
                      disabled={ocupado != null}
                      icon={<IconDesarquivar className="h-4 w-4" />}
                      onClick={() => agir(`c${t.id}`, () => chamar(`/api/tarefas/${t.id}`, "PATCH", { arquivada: false }), `${rotuloTicket(t.ticket)} restaurada.`)}
                    >
                      Restaurar
                    </Button>
                  )}
                  {pode.excluir && (
                    <Button
                      size="sm"
                      variant="icon"
                      aria-label={`Excluir ${rotuloTicket(t.ticket)}`}
                      disabled={ocupado != null}
                      icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                      onClick={() => agir(`c${t.id}`, () => chamar(`/api/tarefas/${t.id}`, "DELETE"), `${rotuloTicket(t.ticket)} excluída.`)}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-[13px] text-muted">{busca ? "Nenhum cartão arquivado com essa busca." : "Nenhum cartão arquivado."}</p>
          )
        ) : arquivadas.length ? (
          <ul className="space-y-2">
            {arquivadas.map((l) => {
              const n = tarefas.filter((t) => t.listaId === l.id).length;
              return (
                <li key={l.id} className={linha}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-text">{l.nome}</span>
                    <span className="block text-[12px] text-muted">{num(n)} cartão(ões)</span>
                  </span>
                  {pode.configurar && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={ocupado === `l${l.id}`}
                      disabled={ocupado != null}
                      icon={<IconDesarquivar className="h-4 w-4" />}
                      onClick={() => agir(`l${l.id}`, () => chamar(`/api/tarefas/listas/${l.id}`, "PATCH", { arquivada: false }), `Lista "${l.nome}" restaurada.`)}
                    >
                      Restaurar
                    </Button>
                  )}
                  {pode.excluir && (
                    <Button
                      size="sm"
                      variant="icon"
                      aria-label={`Excluir a lista ${l.nome}`}
                      disabled={ocupado != null}
                      icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                      onClick={() => onExcluirLista(l.id)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-8 text-center text-[13px] text-muted">{busca ? "Nenhuma lista arquivada com essa busca." : "Nenhuma lista arquivada."}</p>
        )}
      </div>
    </Modal>
  );
}
