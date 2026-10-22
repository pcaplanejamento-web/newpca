"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { UsuarioSessao } from "@/lib/auth";
import { CHAVE_CONTA_ATIVA, CHAVES_PESSOAIS } from "@/lib/contas-core";
import { nomeExibicao } from "@/lib/pessoa";
import { Avatar } from "./Avatar";
import { Dropdown } from "./Dropdown";
import { IconCadastro, IconCheck, IconLogout, IconSpinner, IconUser } from "./icons";

type Conta = { id: number; nome: string; email: string; foto: string | null; papel: string };

/** Tira deste navegador o que é de UMA pessoa (recentes, bolhas do chat…) e avisa as outras abas. */
function trocouDePessoa(id: number | null) {
  for (const area of [localStorage, sessionStorage])
    try {
      for (const k of CHAVES_PESSOAIS) area.removeItem(k);
    } catch {
      /* armazenamento bloqueado */
    }
  try {
    localStorage.setItem(CHAVE_CONTA_ATIVA, `${id ?? 0}:${Date.now()}`);
  } catch {
    /* idem */
  }
}

/** Recarga COMPLETA: nenhum cache de tela/memória da conta anterior sobrevive. */
function irPara(rota: string) {
  window.location.assign(rota);
}

/** As outras abas acompanham a troca de conta (recarregam na conta nova); entrar com outra conta pelo login também limpa. */
export function useContaEmOutraAba(id: number) {
  useEffect(() => {
    try {
      const v = localStorage.getItem(CHAVE_CONTA_ATIVA);
      if (!v || Number(v.split(":")[0]) !== id) trocouDePessoa(id);
    } catch {
      /* armazenamento bloqueado */
    }
    const ouvir = (e: StorageEvent) => {
      if (e.key !== CHAVE_CONTA_ATIVA || !e.newValue) return;
      if (Number(e.newValue.split(":")[0]) !== id) irPara("/painel");
    };
    window.addEventListener("storage", ouvir);
    return () => window.removeEventListener("storage", ouvir);
  }, [id]);
}

const ITEM = "flex min-h-11 w-full items-center gap-2.5 rounded-control px-2 text-left text-sm text-text transition-colors hover:bg-surface-2 disabled:opacity-60 lg:min-h-9";
const SAIR = "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-control px-2 text-[13px] font-medium text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] disabled:opacity-60 lg:min-h-9";

/**
 * O cartão do usuário no rodapé do menu: tocar abre o DROPUP das contas DESTE navegador — trocar (um toque), adicionar
 * outra, ir ao perfil, sair desta ou de todas. As contas vêm do servidor só ao abrir (sem tokens: só nome, foto e papel).
 */
