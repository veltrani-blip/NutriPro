# Segurança e threat review

## Controles aplicados

- sessão SSR em cookies e validação com `auth.getUser()`;
- proxy para rotas protegidas e redirecionamento seguro sem open redirect;
- RLS em todas as tabelas públicas;
- RBAC granular no banco, com assistente sem acesso clínico por padrão;
- chaves tenant compostas para impedir IDOR por UUID conhecido;
- buckets privados e prefixos por organização/paciente;
- MIME, tamanho, assinatura mágica e nome randômico nos uploads;
- URLs assinadas curtas e downloads autenticados;
- constraints de exclusão temporal e advisory lock contra double booking;
- registros clínicos, versões, PDFs e recibos imutáveis;
- funções `SECURITY DEFINER` com `search_path` vazio e grants mínimos;
- senha somente no Supabase Auth; service role somente no servidor do webhook opcional;
- headers `nosniff`, `DENY`, Referrer Policy e Permissions Policy;
- validação Zod e mensagens públicas sem stack trace;
- webhook HMAC com comparação constante, janela antirreplay, hash e idempotência;
- auditoria sem senha, cookie, token ou conteúdo clínico desnecessário.

## Ameaças verificadas

- leitura e atualização cross-tenant por ID conhecido;
- assistente lendo/escrevendo prontuário;
- paciente acessando outro paciente ou arquivo não liberado;
- profissional de outra organização acessando objeto de Storage;
- duas reservas concorrentes para o mesmo profissional;
- alteração de documento emitido;
- convite aceito por e-mail diferente;
- replay de webhook e valor divergente;
- função definer com `search_path` inseguro.

## Operação de produção

Antes da abertura pública:

- configure SMTP e proteção antiabuso do Auth;
- exija MFA para owner, equipe administrativa e superadmin conforme política interna;
- execute Advisors do Supabase e dependency audit;
- habilite backup/PITR e teste restauração;
- aplique rate limiting de borda ao webhook e às rotas públicas;
- configure error tracking com redaction de PII/PHI;
- revise domínios, TLS, cookies e CSP na plataforma de hospedagem;
- execute E2E autenticado no projeto remoto com contas descartáveis por papel.

## LGPD

Exclusão/anonimização clínica não é automática. Solicitações entram em fila de análise para respeitar retenção, obrigação profissional e segurança. Termos, consentimentos, prazos de retenção e bases legais precisam de revisão jurídica do controlador.
