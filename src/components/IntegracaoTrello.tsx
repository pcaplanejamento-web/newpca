"use client";

import { useCallback, useEffect, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { IntegracoesView } from "@/lib/integracoes-core";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import { predicadoBusca } from "@/lib/tabela-filtros";
import type { LigacaoMembro, MembroTrelloLeve } from "@/lib/trello-sync-core";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { Checkbox, PasswordField, SearchField, SelectField, TextField } from "./Field";
import { IconCheck, IconKey, IconRefresh } from "./icons";
import { SeletorCelula } from "./SeletorCelula";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

/** Os campos do Trello no formulário de Integrações (chave pública + token e segredo write-only). */
export type ValorTrello = { ativo: boolean; apiKey: string; token: string; segredo: string };

/**
 * O CARTÃO do Trello em Integrações (conta INSTITUCIONAL): ativar, a chave da aplicação, o token e o segredo (write-only —
 * cifrados no servidor, nunca reexibidos), "Testar conexão" (confirma a conta) e, com a conta confirmada, a ligação das
 * PESSOAS com os membros do Trello (`MembrosTrello`). Controlado: o "Salvar" é o da tela.
 */
export function IntegracaoTrello({
  valor,
  onChange,
  view,
  onTestar,
  testando,
}: {
  valor: ValorTrello;
  onChange: (v: ValorTrello) => void;
  view: IntegracoesView["trello"];
  onTestar: () => void;
  testando: boolean;
}) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <Checkbox label="Ativar a sincronização com o Trello" checked={valor.ativo} onChange={(e) => onChange({ ...valor, ativo: e.target.checked })} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TextField
          label="Chave da aplicação (API key)"
          icon={<IconKey className="h-5 w-5" />}
          value={valor.apiKey}
          onChange={(e) => onChange({ ...valor, apiKey: e.target.value })}
          placeholder="32 caracteres"
          autoComplete="off"
        />
        <PasswordField
          label="Token da conta institucional"
          value={valor.token}
          onChange={(e) => onChange({ ...valor, token: e.target.value })}
          placeholder={view.tokenDefinido ? "•••••• (definido — deixe em branco p/ manter)" : "cole o token"}
          autoComplete="off"
          hint={view.tokenDefinido ? "Já definido. Preencha só para substituir." : "Cifrado no servidor; nunca reexibido."}
        />
        <PasswordField
          label="Segredo da aplicação"
          value={valor.segredo}
          onChange={(e) => onChange({ ...valor, segredo: e.target.value })}
          placeholder={view.segredoDefinido ? "•••••• (definido — deixe em branco p/ manter)" : "cole o segredo"}
          autoComplete="off"
          hint="Confere a assinatura dos avisos que o Trello envia."
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onTestar} loading={testando} icon={<IconRefresh className="h-4 w-4" />}>
          Testar conexão
        </Button>
        <span className="text-[12px] text-muted">
          {view.conta ? (
            <>
              Conta confirmada: <strong className="text-text">{view.conta.nome}</strong> (@{view.conta.usuario})
            </>
          ) : (
            "Salve a chave e o token e teste a conexão para confirmar a conta."
          )}
        </span>
      </div>
      {view.conta && view.ativo && <MembrosTrello />}
    </div>
  );
}

type DadosMembros = { pessoas: Pessoa[]; ligacoes: LigacaoMembro[]; membros: MembroTrelloLeve[]; sugestoes: Record<number, string>; aviso: string | null };
type Linha = { pessoa: Pessoa; ligacao: LigacaoMembro | null; sugestao: string | null };

/**
 * PESSOAS ↔ MEMBROS do Trello: cada pessoa com o membro ligado (escolher grava na hora), a SUGESTÃO pelo nome e "Aceitar N
 * sugestões"; quem não está nas áreas de trabalho da conta liga pelo USUÁRIO do Trello. Quem não tem ligação continua nas
 * tarefas do PCA, mas não aparece como membro no Trello.
 */
