"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type FontePca, ROTULO_FONTE } from "@/lib/pca-core";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { TextField } from "./Field";
import { IconInbox } from "./icons";
import { Modal } from "./Modal";
import { PcaCard, type PcaCardDados, PcaNovoCard } from "./PcaCard";
import { Segmented } from "./Segmented";

/**
 * Tela `/painel/pca`: os PCAs em CARDS 4:5 (capa, status Preview/Publicado, fonte, Σ) + o card "+"
 * "Novo PCA". Clicar num card entra no ESPAÇO do PCA (`/painel/pca/[id]`: Dashboard · Orçamento ·
 * Mesa/Importação · Configuração).
 */
export function PcaModuleView({ podeEditar, pcas }: { podeEditar: boolean; pcas: PcaCardDados[] }) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [ano, setAno] = useState(String(new Date().getFullYear() + 1));
  const [fonte, setFonte] = useState<FontePca>("protocolo");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const publicados = pcas.filter((p) => p.status === "publicado").length;

  async function criar() {
    setSalvando(true);
    setErro(null);
    try {
      const n = Number(ano);
      const r = await fetch("/api/pca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim() || `PCA ${n}`, ano: n, fonte }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; id?: number; error?: string };
      if (!r.ok || !j.ok || !j.id) throw new Error(j.error ?? "Não foi possível criar o PCA.");
      router.push(`/painel/pca/${j.id}?aba=configuracao`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar o PCA.");
      setSalvando(false);
    }
  }

  const anoValido = /^\d{4}$/.test(ano) && Number(ano) >= 2000 && Number(ano) <= 2100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text">PCA</h1>
        <p className="text-sm text-muted">
          {pcas.length} {pcas.length === 1 ? "plano" : "planos"} · {publicados} publicado(s) na tela inicial
        </p>
      </div>

      {pcas.length === 0 && !podeEditar ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-2 bg-surface px-6 py-16 text-center">
          <IconInbox className="h-10 w-10 text-faint" />
          <p className="text-sm text-muted">Nenhum PCA cadastrado ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {pcas.map((p) => (
            <PcaCard key={p.id} pca={p} href={`/painel/pca/${p.id}`} />
          ))}
          {podeEditar && (
            <PcaNovoCard
              onClick={() => {
                setErro(null);
                setNome("");
                setNovo(true);
              }}
            />
          )}
        </div>
      )}

      <Modal
        open={novo}
        onClose={() => setNovo(false)}
        titulo="Novo PCA"
        size="md"
        bloqueado={salvando}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNovo(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={criar} loading={salvando} disabled={!anoValido}>
              Criar PCA
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
            <TextField label="Nome" placeholder={`PCA ${ano || ""}`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
            <TextField
              label="Ano"
              inputMode="numeric"
              value={ano}
              onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
              error={anoValido ? undefined : "Ano inválido"}
            />
          </div>
          <div>
            <p className="mb-2 text-[13.5px] font-bold text-text">Fonte dos dados</p>
            <Segmented<FontePca>
              value={fonte}
              onChange={setFonte}
              options={[
                { value: "protocolo", label: ROTULO_FONTE.protocolo },
                { value: "lista", label: ROTULO_FONTE.lista },
              ]}
            />
            <p className="mt-2 text-xs text-muted">
              {fonte === "protocolo"
                ? "Os DFDs entram movendo protocolos da Mesa (conforme a situação e o ano do PCA)."
                : "Os itens entram por planilhas importadas (modelo atual), na aba Importação."}{" "}
              A fonte só pode ser trocada enquanto o PCA não tem dados.
            </p>
          </div>
        </div>
      </Modal>

      {erro && (
        <AvisoFlutuante kind="danger" titulo="Não foi possível concluir" onClose={() => setErro(null)}>
          {erro}
        </AvisoFlutuante>
      )}
    </div>
  );
}