export function ContasNavegador({ usuario, onNavigate }: { usuario: UsuarioSessao; onNavigate?: () => void }) {
  const [contas, setContas] = useState<Conta[] | null>(null);
  const [ocupado, setOcupado] = useState<number | "sair" | "todas" | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  useContaEmOutraAba(usuario.id);

  async function carregar() {
    setFalha(null);
    try {
      const r = await fetch("/api/auth/contas", { cache: "no-store" });
      const j = (await r.json()) as { ok: boolean; contas?: Conta[]; error?: string };
      setContas(j.ok ? (j.contas ?? []) : []);
    } catch {
      setContas([]);
    }
  }

  async function trocar(c: Conta) {
    setOcupado(c.id);
    setFalha(null);
    try {
      const r = await fetch("/api/auth/contas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trocar: c.id }) });
      const j = (await r.json()) as { ok: boolean; contas?: Conta[]; error?: string };
      if (!j.ok) throw new Error(j.error);
      trocouDePessoa(c.id);
      irPara("/painel");
    } catch (e) {
      setFalha(e instanceof Error && e.message ? e.message : "Não foi possível trocar de conta.");
      setOcupado(null);
      void carregar();
    }
  }

  async function sair(todas: boolean) {
    setOcupado(todas ? "todas" : "sair");
    let proxima = false;
    try {
      const r = todas
        ? await fetch("/api/auth/contas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sairTodas: true }) })
        : await fetch("/api/auth/logout", { method: "POST" });
      proxima = !todas && !!((await r.json()) as { proxima?: boolean }).proxima;
    } catch {
      /* segue para o login */
    }
    trocouDePessoa(null);
    irPara(proxima ? "/painel" : "/login");
  }

  return (
    <Dropdown
      className="menu-cartao flex w-full min-w-0 shrink-0 max-lg:w-auto"
      triggerClassName="flex w-full min-w-[42px] items-center gap-2 overflow-hidden rounded-card border border-border p-[3px] pr-2 text-left transition-colors hover:bg-surface-2"
      title="Contas e perfil"
      ariaLabel={`Conta: ${nomeExibicao(usuario)} — trocar, adicionar ou sair`}
      width={272}
      onAberto={(a) => {
        if (a) void carregar();
      }}
      trigger={
        <>
          <Avatar nome={usuario.nome} foto={usuario.foto} className="max-w-none" />
          <span className="menu-esconde min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-text" title={usuario.nome}>
              {nomeExibicao(usuario)}
            </span>
            <span className="block truncate text-[11px] text-muted">{usuario.papel.nome}</span>
          </span>
        </>
      }
    >
      {(fechar) => (
        <div className="p-1.5">
          <div className="flex items-center gap-2.5 rounded-control bg-surface-2 p-2">
            <Avatar nome={usuario.nome} foto={usuario.foto} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-text">{nomeExibicao(usuario)}</div>
              <div className="truncate text-xs text-muted" title={usuario.email}>{usuario.email}</div>
            </div>
            <IconCheck className="h-4 w-4 shrink-0 text-accent" aria-label="Conta atual" />
          </div>
          <Link href="/painel/perfil" onClick={() => { fechar(); onNavigate?.(); }} className={`${ITEM} mt-1`}>
            <IconUser className="h-4 w-4 shrink-0 text-muted" /> Meu perfil
          </Link>
          <div className="my-1.5 border-t border-border" />
          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-faint">Outras contas</div>
          {contas === null ? (
            <div className={`${ITEM} text-muted hover:bg-transparent`}>
              <IconSpinner className="h-4 w-4" /> Carregando…
            </div>
          ) : contas.length === 0 ? (
            <p className="px-2 pb-1 text-xs text-muted">Nenhuma outra conta neste navegador.</p>
          ) : (
            contas.map((c) => (
              <button key={c.id} type="button" className={`${ITEM} py-1.5`} disabled={ocupado !== null} onClick={() => trocar(c)} aria-label={`Trocar para ${c.nome}`}>
                <Avatar nome={c.nome} foto={c.foto} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.nome}</span>
                  <span className="block truncate text-xs text-muted" title={c.email}>{c.papel}</span>
                </span>
                {ocupado === c.id && <IconSpinner className="h-4 w-4 shrink-0" />}
              </button>
            ))
          )}
          {falha && <p className="px-2 py-1 text-xs text-[var(--danger)]">{falha}</p>}
          <a href="/login?adicionar=1" className={`${ITEM} ${ocupado !== null ? "pointer-events-none opacity-60" : ""}`}>
            <IconCadastro className="h-4 w-4 shrink-0 text-muted" /> Adicionar outra conta
          </a>
          <div className="my-1.5 border-t border-border" />
          <div className="flex gap-1">
            <button type="button" className={SAIR} disabled={ocupado !== null} onClick={() => sair(false)} title="Sair desta conta">
              {ocupado === "sair" ? <IconSpinner className="h-4 w-4" /> : <IconLogout className="h-4 w-4" />} Sair
            </button>
            {contas && contas.length > 0 && (
              <button type="button" className={SAIR} disabled={ocupado !== null} onClick={() => sair(true)} title="Sair de todas as contas deste navegador">
                {ocupado === "todas" ? <IconSpinner className="h-4 w-4" /> : <IconLogout className="h-4 w-4" />} Sair de todas
              </button>
            )}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
