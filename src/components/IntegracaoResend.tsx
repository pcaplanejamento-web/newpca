"use client";

import type { IntegracoesView } from "@/lib/integracoes-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Checkbox, PasswordField, TextField } from "./Field";
import { IconEnviar, IconMail } from "./icons";

/** Os campos do Resend no formulário de Integrações (a chave é write-only). */
export type ValorResend = { ativo: boolean; apiKey: string; remetente: string; urlSistema: string };

/**
 * O CARTÃO do Resend em Integrações: ativar o envio de e-mails, a chave de API (write-only — cifrada no servidor, nunca
 * reexibida), o REMETENTE (do domínio verificado no Resend) e o endereço do sistema (os links dos e-mails). "Testar e
 * enviar" confere o domínio e manda um e-mail de teste a quem testou. Controlado: o "Salvar" é o da tela.
 */
export function IntegracaoResend({
  valor,
  onChange,
  view,
  onTestar,
  testando,
}: {
  valor: ValorResend;
  onChange: (v: ValorResend) => void;
  view: IntegracoesView["resend"];
  onTestar: () => void;
  testando: boolean;
}) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <Checkbox label="Ativar o envio de e-mails" checked={valor.ativo} onChange={(e) => onChange({ ...valor, ativo: e.target.checked })} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PasswordField
          label="Chave de API do Resend"
          value={valor.apiKey}
          onChange={(e) => onChange({ ...valor, apiKey: e.target.value })}
          placeholder={view.apiKeyDefinida ? "•••••• (definida — deixe em branco p/ manter)" : "re_…"}
          autoComplete="off"
          hint={view.apiKeyDefinida ? "Já definida. Preencha só para substituir." : "Cifrada no servidor; nunca reexibida."}
        />
        <TextField
          label="Remetente"
          icon={<IconMail className="h-5 w-5" />}
          value={valor.remetente}
          onChange={(e) => onChange({ ...valor, remetente: e.target.value })}
          placeholder="Plataforma PCA <avisos@governarv.com.br>"
          autoComplete="off"
          hint="O domínio tem de estar verificado no Resend."
        />
        <TextField
          label="Endereço do sistema"
          value={valor.urlSistema}
          onChange={(e) => onChange({ ...valor, urlSistema: e.target.value })}
          placeholder="https://governarv.com.br"
          autoComplete="off"
          hint="Usado nos links dos e-mails."
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onTestar} loading={testando} icon={<IconEnviar className="h-4 w-4" />}>
          Testar e enviar e-mail de teste
        </Button>
        {view.dominio ? (
          <Badge tone={view.verificado ? "emerald" : "amber"} dot>
            {view.dominio} · {view.verificado ? "Verificado" : "Pendente"}
          </Badge>
        ) : (
          <span className="text-[12px] text-muted">Salve a chave e o remetente e teste para conferir o domínio.</span>
        )}
      </div>
    </div>
  );
}
