-- SEGURANÇA DO ACESSO (aditiva):
--  • `limites_acesso` = o LIMITE DE TENTATIVAS (login, código por e-mail, cadastro, redefinir a senha) por IP e por e-mail
--    — uma linha por chave, a contagem da janela atual (`inicio` em segundos Unix);
--  • `desafios_acesso` = os desafios da VERIFICAÇÃO ANTI-ROBÔ própria (quando o Turnstile não está configurado): cada um
--    vale UMA vez e por pouco tempo (`expira_em` em segundos Unix);
--  • MATRÍCULA ÚNICA no banco (sem caixa de zeros à esquerda): gatilhos que recusam cadastrar/trocar para uma matrícula
--    já usada por outra pessoa — os registros antigos ficam como estão (repetidos antigos só não recebem outra igual).
CREATE TABLE `limites_acesso` (
  `chave` text PRIMARY KEY NOT NULL,
  `contagem` integer DEFAULT 0 NOT NULL,
  `inicio` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `desafios_acesso` (
  `id` text PRIMARY KEY NOT NULL,
  `expira_em` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `desafios_acesso_expira_idx` ON `desafios_acesso` (`expira_em`);
--> statement-breakpoint
CREATE TRIGGER `usuarios_matricula_unica_ins`
BEFORE INSERT ON `usuarios`
WHEN NEW.matricula IS NOT NULL AND ltrim(trim(NEW.matricula), '0') <> ''
  AND EXISTS (SELECT 1 FROM usuarios u WHERE ltrim(trim(u.matricula), '0') = ltrim(trim(NEW.matricula), '0'))
BEGIN
  SELECT RAISE(ABORT, 'matricula_duplicada');
END;
--> statement-breakpoint
CREATE TRIGGER `usuarios_matricula_unica_upd`
BEFORE UPDATE OF `matricula` ON `usuarios`
WHEN NEW.matricula IS NOT NULL AND ltrim(trim(NEW.matricula), '0') <> ''
  AND ltrim(trim(NEW.matricula), '0') IS NOT ltrim(trim(COALESCE(OLD.matricula, '')), '0')
  AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id <> NEW.id AND ltrim(trim(u.matricula), '0') = ltrim(trim(NEW.matricula), '0'))
BEGIN
  SELECT RAISE(ABORT, 'matricula_duplicada');
END;
