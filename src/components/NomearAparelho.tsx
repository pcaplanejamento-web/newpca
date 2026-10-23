"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { motivoNomeAparelho, NOME_APARELHO_MAX } from "@/lib/acesso-conta-core";
import type { EstadoAparelhos } from "@/lib/aparelhos";
import { dataBR, dataHoraBR } from "@/lib/termo-uso-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { ErroAuth } from "./CartaoAuth";
import { Checkbox, TextField } from "./Field";
import { IconAparelho, IconArrowRight, IconLock, IconLogout } from "./icons";
import { Modal } from "./Modal";

export type AparelhoCartao = { nome: string; navegador: string; ip: string; vistoEm: string | null; criadoEm: string };

/**
 * O CARTÃO de um aparelho vinculado: ícone, nome, os selos (`selos`), o navegador, o último uso, o 1º acesso e o IP — e as
 * ações à direita (`acoes`). `marcado` = escolhido (ex.: para retirar na troca).
 */
export function CartaoAparelho({ a, selos, acoes, marcado = false }: { a: AparelhoCartao; selos?: ReactNode; acoes?: ReactNode; marcado?: boolean }) {
  return (
    <div
      className={`flex min-w-0 items-start gap-3 rounded-card border p-[var(--pad-card)] transition-colors ${marcado ? "border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_6%,var(--surface))]" : "border-border bg-surface"}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-accent">
        <IconAparelho className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-[15px] font-semibold text-text">{a.nome}</span>
          {selos}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
          <dt className="text-muted">Navegador</dt>
          <dd className="min-w-0 truncate text-text-2">{a.navegador || "—"}</dd>
          <dt className="text-muted">Último uso</dt>
          <dd className="min-w-0 truncate text-text-2">{dataHoraBR(a.vistoEm ?? a.criadoEm)}</dd>
          <dt className="text-muted">Vinculado em</dt>
          <dd className="min-w-0 truncate text-text-2">{dataBR(a.criadoEm)}</dd>
          {a.ip && (
            <>
              <dt className="text-muted">IP</dt>
              <dd className="min-w-0 break-all font-mono text-[11.5px] text-text-2">{a.ip}</dd>
            </>
          )}
        </dl>
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-1">{acoes}</div>}
    </div>
  );
}

/** O "Sair" dos banners obrigatórios do acesso (aparelho, termo, falha ao carregar): encerra a sessão e volta ao login. */
export function BotaoSairAcesso({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      loading={saindo}
      disabled={disabled}
      icon={<IconLogout className="h-4 w-4" />}
      onClick={async () => {
        setSaindo(true);
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        router.replace("/login");
        router.refresh();
      }}
    >
      Sair
    </Button>
  );
}

/**
 * O BANNER de NOMEAR O APARELHO (flutuante, sem fechar — só "Sair"): o 1º acesso ou um aparelho desconhecido pedem um nome.
 * Com a conta LOTADA, a pessoa escolhe qual aparelho retirar (a troca é atômica e inicia o prazo sem novas trocas); em
 * TRAVA, nenhum aparelho novo entra — dá para pedir a liberação ao administrador.
 */
export function BannerAparelho({ estado, nome: pessoa, onConcluido }: { estado: EstadoAparelhos; nome: string; onConcluido?: () => void }) {
  const router = useRouter();
  const [recarregando, recarregar] = useTransition();
  const conhecido = estado.lista.find((a) => a.id === estado.conhecido);
  const [nome, setNome] = useState(conhecido?.nome ?? estado.sugestao);
  const [tocado, setTocado] = useState(false);
  const motivoNome = motivoNomeAparelho(nome);
  const [retirar, setRetirar] = useState<number[]>([]);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pedido, setPedido] = useState<string | null>(null);
  const s = estado.situacao;
  const lotado = !conhecido && s.tipo === "lotado";
  const travado = !conhecido && s.tipo === "trava";
  const precisa = Math.max(1, estado.lista.length - estado.limite + 1);
  const primeiro = pessoa.split(" ")[0];

  async function liberar() {
    if (gravando || recarregando) return;
    if (lotado && retirar.length < precisa) return setErro(`Escolha ${precisa} aparelho(s) para retirar.`);
    setGravando(true);
    setErro(null);
    try {
      const r = await fetch("/api/acesso/aparelho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, removerIds: lotado ? retirar : undefined }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível liberar o aparelho.");
      // O termo pendente já veio junto: segue direto para ele, sem recarregar; senão o painel monta de novo.
      if (onConcluido) onConcluido();
      else recarregar(() => router.refresh());
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível liberar o aparelho.");
    } finally {
      setGravando(false);
    }
  }

  async function pedirLiberacao() {
    setGravando(true);
    setErro(null);
    try {
      const r = await fetch("/api/acesso/aparelho/liberacao", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível enviar o pedido.");
      setPedido("Pedido enviado aos administradores. Quando um deles liberar, entre de novo por este aparelho.");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar o pedido.");
    } finally {
      setGravando(false);
    }
  }

  const titulo = travado ? "Troca de aparelho bloqueada" : conhecido ? "Confirme este aparelho" : lotado ? "Troque um aparelho" : "Dê um nome a este aparelho";
  const ocupado = gravando || recarregando;
  const idForm = "form-aparelho";

  return (
    <Modal
      open
      onClose={() => {}}
      bloqueado
      size="lg"
      titulo={titulo}
      rodape={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BotaoSairAcesso disabled={ocupado} />
          {travado ? (
            !pedido && (
              <Button size="sm" variant="accent" loading={ocupado} onClick={pedirLiberacao}>
                Pedir liberação ao administrador
              </Button>
            )
          ) : (
            <Button type="submit" form={idForm} size="sm" variant="accent" loading={ocupado} disabled={!!motivoNome || (lotado && retirar.length < precisa)} icon={<IconArrowRight className="h-4 w-4" />}>
              {lotado ? "Trocar e liberar o acesso" : "Liberar o acesso"}
            </Button>
          )}
        </div>
      }
    >
      <form
        id={idForm}
        noValidate
        className="space-y-[var(--gap-block)]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!travado) liberar();
        }}
      >
        {travado ? (
          <>
            <Callout kind="warn" icon={<IconLock className="h-4 w-4" />}>
              {primeiro}, você trocou de aparelho recentemente. Um aparelho novo só poderá ser vinculado a partir de <strong>{dataBR(s.ate)}</strong>. Use um
              dos aparelhos abaixo ou peça a liberação ao administrador.
            </Callout>
            <div className="space-y-2">
              {estado.lista.map((a) => (
                <CartaoAparelho key={a.id} a={a} />
              ))}
            </div>
            {pedido && <Callout kind="ok">{pedido}</Callout>}
          </>
        ) : (
          <>
            <p className="text-[14px] text-text-2">
              {conhecido
                ? `Este navegador já é o aparelho “${conhecido.nome}”. Confirme o nome (ou troque) para liberar o acesso.`
                : lotado
                  ? `A sua conta já tem ${estado.lista.length} de ${estado.limite} aparelho(s). Para usar este, retire ${precisa === 1 ? "um deles" : `${precisa} deles`}.`
                  : `Primeiro acesso por este aparelho. A sua conta pode ter até ${estado.limite} aparelho(s) vinculado(s).`}
            </p>
            <TextField
              label="Nome do aparelho"
              icon={<IconAparelho className="h-5 w-5" />}
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setTocado(true);
              }}
              maxLength={NOME_APARELHO_MAX}
              error={tocado && motivoNome ? motivoNome : undefined}
              placeholder="Ex.: Notebook do trabalho"
              hint="Obrigatório: de 3 a 40 caracteres, com letras — o nome que vai aparecer no seu Perfil e para o administrador."
              autoFocus
            />
            {lotado && (
              <fieldset className="space-y-2">
                <legend className="mb-2 text-[13px] font-semibold text-text-2">Qual aparelho retirar?</legend>
                {estado.lista.map((a) => {
                  const marcado = retirar.includes(a.id);
                  return (
                    <CartaoAparelho
                      key={a.id}
                      a={a}
                      marcado={marcado}
                      acoes={<Checkbox alvo aria-label={`Retirar ${a.nome}`} checked={marcado} onChange={(e) => setRetirar((r) => (e.target.checked ? [...r, a.id] : r.filter((x) => x !== a.id)))} />}
                    />
                  );
                })}
                <p className="text-[12px] text-muted">
                  O aparelho retirado tem as sessões encerradas.
                  {estado.trocaDias > 0 ? ` Depois da troca, um aparelho novo só poderá ser vinculado em ${estado.trocaDias} dia(s).` : ""}
                </p>
              </fieldset>
            )}
            {estado.repetir && (
              <Callout kind="info">
                <Badge tone="amber">Teste</Badge> Este passo se repete a cada login (modo de teste).
              </Callout>
            )}
          </>
        )}
        {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
      </form>
    </Modal>
  );
}