export function MembrosTrello() {
  const [dados, setDados] = useState<DadosMembros | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [gravando, setGravando] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");
  const [porUsuario, setPorUsuario] = useState<{ usuarioId: string; usuario: string }>({ usuarioId: "", usuario: "" });
  const carregar = useCallback(() => {
    setFalha(null);
    chamar<DadosMembros>("/api/admin/integracoes/trello/membros")
      .then(setDados)
      .catch((e) => setFalha((e as Error).message));
  }, []);
  useEffect(carregar, [carregar]);

  const gravar = async (ligacoes: { usuarioId: number; membroId?: string | null; usuarioTrello?: string | null }[]) => {
    const ids = ligacoes.map((l) => l.usuarioId);
    setGravando((g) => new Set([...g, ...ids]));
    try {
      const j = await chamar<{ ligacoes: LigacaoMembro[] }>("/api/admin/integracoes/trello/membros", "PUT", { ligacoes });
      setDados((d) => (d ? { ...d, ligacoes: j.ligacoes } : d));
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setGravando((g) => new Set([...g].filter((i) => !ids.includes(i))));
    }
  };

  if (falha && !dados) return <ErroCarga msg={falha} onTentar={carregar} />;
  if (!dados) return <SkeletonLinhas linhas={4} />;

  const opcoes = dados.membros.map((m, i) => ({ id: i + 1, nome: `${m.fullName} (@${m.username})` }));
  const indice = (membroId: string | null | undefined) => {
    const i = dados.membros.findIndex((m) => m.id === membroId);
    return i >= 0 ? i + 1 : null;
  };
  const porPessoa = new Map(dados.ligacoes.map((l) => [l.usuarioId, l]));
  const casa = predicadoBusca(busca);
  const linhas: Linha[] = dados.pessoas
    .filter((p) => !casa || casa([p.nome, p.apelido ?? ""]))
    .map((p) => ({ pessoa: p, ligacao: porPessoa.get(p.id) ?? null, sugestao: porPessoa.has(p.id) ? null : (dados.sugestoes[p.id] ?? null) }));
  const sugeridas = linhas.filter((l) => l.sugestao);
  const nomeMembro = (id: string | null) => dados.membros.find((m) => m.id === id);

  const colunas: Column<Linha>[] = [
    {
      key: "pessoa",
      header: "Pessoa",
      align: "left",
      value: (l) => nomeExibicao(l.pessoa),
      render: (l) => (
        <span className="inline-flex min-w-0 items-center gap-2">
          <Avatar nome={l.pessoa.nome} foto={l.pessoa.foto} size="sm" />
          <span className="truncate" title={l.pessoa.nome}>
            {nomeExibicao(l.pessoa)}
          </span>
        </span>
      ),
    },
    {
      key: "membro",
      header: "Membro do Trello",
      align: "left",
      value: (l) => (l.ligacao ? (l.ligacao.nome ?? l.ligacao.usuarioTrello ?? "") : "Sem ligação"),
      render: (l) => (
        <SeletorCelula
          ariaLabel={`Membro do Trello de ${nomeExibicao(l.pessoa)}`}
          valor={l.ligacao ? (indice(l.ligacao.membroId) ?? -1) : null}
          atual={l.ligacao ? { id: -1, nome: `${l.ligacao.nome ?? ""} (@${l.ligacao.usuarioTrello ?? ""})` } : null}
          opcoes={opcoes}
          vazio="Sem ligação"
          salvando={gravando.has(l.pessoa.id)}
          onChange={(i) => gravar([{ usuarioId: l.pessoa.id, membroId: i ? dados.membros[i - 1]?.id : null }])}
        />
      ),
    },
    {
      key: "sugestao",
      header: "Sugestão",
      value: (l) => (l.sugestao ? "Com sugestão" : "—"),
      render: (l) => {
        const m = nomeMembro(l.sugestao);
        return m ? (
          <Button size="xs" variant="ghost" icon={<IconCheck className="h-3.5 w-3.5" />} onClick={() => gravar([{ usuarioId: l.pessoa.id, membroId: m.id }])}>
            {m.fullName}
          </Button>
        ) : (
          <span className="text-faint">—</span>
        );
      },
    },
  ];

  return (
    <section className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-[14px] font-bold text-text">Pessoas ↔ membros do Trello</h3>
        <SearchField compacto placeholder="Buscar pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} aria-label="Buscar pessoa" />
        {sugeridas.length > 0 && (
          <Button size="sm" variant="secondary" onClick={() => gravar(sugeridas.map((l) => ({ usuarioId: l.pessoa.id, membroId: l.sugestao })))}>
            Aceitar {sugeridas.length} sugest{sugeridas.length === 1 ? "ão" : "ões"}
          </Button>
        )}
      </div>
      {dados.aviso && <Callout kind="warn">{dados.aviso}</Callout>}
      <DataTable
        columns={colunas}
        rows={linhas}
        getKey={(l) => l.pessoa.id}
        pageSize={20}
        density="compact"
        minWidth={520}
        resumo={(ls) => `${ls.length} pessoa(s) · ${ls.filter((l) => l.ligacao).length} ligada(s)`}
      />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const id = Number(porUsuario.usuarioId);
          if (!id || !porUsuario.usuario.trim()) return;
          if (await gravar([{ usuarioId: id, usuarioTrello: porUsuario.usuario.trim() }])) setPorUsuario({ usuarioId: "", usuario: "" });
        }}
      >
        <SelectField label="Ligar pelo usuário do Trello" value={porUsuario.usuarioId} onChange={(e) => setPorUsuario({ ...porUsuario, usuarioId: e.target.value })}>
          <option value="">Escolha a pessoa</option>
          {dados.pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {nomeExibicao(p)}
            </option>
          ))}
        </SelectField>
        <TextField label="Usuário no Trello" value={porUsuario.usuario} onChange={(e) => setPorUsuario({ ...porUsuario, usuario: e.target.value })} placeholder="@usuario" autoComplete="off" />
        <Button type="submit" variant="secondary" disabled={!porUsuario.usuarioId || !porUsuario.usuario.trim()}>
          Ligar
        </Button>
      </form>
    </section>
  );
}
