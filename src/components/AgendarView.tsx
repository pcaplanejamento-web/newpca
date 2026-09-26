"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { TextArea, TextField } from "./Field";
import { IconCalendar, IconCheck, IconClock, IconDownload, IconUser } from "./icons";
import { Turnstile } from "./Turnstile";

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const diaSemana = (d: string) => SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()];
const porExtenso = (d: string) => `${diaSemana(d)}, ${Number(d.slice(8))} de ${MESES[Number(d.slice(5, 7)) - 1]}`;

export type PaginaPublica = { slug: string; titulo: string; descricao: string | null; duracaoMin: number; responsavel: string };

/** O `.ics` do horário marcado (para a agenda de quem agendou) — horário de Brasília. */
function icsDoHorario(p: PaginaPublica, data: string, hora: string, fim: string) {
  const t = (d: string, h: string) => `${d.replace(/-/g, "")}T${h.replace(":", "")}00`;
  const texto = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PCA//Agendamento//PT",
    "BEGIN:VEVENT",
    `UID:agendar-${p.slug}-${data}-${hora.replace(":", "")}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=America/Sao_Paulo:${t(data, hora)}`,
    `DTEND;TZID=America/Sao_Paulo:${t(data, fim)}`,
    `SUMMARY:${`${p.titulo} — ${p.responsavel}`.replace(/[,;\\]/g, (c) => `\\${c}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: "text/calendar;charset=utf-8" }));
  a.download = `${p.slug}-${data}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * A PÁGINA PÚBLICA DE AGENDAMENTO (`/agendar/<slug>`): escolher o DIA (só os que têm horário livre), o HORÁRIO e
 * informar nome + e-mail. Tela única — no desktop, a informação à esquerda e a escolha à direita; no celular, empilhado.
 * Horário de Brasília. Captcha quando o ADM ativou.
 */
export function AgendarView({ pagina, livres, turnstile }: { pagina: PaginaPublica; livres: [string, string[]][]; turnstile: { enabled: boolean; siteKey: string } }) {
  const router = useRouter();
  const [dia, setDia] = useState<string | null>(livres[0]?.[0] ?? null);
  const [hora, setHora] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [obs, setObs] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ data: string; hora: string; horaFim: string } | null>(null);
  const horas = useMemo(() => new Map(livres).get(dia ?? "") ?? [], [livres, dia]);

  const enviar = async () => {
    if (!dia || !hora) return;
    setEnviando(true);
    setFalha(null);
    try {
      const r = await fetch(`/api/agendar/${pagina.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: dia, hora, nome, email, observacao: obs, captchaToken: token ?? undefined }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: string; hora?: string; horaFim?: string };
      if (!r.ok || !j.ok) {
        setFalha(j.error ?? "Não foi possível agendar. Tente de novo.");
        if (r.status === 409) {
          setHora(null);
          router.refresh();
        }
        setNonce((n) => n + 1);
        setToken(null);
        return;
      }
      setFeito({ data: j.data ?? dia, hora: j.hora ?? hora, horaFim: j.horaFim ?? hora });
    } catch {
      setFalha("Sem conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  if (feito)
    return (
      <section className="mx-auto w-full max-w-md space-y-4 rounded-card border border-border bg-surface p-[var(--pad-card)] text-center shadow-soft">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--ok)_15%,transparent)] text-[var(--ok)]">
          <IconCheck className="h-6 w-6" />
        </span>
        <h1 className="text-[18px] font-bold text-text">Horário marcado</h1>
        <p className="text-[14px] text-text-2">
          {pagina.titulo} com <strong>{pagina.responsavel}</strong>
          <br />
          {porExtenso(feito.data)} · {feito.hora}–{feito.horaFim} (horário de Brasília)
        </p>
        <Button variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={() => icsDoHorario(pagina, feito.data, feito.hora, feito.horaFim)}>
          Adicionar à minha agenda
        </Button>
      </section>
    );

  const pronto = !!dia && !!hora && nome.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && (!turnstile.enabled || !!token);
  return (
    <section className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-card border border-border bg-surface shadow-soft lg:grid-cols-[18rem_minmax(0,1fr)]">
      <header className="space-y-3 border-b border-border p-[var(--pad-card)] lg:border-b-0 lg:border-r">
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <IconUser className="h-4 w-4" /> {pagina.responsavel}
        </p>
        <h1 className="text-[20px] font-bold leading-tight text-text">{pagina.titulo}</h1>
        <p className="flex items-center gap-2 text-[13px] text-text-2">
          <IconClock className="h-4 w-4 text-muted" /> {pagina.duracaoMin} min
        </p>
        <p className="flex items-center gap-2 text-[13px] text-text-2">
          <IconCalendar className="h-4 w-4 text-muted" /> Horário de Brasília (GMT-03)
        </p>
        {pagina.descricao && <p className="whitespace-pre-wrap break-words text-[13px] text-text-2">{pagina.descricao}</p>}
      </header>
      <div className="min-w-0 space-y-4 p-[var(--pad-card)]">
        {livres.length === 0 ? (
          <Callout kind="info">Não há horários livres no momento. Volte mais tarde.</Callout>
        ) : (
          <>
            <div>
              <p className="mb-2 text-[13.5px] font-bold text-text">Escolha o dia</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1" role="listbox" aria-label="Dias com horário livre">
                {livres.map(([d, hs]) => (
                  <button
                    key={d}
                    type="button"
                    role="option"
                    aria-selected={d === dia}
                    onClick={() => {
                      setDia(d);
                      setHora(null);
                    }}
                    className={`flex min-h-16 min-w-16 shrink-0 flex-col items-center justify-center rounded-control border px-2 text-center transition-colors ${d === dia ? "border-accent bg-accent text-white" : "border-border bg-surface hover:border-accent"}`}
                  >
                    <span className="text-[11px] font-semibold uppercase">{diaSemana(d)}</span>
                    <span className="text-[18px] font-bold tabular-nums leading-none">{Number(d.slice(8))}</span>
                    <span className={`text-[10.5px] ${d === dia ? "text-white/80" : "text-faint"}`}>
                      {MESES[Number(d.slice(5, 7)) - 1]} · {hs.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {dia && (
              <div>
                <p className="mb-2 text-[13.5px] font-bold text-text">Horário — {porExtenso(dia)}</p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 xl:grid-cols-6" role="listbox" aria-label="Horários livres">
                  {horas.map((h) => (
                    <button
                      key={h}
                      type="button"
                      role="option"
                      aria-selected={h === hora}
                      onClick={() => setHora(h)}
                      className={`min-h-11 rounded-control border text-[14px] font-semibold tabular-nums transition-colors lg:min-h-9 ${h === hora ? "border-accent bg-accent text-white" : "border-border text-accent hover:border-accent"}`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hora && (
              <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                <TextField label="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="name" />
                <TextField label="Seu e-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email" />
                <div className="sm:col-span-2">
                  <TextArea label="Observação (opcional)" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} />
                </div>
                {turnstile.enabled && (
                  <div className="sm:col-span-2">
                    <Turnstile key={nonce} siteKey={turnstile.siteKey} onToken={setToken} />
                  </div>
                )}
                {falha && (
                  <div className="sm:col-span-2">
                    <Callout kind="danger">{falha}</Callout>
                  </div>
                )}
                <div className="flex justify-end sm:col-span-2">
                  <Button onClick={enviar} disabled={!pronto || enviando}>
                    {enviando ? "Agendando…" : `Confirmar ${hora}`}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
