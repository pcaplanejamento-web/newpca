"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { estadoCard, type ResumoCard, rotuloAnos } from "@/lib/empenho-cards-core";
import { brlCompact, num } from "@/lib/format";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { COLUNAS_ESPACOS } from "./CartaoEspacoEsqueleto";
import { SelectField, TextField } from "./Field";
import { IconEmpenho, IconInbox } from "./icons";
import { Modal } from "./Modal";
import { CapaQuadro, CartaoEspaco, QuadroNovoCard } from "./QuadroCard";
import { toast } from "./Toast";

/**
 * Módulo EMPENHOS — a LISTA de CARDS (no padrão do Orçamento): cada card é uma importação da Centi com a PRÓPRIA
 * configuração (integração, anos, programação, regras e vínculos) e a SUA tabela no banco. O card "+" (quem configura)
 * cria um card — com os vínculos copiados de outro, se escolhido — e abre a Configuração dele. Tocar num card abre o
 * ESPAÇO do card (`/painel/empenhos/[id]`: Empenhos · Vínculos · Importação · Configuração). 100% design-system.
 */
export function EmpenhosView({ cards, podeCriar }: { cards: ResumoCard[]; podeCriar: boolean }) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [copiarDe, setCopiarDe] = useState("");
  const [criando, setCriando] = useState(false);
  const total = cards.reduce((s, c) => s + c.empenhos, 0);

  async function criar() {
    if (!nome.trim()) return;
    setCriando(true);
    try {
      const r = await fetch("/api/empenhos/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), copiarDe: copiarDe ? Number(copiarDe) : null }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: number };
      if (!r.ok || !j.ok || !j.id) throw new Error(j.error ?? "Não foi possível criar o card.");
      toast.success(`Card "${nome.trim()}" criado — confirme a configuração e os vínculos antes de importar.`);
      router.push(`/painel/empenhos/${j.id}?aba=configuracao`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o card.");
      setCriando(false);
    }
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="linha-topico flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-text">
            <IconEmpenho className="h-5 w-5" /> Empenhos
          </h1>
          <p className="text-sm text-muted">
            {num(cards.length)} {cards.length === 1 ? "card" : "cards"} · {num(total)} {total === 1 ? "empenho" : "empenhos"} gravados · abra um card para ver a tabela,
            os vínculos e a importação
          </p>
        </div>
        <Ajuda titulo="Empenhos" botao="sm">
          <p>
            Cada <strong>card</strong> é uma importação dos empenhos da Centi com a sua própria configuração: o endereço e os parâmetros da
            integração, os anos, a atualização automática (horário, frequência, dias úteis), as regras da conferência e os vínculos.
          </p>
          <p>
            Os <strong>vínculos</strong> dizem o que entra: quais órgãos gestores, unidades orçamentárias e ações da Centi o card importa e a
            que órgão ou unidade do cadastro cada um pertence. Só o que um vínculo cobre é gravado.
          </p>
          <p>Cada card tem a sua tabela no banco — a aba Empenhos mostra exatamente o que está gravado. Excluir o card exclui os empenhos dele.</p>
        </Ajuda>
      </div>

      {cards.length === 0 && !podeCriar ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-2 bg-surface p-10 text-center">
          <IconInbox className="h-10 w-10 text-faint" />
          <p className="text-sm text-muted">Nenhum card de empenhos ainda.</p>
        </div>
      ) : (
        <div className={`grid gap-[var(--gap-block)] ${COLUNAS_ESPACOS}`}>
          {cards.map((c) => {
            const e = estadoCard(c, c.lendo);
            return (
              <CartaoEspaco
                key={c.id}
                href={`/painel/empenhos/${c.id}`}
                ariaLabel={`Abrir o card ${c.nome}`}
                capa={
                  <CapaQuadro quadro={{ cor: c.cor, fundoUrl: null, fundoAjuste: null, fundoGradiente: null }}>
                    <span className="absolute inset-0 grid place-items-center text-faint" aria-hidden="true">
                      <IconEmpenho className="h-9 w-9" style={{ color: c.cor }} />
                    </span>
                  </CapaQuadro>
                }
                sobretitulo={rotuloAnos(c.anos)}
                selo={
                  <Badge tone={e.tom} dot vivo={c.lendo}>
                    {e.rotulo}
                  </Badge>
                }
                nome={c.nome}
                metricas={[
                  { rotulo: "Empenhos", valor: num(c.empenhos) },
                  { rotulo: "Empenhado", valor: brlCompact(c.soma) },
                  { rotulo: "Vínculos", valor: num(c.vinculos), cor: c.vinculos ? undefined : "var(--warn)" },
                ]}
              />
            );
          })}
          {podeCriar && <QuadroNovoCard onClick={() => setNovo(true)} rotulo="Novo card" />}
        </div>
      )}

      <Modal
        open={novo}
        onClose={() => !criando && setNovo(false)}
        bloqueado={criando}
        size="md"
        titulo="Novo card de empenhos"
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setNovo(false)} disabled={criando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={criar} loading={criando} disabled={!nome.trim()}>
              Criar
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <TextField denso label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoFocus placeholder="Ex.: Empenhos da Saúde" />
          <SelectField
            denso
            label="Copiar os vínculos de"
            value={copiarDe}
            onChange={(e) => setCopiarDe(e.target.value)}
            rotuloExtra={
              <Ajuda titulo="Copiar os vínculos" compacta>
                O card novo começa com os mesmos vínculos do card escolhido (depois cada um segue o seu). Nenhum = o card começa sem
                vínculos — escolha na aba Vínculos o que ele importa.
              </Ajuda>
            }
          >
            <option value="">Nenhum (começar sem vínculos)</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} ({num(c.vinculos)} vínculos)
              </option>
            ))}
          </SelectField>
          <p className="text-[12.5px] text-muted">
            Depois de criar: 1. confirme a <strong>Configuração</strong> (integração, anos, atualização e regras), 2. crie os <strong>Vínculos</strong>.
            Só então a importação é liberada.
          </p>
        </div>
      </Modal>
    </div>
  );
}
