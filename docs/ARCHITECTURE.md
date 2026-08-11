# Arquitetura

## Fronteiras

- Next.js entrega interface, SSR, rotas autenticadas, Server Actions e webhooks.
- Supabase Auth controla identidade, sessão, confirmação, recuperação e MFA/TOTP.
- PostgreSQL é a autoridade de tenancy, autorização, imutabilidade e concorrência.
- Storage guarda somente objetos privados; o banco controla os vínculos liberados ao portal.
- integrações externas usam configuração explícita e permanecem desligadas sem credencial.

## Identidade e tenancy

`auth.users` identifica a conta. `organization_members` vincula a conta à organização e ao papel. `patient_user_links` é separado e concede somente o portal de um paciente. O superadmin usa `superadmins` e não recebe um navegador clínico.

Entidades tenant-scoped possuem `organization_id`, constraints compostas e RLS. Queries da aplicação repetem o filtro da organização para defesa em profundidade.

## RBAC

Papéis base: owner, nutritionist e assistant. Permissões granulares ficam em `permissions`, `role_permissions` e `member_permission_overrides`. Pacientes possuem políticas próprias. Overrides e alterações de papel geram auditoria por trigger do banco.

## Transações importantes

- bootstrap da organização;
- reserva pública com rate limit e conflito temporal;
- avaliação + medidas + dobras;
- exame + marcador;
- resposta de questionário e check-in;
- aceite de convites por hash e e-mail exato;
- importação CSV;
- publicação versionada de plano;
- emissão de recibo;
- duplicação de refeição com itens e substituições;
- conciliação de webhook de pagamento.

## Imutabilidade

Prontuários finalizados aceitam adendos, não reescrita silenciosa. Planos publicados geram snapshot e checksum. Documentos e recibos emitidos possuem versão arquivada e triggers contra alteração/exclusão.

## Dados dinâmicos

JSONB é usado somente para respostas configuráveis, snapshots imutáveis, configurações públicas e metadados de auditoria. Medidas, pagamentos, marcadores, alimentos, agenda e vínculos continuam normalizados.

## Integração de pagamento

O adapter cria cobranças via contrato HTTP com chave server-only e idempotency key. O checkout não confirma a baixa. Um webhook HMAC, limitado a cinco minutos, chama uma função transacional que deduplica `provider + eventId`, compara valor, atualiza intent/pagamento e cria notificação.
