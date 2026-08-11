# Configuração externa

Nenhuma credencial real acompanha o pacote. Variáveis server-only nunca devem receber prefixo `NEXT_PUBLIC_`.

A instalação padrão é sem Docker: o Next.js roda localmente e utiliza um projeto Supabase hospedado para Auth, Data API, PostgreSQL e Storage.

## Variáveis obrigatórias do aplicativo

| Variável | Serviço | Finalidade | Onde configurar | Teste de validação |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | URL do Auth, Data API e Storage | `.env.local` e Vercel Project Settings > Environment Variables | abrir `/cadastro`, criar conta descartável e confirmar ausência de erro de configuração |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase | chave pública sujeita a RLS | `.env.local` e Vercel | cadastrar, confirmar e autenticar uma conta; acessar somente a própria organização |
| `NEXT_PUBLIC_APP_URL` | Aplicação | callbacks, convites e webhooks | `.env.local`, Vercel e Auth URL Configuration | recuperação de senha e convite retornam ao domínio correto |
| `APP_NAME` | Aplicação | nome configurável/white label futuro | `.env.local` e Vercel | executar build e conferir metadados/título |

## Supabase

| Credencial/configuração | Serviço | Finalidade | Onde configurar | Teste de validação |
|---|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI | login/link/push de migrations; não pertence ao runtime | cofre local/CI protegido | `npx supabase projects list` e `npx supabase db push --dry-run` |
| Project Ref + senha do banco | Supabase | vincular e administrar migrations/backups | Supabase Dashboard > Project Settings | `npx supabase link --project-ref ...` e migration list sem divergência |
| Site URL e Redirect URLs | Supabase Auth | confirmação, recuperação e convite | Authentication > URL Configuration | cadastro, confirmação, recuperação e convite em ambiente publicado |
| SMTP host/port/user/password | provedor SMTP via Supabase Auth | e-mails reais de autenticação | Authentication > SMTP Settings; secret somente no painel | enviar confirmação e recuperação para caixa descartável e conferir logs do provedor |
| TOTP MFA | Supabase Auth | segundo fator | Authentication > Multi-Factor Authentication | cadastrar fator, sair, entrar e validar desafio AAL2 |
| CAPTCHA opcional | Cloudflare Turnstile ou hCaptcha | reforçar cadastro/login público | Supabase Auth e plataforma de deploy | executar cadastro válido e tentativa sem token em staging |

### Aplicar o banco remoto

```powershell
npx supabase login
npm run db:link -- --project-ref SEU_PROJECT_REF
npm run db:push
```

Depois, valide Auth, buckets privados, Advisors e uma tentativa cross-tenant com contas descartáveis.

## Pagamento online opcional

O financeiro manual não requer as variáveis abaixo.

| Variável | Serviço | Finalidade | Onde configurar | Teste de validação |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | cliente server-only da rota de webhook | Vercel, somente Production/Preview necessários | chamar webhook assinado em staging e confirmar conciliação; verificar que a variável não aparece no bundle client |
| `NUTRIPRO_PAYMENT_GATEWAY_URL` | gateway compatível | endpoint base do contrato de cobrança | Vercel server-only | gerar cobrança pendente e receber `id`, `checkoutUrl`, `status` |
| `NUTRIPRO_PAYMENT_GATEWAY_API_KEY` | gateway compatível | autenticar criação da cobrança | Vercel server-only | gateway retorna 2xx para a idempotency key e a mesma cobrança em repetição |
| `NUTRIPRO_PAYMENT_WEBHOOK_SECRET` | gateway compatível | validar HMAC SHA-256 | Vercel server-only e painel do gateway | evento válido processa uma vez; corpo alterado, evento antigo e assinatura inválida retornam 401 |

Na tela Integrações, salve `payments`, o nome do provedor e a referência `NUTRIPRO_PAYMENT_GATEWAY_API_KEY`, então ative. O provider deve enviar `POST /api/webhooks/payments/{provider}`.

### Contrato para criar cobrança

`POST {NUTRIPRO_PAYMENT_GATEWAY_URL}/charges`, com Bearer token e header `Idempotency-Key`.

Corpo:

```json
{
  "externalId": "payment-uuid",
  "organizationId": "organization-uuid",
  "amountCents": 25000,
  "description": "Consulta nutricional",
  "callbackUrl": "https://app.exemplo/api/webhooks/payments/provider",
  "metadata": { "provider": "provider" }
}
```

Resposta:

```json
{ "id": "charge-reference", "checkoutUrl": "https://gateway/checkout/...", "status": "pending" }
```

### Contrato do webhook

Headers:

- `X-NutriPro-Timestamp`: Unix timestamp em segundos;
- `X-NutriPro-Signature`: hex de `HMAC-SHA256(secret, timestamp + "." + rawBody)`.

Corpo:

```json
{
  "organizationId": "organization-uuid",
  "eventId": "event-unique-id",
  "type": "payment.paid",
  "providerReference": "charge-reference",
  "amountCents": 25000
}
```

Tipos aceitos: `payment.paid`, `payment.failed` e `payment.refunded`. A janela é de cinco minutos. Evento repetido é idempotente; valor divergente não concilia.

## Integrações opcionais não ativadas por padrão

| Configuração | Serviço | Finalidade | Onde configurar | Teste de validação |
|---|---|---|---|---|
| SMTP transacional além do Auth | Resend, SES ou equivalente | lembretes e mensagens do outbox | secret manager + worker autorizado | mensagem real de staging, status do outbox e redaction de logs |
| WhatsApp oficial | Meta WhatsApp Cloud API ou BSP | lembretes autorizados | secret manager + webhook oficial | template aprovado, opt-in real e status entregue/falhou |
| Teleconsulta | provedor contratado | link de atendimento | secret manager + tela Integrações | criar sala descartável e validar expiração/autorização |
| Error tracker | Sentry ou equivalente | erros sem PII/PHI | Vercel + regra de redaction | erro controlado em staging aparece sem paciente, token ou cookie |
| IA | provedor aprovado | assistência futura com revisão humana | feature flag + secret manager | flag desligada não chama provedor; flag de staging exige revisão humana |

Esses adapters não são exigidos para agenda, prontuário, portal, PDFs ou financeiro manual. Não marque a integração como ativa até existir provider, secret, política de privacidade, teste em staging e monitoramento.

## Domínio, deploy e operação

- configure domínio e TLS na Vercel;
- replique domínio no Site URL/Redirect URLs do Supabase;
- habilite backups/PITR e teste restauração em projeto separado;
- execute Supabase Security Advisor e Performance Advisor;
- configure alertas e rate limiting na borda;
- faça E2E autenticado com contas descartáveis de owner, nutritionist, assistant e patient.
