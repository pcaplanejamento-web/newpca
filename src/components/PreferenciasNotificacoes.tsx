"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AVISOS_DIRETOS, CATALOGO_AVISOS, type ChaveAviso, type ConfigResolvida, type PrefsEmail, type PrefsPessoa, querEmail } from "@/lib/notificacoes-config-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { ChipsIcone } from "./ChipsIcone";
import { TextField } from "./Field";
import { IconAlertaSistema, IconBell, IconMail, IconSemAvisos, IconSom, IconSpinner, IconClose } from "./icons";
import { visualAviso } from "./notificacoesVisual";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";
import { toast } from "./Toast";

export type DadosPreferencias = {
  email: PrefsEmail;
  pessoa: PrefsPessoa;
  nomes: { tarefas: Record<string, string>; quadros: Record<string, string> };
  config: ConfigResolvida;
  emailAtivo: boolean;
};

/** Lê/grava as preferências de notificação da pessoa — a gravação é AUTOMÁTICA (600 ms depois da última mudança). */
export function usePreferenciasNotificacoes(ativo = true) {
  const [dados, setDados] = useState<DadosPreferencias | null>(null);
  const [salvando, setSalvando] = useState(false);
  const pendente = useRef<{ email?: PrefsEmail; pessoa?: PrefsPessoa }>({});
  const timer = useRef(0);

  useEffect(() => {
    if (!ativo || dados) return;
    chamar<DadosPreferencias>("/api/notificacoes/preferencias")
      .then(setDados)
      .catch(() => {});
  }, [ativo, dados]);

  const gravar = useCallback(async () => {
    const corpo = pendente.current;
    pendente.current = {};
    if (!corpo.email && !corpo.pessoa) return;
    setSalvando(true);
    try {
      await chamar("/api/notificacoes/preferencias", "PUT", corpo);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }, []);

  const mudar = useCallback(
    (parte: { email?: PrefsEmail; pessoa?: PrefsPessoa }, imediato = false) => {
      setDados((d) => (d ? { ...d, ...parte } : d));
      pendente.current = { ...pendente.current, ...parte };
      window.clearTimeout(timer.current);
      if (imediato) void gravar();
      else timer.current = window.setTimeout(gravar, 600);
    },
    [gravar],
  );
  // O que ficou por gravar ao sair (fechar o Perfil no meio).
  useEffect(() => () => void gravar(), [gravar]);

  return { dados, setDados, mudar, salvando };
}

/** Um SOM curto e discreto (Web Audio — sem arquivo): o aviso novo. */
export function tocarSom() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.32);
    o.onended = () => void ctx.close();
  } catch {
    /* sem áudio */
  }
}

/** O ALERTA do sistema operacional (a aba em segundo plano) — só com a permissão dada. Tocar leva ao aviso. */
export function alertaSistema(n: { id: number; titulo: string; texto: string | null; link: string | null }, abrir: () => void) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const a = new Notification(n.titulo, { body: n.texto ?? undefined, tag: `aviso-${n.id}`, icon: "/favicon.ico" });
    a.onclick = () => {
      window.focus();
      abrir();
      a.close();
    };
  } catch {
    /* navegador sem suporte */
  }
}

