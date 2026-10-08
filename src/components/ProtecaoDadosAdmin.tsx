"use client";

import { useCallback, useEffect, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { ConfigProtecao } from "@/lib/protecao-core";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Button } from "./Button";
import { ErroCarga } from "./ErroCarga";
import { IconEyeOff, IconLock, IconSave, IconShield } from "./icons";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { toast } from "./Toast";

export type PapelProtecao = { id: number; nome: string };

/** Os CAMPOS da proteção de dados (controlados) — a tela do ADM e o catálogo. */
export function CamposProtecao({ valor, papeis, onChange }: { valor: ConfigProtecao; papeis: PapelProtecao[]; onChange: (v: ConfigProtecao) => void }) {
  const algum = valor.selecao || valor.print || valor.foco || valor.marca;
  const semPapel = algum && valor.papeis.length === 0;
  return (
    <div className="space-y-[var(--gap-block)]">
      <Switch dica="Impede selecionar, copiar, arrastar e o menu do botão direito/toque longo fora dos campos" checked={valor.selecao} onChange={(selecao) => onChange({ ...valor, selecao })} label="Bloquear seleção e cópia" />
      <Switch dica="Invisível no uso: a impressão sai em branco e o PrtScn não fica na área de transferência" checked={valor.print} onChange={(print) => onChange({ ...valor, print })} label="Bloquear impressão e captura" />
      <Switch dica="Cobre o conteúdo quando a janela perde o foco (ferramentas de recorte)" checked={valor.foco} onChange={(foco) => onChange({ ...valor, foco })} label="Ocultar ao sair da janela" />
      <Switch dica="Invisível na tela: o nome, a matrícula e a hora de quem vê ficam na captura e no papel" checked={valor.marca} onChange={(marca) => onChange({ ...valor, marca })} label="Marca d'água com quem vê" />
      <div className="max-w-md space-y-1">
        <SeletorMultiplo
          rotulo="Papéis protegidos"
          suspenso
          textoVazio="Nenhum"
          opcoes={papeis.map((p) => ({ valor: String(p.id), rotulo: p.nome }))}
          selecionados={valor.papeis.map(String)}
          onChange={(v) => onChange({ ...valor, papeis: v.map(Number) })}
        />
        {semPapel && <p className="text-[12px] text-[var(--warn)]">Escolha ao menos um papel — sem papel, ninguém é bloqueado no sistema.</p>}
      </div>
      <Switch dica="Aplica os mesmos bloqueios na tela pública do PCA (sem login)" checked={valor.publica} onChange={(publica) => onChange({ ...valor, publica })} label="Aplicar também na tela pública" />
    </div>
  );
}

/**
 * Configurações → PROTEÇÃO DE DADOS (ADM): os bloqueios de seleção/cópia e de impressão/captura, os PAPÉIS em que valem e
 * a tela pública. Vale para cada pessoa ao abrir a próxima tela (até 1 min).
 */
export function ProtecaoDadosAdmin() {
  const [c, setC] = useState<ConfigProtecao | null>(null);
  const [salvo, setSalvo] = useState<ConfigProtecao | null>(null);
  const [papeis, setPapeis] = useState<PapelProtecao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    chamar<{ protecao: ConfigProtecao; papeis: PapelProtecao[] }>("/api/admin/protecao")
      .then((j) => {
        setC(j.protecao);
        setSalvo(j.protecao);
        setPapeis(j.papeis);
        setErro(null);
      })
      .catch((e) => setErro((e as Error).message));
  }, []);
  useEffect(carregar, [carregar]);
  if (erro && !c) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!c) return <SkeletonLinhas linhas={4} />;
  const salvar = async () => {
    setSalvando(true);
    try {
      const j = await chamar<{ protecao: ConfigProtecao; papeis: PapelProtecao[] }>("/api/admin/protecao", "PATCH", c);
      setC(j.protecao);
      setSalvo(j.protecao);
      setPapeis(j.papeis);
      toast.success("Proteção salva — vale ao abrir a próxima tela.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[15px] font-semibold text-text">Proteção de dados</p>
        <Ajuda titulo="Proteção de dados">
          <TopicoAjuda icone={<IconLock className="h-4 w-4" />} titulo="Seleção e cópia">
            Fora dos campos de digitação, não se seleciona, copia, arrasta nem abre o menu do botão direito (ou do toque longo no
            celular). Os botões "Copiar" do sistema e as exportações seguem funcionando — a exportação é controlada pela ação
            Exportar do papel.
          </TopicoAjuda>
          <TopicoAjuda icone={<IconShield className="h-4 w-4" />} titulo="Impressão e captura">
            Invisível no uso: nada aparece nem muda na tela. A impressão sai em branco, com o aviso, e a imagem do PrtScn
            some da área de transferência (colar não traz nada). As ferramentas que salvam a imagem em arquivo (Win+Shift+S,
            Win+PrtScn, Cmd+Shift+3/4 no Mac) e a foto pelo celular nenhum site consegue impedir — para elas, ligue a marca
            d'água, que identifica quem capturou.
          </TopicoAjuda>
          <TopicoAjuda icone={<IconEyeOff className="h-4 w-4" />} titulo="Ocultar ao sair da janela">
            Cobre o conteúdo enquanto a janela está sem foco (ferramentas de recorte, outra janela por cima). Volta ao tocar. É
            a única opção que a pessoa vê.
          </TopicoAjuda>
          <TopicoAjuda titulo="Marca d'água">
            O nome, a matrícula e a data e hora de quem vê, sobre toda a tela, abaixo do que o olho percebe: a captura a guarda
            (aparece ao realçar o contraste) e no papel sai legível. Na tela pública, "Consulta pública".
          </TopicoAjuda>
          <TopicoAjuda titulo="Papéis protegidos">
            Os bloqueios valem em todas as telas e banners só para quem tem um dos papéis escolhidos — inclusive o Administrador,
            se marcado.
          </TopicoAjuda>
          <TopicoAjuda titulo="Tela pública">Ligado, a tela pública do PCA (sem login) recebe os mesmos bloqueios.</TopicoAjuda>
        </Ajuda>
      </div>
      <CamposProtecao valor={c} papeis={papeis} onChange={setC} />
      <div className="flex justify-end">
        <Button size="sm" icon={<IconSave className="h-4 w-4" />} loading={salvando} disabled={salvando || JSON.stringify(c) === JSON.stringify(salvo)} onClick={salvar} title="Salvar a proteção de dados">
          Salvar
        </Button>
      </div>
    </div>
  );
}
