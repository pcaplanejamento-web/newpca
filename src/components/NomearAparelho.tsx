"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { NOME_APARELHO_MAX } from "@/lib/acesso-conta-core";
import type { EstadoAparelhos } from "@/lib/aparelhos";
import { dataBR, dataHoraBR } from "@/lib/termo-uso-core";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CartaoAuth, ErroAuth } from "./CartaoAuth";
import { Checkbox, TextField } from "./Field";
import { IconAparelho, IconArrowRight, IconLock, IconLogout } from "./icons";
import { type Identidade, MarcaLink } from "./MarcaSistema";

/** Uma linha de aparelho (nome, navegador, último uso). */
export function LinhaAparelho({ a, extra }: { a: { nome: string; navegador: string; ip: string; vistoEm: string | null; criadoEm: string }; extra?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <IconAparelho className="h-5 w-5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-text">{a.nome}</div>
        <div className="truncate text-[12px] text-muted">
          {a.navegador || "Navegador"} · último uso {dataHoraBR(a.vistoEm ?? a.criadoEm)}
          {a.ip ? ` · IP ${a.ip}` : ""}
        </div>
      </div>
      {extra}
    </div>
  );
}

/**
 * NOMEAR O APARELHO (fora do painel — `/acesso/aparelho`): o 1º acesso ou um aparelho desconhecido pedem um nome. Com a
 * conta LOTADA, a pessoa escolhe qual aparelho retirar (a troca é atômica e inicia o prazo sem novas trocas); em TRAVA,
 * nenhum aparelho novo entra — dá para pedir a liberação ao administrador.
 */
export function NomearAparelho({ estado, identidade, nome: pessoa }: { estado: EstadoAparelhos; identidade?: Identidade; nome: string }) {
  const router = useRouter();
  const conhecido = estado.lista.find((a) => a.id === estado.conhecido);
  const [nome, setNome] = useState(conhecido?.nome ?? estado.sugestao);
  const [retirar, setRetirar] = useState<number[]>([]);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pedido, setPedido] = useState<string | null>(null);
  const s = estado.situacao;
  const lotado = !conhecido && s.tipo === "lotado";
  const precisa = Math.max(1, estado.lista.length - estado.limite + 1);

  async function enviar(e: FormEvent) {
    e.preventDefault();
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
      router.replace("/painel");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível liberar o aparelho.");
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
      setPedido("Pedido enviado aos administradores. Você será liberado quando um deles aprovar a troca.");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar o pedido.");
    } finally {
      setGravando(false);
    }
  }

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  const travado = !conhecido && s.tipo === "trava";

  return (
    <main className="flex min-h-dvh items-start justify-center bg-bg px-[var(--pad-canvas)] py-10 sm:items-center">
      <div className="w-full max-w-[520px] space-y-8">
        <div className="flex">
          <MarcaLink href="/" dica="Abrir a página pública" identidade={identidade} tamanho="lg" />
        </div>
        {travado ? (
          <CartaoAuth titulo="Troca de aparelho bloqueada" subtitulo={`${pessoa.split(" ")[0]}, você trocou de aparelho recentemente. Um aparelho novo só poderá ser vinculado a partir de ${dataBR(s.ate)}.`}>
            <div className="space-y-4">
              <Callout kind="warn" icon={<IconLock className="h-4 w-4" />}>
                Use um dos seus aparelhos já vinculados ou peça ao administrador que libere a troca antes do prazo.
              </Callout>
              <div className="space-y-3">
                {estado.lista.map((a) => (
                  <LinhaAparelho key={a.id} a={a} />
                ))}
              </div>
              {pedido && <Callout kind="ok">{pedido}</Callout>}
              {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
              {!pedido && (
                <Button variant="accent" loading={gravando} onClick={pedirLiberacao} className="w-full">
                  Pedir liberação ao administrador
                </Button>
              )}
            </div>
          </CartaoAuth>
        ) : (
          <CartaoAuth
            titulo={conhecido ? "Confirme este aparelho" : lotado ? "Troque um aparelho" : "Dê um nome a este aparelho"}
            subtitulo={
              conhecido
                ? `Este navegador já é o aparelho “${conhecido.nome}”. Confirme o nome (ou troque) para liberar o acesso.`
                : lotado
                  ? `A sua conta já tem ${estado.lista.length} de ${estado.limite} aparelho(s). Para usar este, retire ${precisa === 1 ? "um deles" : `${precisa} deles`}.`
                  : `Primeiro acesso deste aparelho. A sua conta pode ter até ${estado.limite} aparelho(s) vinculado(s).`
            }
            onSubmit={enviar}
          >
            <div className="space-y-4">
              <TextField
                label="Nome do aparelho"
                icon={<IconAparelho className="h-5 w-5" />}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={NOME_APARELHO_MAX}
                placeholder="Ex.: Notebook do trabalho"
                autoFocus
              />
              {lotado && (
                <fieldset className="space-y-3">
                  <legend className="mb-2 text-[13px] font-semibold text-text-2">Qual aparelho retirar?</legend>
                  {estado.lista.map((a) => (
                    <LinhaAparelho
                      key={a.id}
                      a={a}
                      extra={
                        <Checkbox
                          alvo
                          aria-label={`Retirar ${a.nome}`}
                          checked={retirar.includes(a.id)}
                          onChange={(e) => setRetirar((r) => (e.target.checked ? [...r, a.id] : r.filter((x) => x !== a.id)))}
                        />
                      }
                    />
                  ))}
                  <p className="text-[12px] text-muted">
                    O aparelho retirado tem as sessões encerradas.
                    {estado.trocaDias > 0 ? ` Depois da troca, um novo aparelho só poderá ser vinculado em ${estado.trocaDias} dia(s).` : ""}
                  </p>
                </fieldset>
              )}
              {estado.repetir && <Callout kind="info">Modo de teste: este passo se repete a cada login.</Callout>}
            </div>
            {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
            <Button type="submit" variant="accent" loading={gravando} icon={<IconArrowRight className="h-4 w-4" />} className="mt-6 h-[52px] w-full text-[15px]">
              {lotado ? "Trocar e liberar o acesso" : "Liberar o acesso"}
            </Button>
          </CartaoAuth>
        )}
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={sair} icon={<IconLogout className="h-4 w-4" />}>
            Sair
          </Button>
        </div>
      </div>
    </main>
  );
}