/** Uma LINHA compacta: ícone + rótulo à esquerda, o controle à direita (quebra embaixo no celular). */
function Linha({ icone, rotulo, children }: { icone: ReactNode; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5">
      <span className="flex min-w-[9rem] items-center gap-1.5 text-[13px] font-semibold text-text-2">
        <span className="text-muted">{icone}</span>
        {rotulo}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * As PREFERÊNCIAS de notificação da pessoa (Perfil → Notificações), compactas: o SINO (os tipos, som, alerta do sistema,
 * o que está silenciado) e o E-MAIL (imediato · resumo diário · desligado, o horário, o silêncio, o destino e os tipos que
 * o ADM manda). Grava sozinho a cada mudança.
 */
export function PreferenciasNotificacoes({ googleEmail }: { googleEmail?: string | null }) {
  const { dados, mudar, salvando } = usePreferenciasNotificacoes();
  const [permissao, setPermissao] = useState<string>(() => (typeof Notification === "undefined" ? "indisponivel" : Notification.permission));

  if (!dados)
    return (
      <p className="flex items-center gap-2 py-4 text-xs text-muted">
        <IconSpinner className="h-4 w-4" /> Carregando…
      </p>
    );
  const { email, pessoa, config, nomes } = dados;
  const doSino = CATALOGO_AVISOS.filter((i) => !i.soEmail && config[i.chave].sino);
  const porEmail = CATALOGO_AVISOS.filter((i) => config[i.chave].email && (i.soEmail || config[i.chave].sino));
  const chip = (i: (typeof CATALOGO_AVISOS)[number], fixo: boolean) => ({ value: i.chave, label: i.rotulo, ...visualAviso(i.chave), fixo });
  const modo = !email.ligado ? "desligado" : email.modo;

  const ligarSistema = async (ligar: boolean) => {
    if (ligar && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const r = await Notification.requestPermission();
      setPermissao(r);
      if (r !== "granted") {
        toast.warning("O navegador não permitiu os alertas — libere nas configurações do site.");
        return;
      }
    }
    mudar({ pessoa: { ...pessoa, sistema: ligar } }, true);
  };

  return (
    <div className="space-y-3">
      <section aria-label="Sino" className="divide-y divide-border">
        <Linha icone={<IconBell className="h-4 w-4" />} rotulo="No sino">
          <ChipsIcone<ChaveAviso>
            ariaLabel="Avisos no sino"
            compacto
            itens={doSino.map((i) => chip(i, AVISOS_DIRETOS.includes(i.chave)))}
            ligados={doSino.filter((i) => !pessoa.sinoDesligados.includes(i.chave)).map((i) => i.chave)}
            onAlternar={(v, ligado) => mudar({ pessoa: { ...pessoa, sinoDesligados: ligado ? pessoa.sinoDesligados.filter((x) => x !== v) : [...pessoa.sinoDesligados, v] } })}
          />
        </Linha>
        <Linha icone={<IconSom className="h-4 w-4" />} rotulo="Som">
          <Switch dica="Tocar um som curto quando chega um aviso novo" checked={pessoa.som} onChange={(som) => mudar({ pessoa: { ...pessoa, som } }, true)} label={<span className="sr-only">Tocar um som no aviso novo</span>} />
        </Linha>
        <Linha icone={<IconAlertaSistema className="h-4 w-4" />} rotulo="Alerta do sistema">
          <Switch
            dica="Mostrar o alerta do Windows/celular quando chega um aviso e a aba está em segundo plano"
            checked={pessoa.sistema && permissao === "granted"}
            disabled={permissao === "indisponivel"}
            onChange={ligarSistema}
            label={<span className="sr-only">Alerta do sistema com a aba em segundo plano</span>}
          />
          {permissao === "denied" && <span className="text-[12px] text-[var(--warn)]">Bloqueado pelo navegador</span>}
        </Linha>
        <Linha icone={<IconSemAvisos className="h-4 w-4" />} rotulo="Silenciados">
          {!pessoa.tarefas.length && !pessoa.quadros.length && <span className="text-[12px] text-faint">Nenhum</span>}
          {[...pessoa.quadros.map((id) => ({ tipo: "quadros" as const, id, nome: nomes.quadros[id] ?? `Quadro ${id}` })), ...pessoa.tarefas.map((id) => ({ tipo: "tarefas" as const, id, nome: nomes.tarefas[id] ?? `Tarefa ${id}` }))].map((s) => (
            <span key={`${s.tipo}${s.id}`} className="inline-flex max-w-full items-center gap-1 rounded-control bg-surface-2 py-0.5 pr-0.5 pl-2 text-[12px] text-text-2">
              <span className="truncate">{s.nome}</span>
              <button
                type="button"
                aria-label={`Voltar a avisar: ${s.nome}`}
                title="Voltar a avisar"
                onClick={() => mudar({ pessoa: { ...pessoa, [s.tipo]: pessoa[s.tipo].filter((x) => x !== s.id) } }, true)}
                className="grid h-7 w-7 place-items-center rounded-control text-muted hover:bg-surface hover:text-text pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </Linha>
      </section>

      {dados.emailAtivo && (
        <section aria-label="E-mail" className="divide-y divide-border border-t border-border">
          <Linha icone={<IconMail className="h-4 w-4" />} rotulo="E-mail">
            <Segmented<"imediato" | "resumo" | "desligado">
              value={modo}
              ariaLabel="Como receber por e-mail"
              onChange={(m) => mudar({ email: m === "desligado" ? { ...email, ligado: false } : { ...email, ligado: true, modo: m } }, true)}
              options={[
                { value: "imediato", label: "Imediato", dica: "Cada aviso chega no seu e-mail na hora" },
                { value: "resumo", label: "Resumo diário", curto: "Resumo", dica: "Um e-mail por dia, no horário escolhido, com todos os avisos juntos" },
                { value: "desligado", label: "Desligado", curto: "Não", dica: "Nenhum e-mail (os obrigatórios continuam)" },
              ]}
            />
            {modo === "resumo" && (
              <div className="w-28">
              <TextField
                label="Horário"
                type="time"
                denso
                value={email.horaResumo}
                onChange={(e) => HORA.test(e.target.value) && mudar({ email: { ...email, horaResumo: e.target.value } })}
              />
              </div>
            )}
          </Linha>
          {modo === "imediato" && (
            <Linha icone={<IconSemAvisos className="h-4 w-4" />} rotulo="Silêncio">
              <Switch
                dica="Segurar os e-mails num horário (ex.: à noite) — saem quando o silêncio acaba"
                checked={!!email.silencio}
                onChange={(on) => mudar({ email: { ...email, silencio: on ? { inicio: "20:00", fim: "07:00" } : null } }, true)}
                label={<span className="sr-only">Horário de silêncio do e-mail</span>}
              />
              {email.silencio && (
                <>
                  <div className="w-28"><TextField label="De" type="time" denso value={email.silencio.inicio} onChange={(e) => HORA.test(e.target.value) && mudar({ email: { ...email, silencio: { ...(email.silencio ?? { fim: "07:00" }), inicio: e.target.value } } })} /></div>
                  <div className="w-28"><TextField label="Até" type="time" denso value={email.silencio.fim} onChange={(e) => HORA.test(e.target.value) && mudar({ email: { ...email, silencio: { ...(email.silencio ?? { inicio: "20:00" }), fim: e.target.value } } })} /></div>
                </>
              )}
            </Linha>
          )}
          {googleEmail && modo !== "desligado" && (
            <Linha icone={<IconMail className="h-4 w-4" />} rotulo="Receber no">
              <Segmented<"institucional" | "google">
                value={email.destino}
                ariaLabel="Onde receber os e-mails"
                onChange={(destino) => mudar({ email: { ...email, destino } }, true)}
                options={[
                  { value: "institucional", label: "Institucional", dica: "No seu e-mail institucional" },
                  { value: "google", label: "Google", dica: "Na conta Google vinculada" },
                ]}
              />
            </Linha>
          )}
          {modo !== "desligado" && (
            <Linha icone={<IconMail className="h-4 w-4" />} rotulo="Por e-mail">
              {porEmail.length === 0 ? (
                <span className="text-[12px] text-faint">O administrador não envia avisos por e-mail.</span>
              ) : (
                <ChipsIcone<ChaveAviso>
                  ariaLabel="Avisos por e-mail"
                  compacto
                  itens={porEmail.map((i) => chip(i, !config[i.chave].desligavel))}
                  ligados={porEmail.filter((i) => querEmail(config, { ...email, ligado: true }, i.chave)).map((i) => i.chave)}
                  onAlternar={(v, ligado) => mudar({ email: { ...email, desligados: ligado ? email.desligados.filter((x) => x !== v) : [...email.desligados, v] } })}
                />
              )}
            </Linha>
          )}
        </section>
      )}
      <p className="h-4 text-right text-[11px] text-faint" aria-live="polite">
        {salvando ? "Salvando…" : ""}
      </p>
    </div>
  );
}
