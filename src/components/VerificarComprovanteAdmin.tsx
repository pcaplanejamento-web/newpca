"use client";

import dynamic from "next/dynamic";
import { type FormEvent, useState } from "react";
import type { DocumentoResumo } from "@/lib/documentos";
import { dataHoraBR, ROTULO_METODO } from "@/lib/termo-uso-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { TextField } from "./Field";
import { IconTermo } from "./icons";
import { SecaoBanner } from "./SecaoBanner";
import { VerificarArquivoTermo } from "./VerificarArquivoTermo";

const VisualizadorPdf = dynamic(() => import("./DocumentosView").then((m) => m.VisualizadorPdf), { ssr: false });

type Aceite = {
  id: number;
  codigo: string;
  versao: number;
  hash: string;
  nome: string;
  matricula: string;
  cargo: string;
  unidade: string;
  email: string;
  ip: string;
  navegador: string;
  aparelho: string;
  metodo: string;
  em: string;
  teste: boolean;
  integro: boolean;
};

/**
 * VERIFICAÇÃO INTERNA do comprovante do Termo de Uso (Configurações → Verificar comprovante, só ADM): o código mostra o
 * registro COMPLETO (a pública só mostra as iniciais), se o selo confere, o comprovante e a conferência do arquivo.
 */
export function VerificarComprovanteAdmin() {
  const [codigo, setCodigo] = useState("");
  const [estado, setEstado] = useState<{ carregando?: boolean; erro?: string; aceite?: Aceite | null }>({});
  const [vendo, setVendo] = useState(false);
  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    const c = codigo.trim();
    if (!c) return;
    setEstado({ carregando: true });
    try {
      const r = await fetch(`/api/admin/termo/verificar?codigo=${encodeURIComponent(c)}`);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; aceite?: Aceite | null; error?: string };
      setEstado(r.ok && j.ok ? { aceite: j.aceite ?? null } : { erro: j.error ?? "Não foi possível consultar agora." });
    } catch {
      setEstado({ erro: "Sem conexão. Tente de novo." });
    }
  };
  const a = estado.aceite;
  const campos: [string, string][] = a
    ? [
        ["Código", a.codigo],
        ["Termo", `Versão ${a.versao}`],
        ["Assinado em", `${dataHoraBR(a.em)} (Brasília)`],
        ["Signatário", a.nome],
        ["Matrícula", a.matricula || "—"],
        ["Cargo", a.cargo || "—"],
        ["Unidade", a.unidade || "—"],
        ["E-mail", a.email || "—"],
        ["Identidade confirmada por", ROTULO_METODO[a.metodo] ?? a.metodo],
        ["Aparelho", a.aparelho || "—"],
        ["Navegador", a.navegador || "—"],
        ["IP", a.ip || "—"],
        ["Resumo do texto (SHA-256)", a.hash],
      ]
    : [];
  return (
    <div className="space-y-[var(--gap-block)]">
      <form onSubmit={buscar} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <TextField label="Código de verificação" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Digite ou cole o código do comprovante" autoComplete="off" />
        </div>
        <Button type="submit" variant="primary" loading={estado.carregando} disabled={!codigo.trim()}>
          Verificar
        </Button>
      </form>
      {estado.erro && <Callout kind="warn">{estado.erro}</Callout>}
      {a === null && <Callout kind="danger">Código não encontrado. Confira se foi digitado exatamente como está no comprovante.</Callout>}
      {a && (
        <>
          <Callout kind={!a.integro ? "danger" : a.teste ? "warn" : "ok"}>
            {!a.integro
              ? "O registro foi ALTERADO depois da assinatura — o comprovante não é válido."
              : a.teste
                ? "Comprovante de TESTE — sem valor como aceite oficial."
                : "Comprovante válido: o registro da assinatura confere com o selo."}
          </Callout>
          <SecaoBanner titulo="Registro da assinatura" acao={<Badge tone={a.integro ? "emerald" : "red"}>{a.integro ? "Selo confere" : "Selo não confere"}</Badge>}>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[14px] sm:grid-cols-[auto_1fr]">
              {campos.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="min-w-0 break-all text-text">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="pt-2">
              <Button size="sm" variant="secondary" onClick={() => setVendo(true)} icon={<IconTermo className="h-4 w-4" />}>
                Ver comprovante
              </Button>
            </div>
          </SecaoBanner>
          {a.integro && <VerificarArquivoTermo key={a.codigo} codigo={a.codigo} url="/api/admin/termo/verificar" />}
          {vendo && (
            <VisualizadorPdf doc={{ id: a.id, nome: `Comprovante — termo de uso v${a.versao}`, nomeArquivo: `termo-de-uso-v${a.versao}-${a.codigo}.pdf` } as DocumentoResumo} url={`/api/termo/aceites/${a.id}/pdf`} onFechar={() => setVendo(false)} />
          )}
        </>
      )}
    </div>
  );
}
