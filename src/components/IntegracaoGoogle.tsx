"use client";

import { useEffect, useState } from "react";
import { CAMINHO_CALLBACK_GOOGLE } from "@/lib/google-oauth-core";
import type { IntegracoesView } from "@/lib/integracoes-core";
import { BotaoCopiar } from "./BotaoCopiar";
import { Button } from "./Button";
import { Checkbox, PasswordField, TextField } from "./Field";
import { IconKey, IconRefresh } from "./icons";

/** Os campos do login com Google no formulário de Integrações (o client secret é write-only). */
export type ValorGoogle = { ativo: boolean; clientId: string; clientSecret: string };

/**
 * O CARTÃO do login com Google em Integrações: ativar, o Client ID (público), o Client secret (write-only — cifrado no
 * servidor, nunca reexibido) e a URI de REDIRECIONAMENTO para cadastrar no Google Cloud Console (a deste endereço, com o
 * botão de copiar). "Testar" confere a configuração e o Google. Controlado: o "Salvar" é o da tela.
 */
export function IntegracaoGoogle({
  valor,
  onChange,
  view,
  onTestar,
  testando,
}: {
  valor: ValorGoogle;
  onChange: (v: ValorGoogle) => void;
  view: IntegracoesView["google"];
  onTestar: () => void;
  testando: boolean;
}) {
  // A URI sai do endereço aberto (o mesmo que o servidor usa na volta do Google) — lida depois da montagem.
  const [uri, setUri] = useState("");
  useEffect(() => setUri(`${window.location.origin}${CAMINHO_CALLBACK_GOOGLE}`), []);
  return (
    <div className="space-y-[var(--gap-block)]">
      <Checkbox label="Permitir entrar com a conta Google" checked={valor.ativo} onChange={(e) => onChange({ ...valor, ativo: e.target.checked })} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField
          label="Client ID"
          icon={<IconKey className="h-5 w-5" />}
          value={valor.clientId}
          onChange={(e) => onChange({ ...valor, clientId: e.target.value })}
          placeholder="…apps.googleusercontent.com"
          autoComplete="off"
        />
        <PasswordField
          label="Client secret"
          value={valor.clientSecret}
          onChange={(e) => onChange({ ...valor, clientSecret: e.target.value })}
          placeholder={view.clientSecretDefinido ? "•••••• (definido — deixe em branco p/ manter)" : "GOCSPX-…"}
          autoComplete="off"
          hint={view.clientSecretDefinido ? "Já definido. Preencha só para substituir." : "Cifrado no servidor; nunca reexibido."}
        />
      </div>
      <div className="rounded-control border border-border bg-surface-2 p-3">
        <div className="text-[12px] font-semibold text-text-2">URI de redirecionamento autorizada (cadastre no Google Cloud Console)</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="min-w-0 break-all font-mono text-[12.5px] text-text">{uri || CAMINHO_CALLBACK_GOOGLE}</code>
          {uri && <BotaoCopiar texto={uri} rotulo="Copiar" />}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onTestar} loading={testando} icon={<IconRefresh className="h-4 w-4" />}>
          Testar configuração
        </Button>
        <span className="text-[12px] text-muted">E-mail já cadastrado entra direto; e-mail novo vira cadastro pendente de aprovação.</span>
      </div>
    </div>
  );
}
