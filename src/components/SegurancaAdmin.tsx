"use client";

import { useCallback, useEffect, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { type ConfigSeguranca, OPCOES_INATIVIDADE, rotuloInatividade } from "@/lib/seguranca-core";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Button } from "./Button";
import { ErroCarga } from "./ErroCarga";
import { SelectField } from "./Field";
import { IconClock, IconLock, IconSave } from "./icons";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { toast } from "./Toast";

/** Os CAMPOS da segurança do acesso (controlados) — a tela do ADM e o catálogo. */
export function CamposSeguranca({ valor, onChange }: { valor: ConfigSeguranca; onChange: (v: ConfigSeguranca) => void }) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="max-w-xs">
        <SelectField compacto label="Encerrar a sessão parada há" value={String(valor.inatividadeMin)} onChange={(e) => onChange({ ...valor, inatividadeMin: Number(e.target.value) })}>
          {OPCOES_INATIVIDADE.map((m) => (
            <option key={m} value={m}>
              {rotuloInatividade(m)}
            </option>
          ))}
        </SelectField>
      </div>
      <Switch dica="Avisa os administradores e a própria pessoa quando ela entra por um aparelho que ainda não usou" checked={valor.alertaAparelho} onChange={(alertaAparelho) => onChange({ ...valor, alertaAparelho })} label="Alertar login de aparelho novo" />
      <Switch dica="Avisa os administradores quando uma conta é bloqueada por muitas senhas erradas" checked={valor.alertaFalhas} onChange={(alertaFalhas) => onChange({ ...valor, alertaFalhas })} label="Alertar conta bloqueada por senhas erradas" />
    </div>
  );
}

/** Configurações → SEGURANÇA (ADM): sessões inativas e os alertas de login suspeito no sino. */
export function SegurancaAdmin() {
  const [c, setC] = useState<ConfigSeguranca | null>(null);
  const [salvo, setSalvo] = useState<ConfigSeguranca | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    chamar<{ seguranca: ConfigSeguranca }>("/api/admin/seguranca")
      .then((j) => {
        setC(j.seguranca);
        setSalvo(j.seguranca);
        setErro(null);
      })
      .catch((e) => setErro((e as Error).message));
  }, []);
  useEffect(carregar, [carregar]);
  if (erro && !c) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!c) return <SkeletonLinhas linhas={3} />;
  const salvar = async () => {
    setSalvando(true);
    try {
      const j = await chamar<{ seguranca: ConfigSeguranca }>("/api/admin/seguranca", "PATCH", c);
      setC(j.seguranca);
      setSalvo(j.seguranca);
      toast.success("Segurança salva — vale em até 1 minuto.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[15px] font-semibold text-text">Segurança do acesso</p>
        <Ajuda titulo="Segurança do acesso">
          <TopicoAjuda icone={<IconClock className="h-4 w-4" />} titulo="Sessão inativa">
            Sem nenhum pedido ao servidor (abrir uma tela, salvar, recarregar) durante o tempo escolhido, a sessão é encerrada e
            a pessoa volta ao login. "Não encerra" mantém a sessão por até 7 dias, como antes.
          </TopicoAjuda>
          <TopicoAjuda icone={<IconLock className="h-4 w-4" />} titulo="Aparelho novo">
            Cada navegador recebe um identificador próprio no login. Entrar por um que a pessoa ainda não usou avisa no sino dos
            administradores e da própria pessoa, com o navegador, o IP e a hora. O primeiro aparelho de cada pessoa não avisa.
          </TopicoAjuda>
          <TopicoAjuda titulo="Conta bloqueada">
            Depois de 8 senhas erradas em 15 minutos o login da conta fica bloqueado; o sino dos administradores recebe um aviso
            por bloqueio. Os avisos também podem ir por e-mail — Configurações → Notificações → "Login suspeito".
          </TopicoAjuda>
        </Ajuda>
      </div>
      <CamposSeguranca valor={c} onChange={setC} />
      <div className="flex justify-end">
        <Button size="sm" icon={<IconSave className="h-4 w-4" />} loading={salvando} disabled={salvando || JSON.stringify(c) === JSON.stringify(salvo)} onClick={salvar} title="Salvar a segurança do acesso">
          Salvar
        </Button>
      </div>
    </div>
  );
}
