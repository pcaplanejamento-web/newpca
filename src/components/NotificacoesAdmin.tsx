"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CATALOGO_AVISOS, type Canais, type ConfigResolvida, GRUPOS_AVISO, type ItemCatalogoAviso, resolverNotificacoes } from "@/lib/notificacoes-config-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { ErroCarga } from "./ErroCarga";
import { IconBell, IconMail, IconUndo, IconSave } from "./icons";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { toast } from "./Toast";

/** Um aviso do catálogo: o rótulo + a descrição e as três chaves (o desligado no sino trava o resto). */
function LinhaAviso({ item, canais, onChange }: { item: ItemCatalogoAviso; canais: Canais; onChange: (c: Canais) => void }) {
  const padrao = item.padrao;
  const mudou = canais.sino !== padrao.sino || canais.email !== padrao.email || canais.desligavel !== padrao.desligavel;
  const semAviso = !item.soEmail && !canais.sino;
  return (
    <div className={`grid grid-cols-1 items-center gap-x-4 gap-y-1 border-b border-border px-[var(--pad-card)] py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_repeat(3,7.5rem)] ${mudou ? "bg-accent-soft/40" : ""}`}>
      <div className="min-w-0 py-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-text">
          {item.rotulo}
          {item.soEmail && (
            <Badge tone="slate">
              Só e-mail
            </Badge>
          )}
        </p>
        <p className="text-[12px] leading-snug text-muted">{item.descricao}</p>
      </div>
      <div className="flex items-center gap-2 sm:justify-center">
        <span className="w-28 text-[12px] text-muted sm:hidden">Sino</span>
        {item.soEmail ? (
          <span className="text-[12px] text-faint">—</span>
        ) : (
          <Switch checked={canais.sino} onChange={(sino) => onChange({ ...canais, sino })} label={<span className="sr-only">{`Sino: ${item.rotulo}`}</span>} />
        )}
      </div>
      <div className="flex items-center gap-2 sm:justify-center">
        <span className="w-28 text-[12px] text-muted sm:hidden">E-mail</span>
        <Switch checked={canais.email && !semAviso} disabled={semAviso} onChange={(email) => onChange({ ...canais, email })} label={<span className="sr-only">{`E-mail: ${item.rotulo}`}</span>} />
      </div>
      <div className="flex items-center gap-2 sm:justify-center">
        <span className="w-28 text-[12px] text-muted sm:hidden">Pode desligar</span>
        <Switch
          checked={canais.desligavel}
          disabled={semAviso || !canais.email}
          onChange={(desligavel) => onChange({ ...canais, desligavel })}
          label={<span className="sr-only">{`A pessoa pode desligar o e-mail: ${item.rotulo}`}</span>}
        />
      </div>
    </div>
  );
}

/**
 * CONFIGURAÇÕES → NOTIFICAÇÕES (ADM): o controle CENTRAL dos avisos do sistema — por aviso, se ele existe no SINO, se
 * também sai por E-MAIL e se a pessoa pode desligar o e-mail no Perfil. O padrão manda por e-mail só o fundamental
 * (tarefa atribuída/atrasada, convite, protocolo designado, cadastro e acesso liberado). Só componentes do DS.
 */
export function NotificacoesAdmin() {
  const [salvo, setSalvo] = useState<ConfigResolvida | null>(null);
  const [rascunho, setRascunho] = useState<ConfigResolvida | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    try {
      const j = await chamar<{ avisos: ConfigResolvida }>("/api/admin/notificacoes");
      setSalvo(j.avisos);
      setRascunho(j.avisos);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alterado = useMemo(() => !!salvo && !!rascunho && JSON.stringify(salvo) !== JSON.stringify(rascunho), [salvo, rascunho]);
  const porEmail = rascunho ? CATALOGO_AVISOS.filter((i) => rascunho[i.chave].email && (i.soEmail || rascunho[i.chave].sino)).length : 0;

  const gravar = async (metodo: "PATCH" | "DELETE") => {
    if (!rascunho) return;
    setSalvando(true);
    try {
      const j = await chamar<{ avisos: ConfigResolvida }>("/api/admin/notificacoes", metodo, metodo === "PATCH" ? { avisos: rascunho } : undefined);
      setSalvo(j.avisos);
      setRascunho(j.avisos);
      toast.success(metodo === "PATCH" ? "Notificações salvas — valem para os próximos avisos." : "Notificações restauradas ao padrão.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  const restaurar = async () => {
    if (await confirmar({ titulo: "Voltar ao padrão?", texto: "O e-mail volta a sair só nos avisos fundamentais.", confirmar: "Restaurar" })) void gravar("DELETE");
  };

  if (erro && !rascunho) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!rascunho) return <SkeletonLinhas linhas={6} />;
  return (
    <div className="space-y-[var(--gap-block)]">
      {confirmacao}
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <IconMail className="h-4 w-4" /> {porEmail} aviso{porEmail === 1 ? "" : "s"} por e-mail
        </p>
        <Ajuda titulo="Notificações">
          <p>
            <strong>Sino</strong>: o aviso aparece no sino (em tempo real). Desligado, o aviso deixa de existir.
          </p>
          <p>
            <strong>E-mail</strong>: o aviso também é enviado por e-mail (com o Resend ativo em Integrações). Use o mínimo — só o
            que pede ação.
          </p>
          <p>
            <strong>Pode desligar</strong>: a pessoa pode deixar de receber esse e-mail no Perfil. Desligado, o e-mail é
            obrigatório.
          </p>
        </Ajuda>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" icon={<IconUndo className="h-4 w-4" />} onClick={restaurar} disabled={salvando}>
            Padrão
          </Button>
          <Button size="sm" icon={<IconSave className="h-4 w-4" />} loading={salvando} disabled={!alterado} onClick={() => gravar("PATCH")}>
            Salvar
          </Button>
        </div>
      </div>
      {GRUPOS_AVISO.map((grupo) => (
        <section key={grupo} className="overflow-hidden rounded-card border border-border bg-surface shadow-ring">
          <header className="hidden items-center gap-x-4 border-b border-border bg-surface-2 px-[var(--pad-card)] py-2 text-[12px] font-semibold text-muted sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(3,7.5rem)]">
            <span className="flex items-center gap-1.5 text-text">
              <IconBell className="h-4 w-4" /> {grupo}
            </span>
            <span className="text-center">Sino</span>
            <span className="text-center">E-mail</span>
            <span className="text-center">Pode desligar</span>
          </header>
          <p className="border-b border-border bg-surface-2 px-[var(--pad-card)] py-2 text-sm font-semibold text-text sm:hidden">{grupo}</p>
          {CATALOGO_AVISOS.filter((i) => i.grupo === grupo).map((item) => (
            <LinhaAviso
              key={item.chave}
              item={item}
              canais={rascunho[item.chave]}
              onChange={(c) => setRascunho((r) => (r ? resolverNotificacoes({ ...r, [item.chave]: c }) : r))}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
