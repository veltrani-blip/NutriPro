# Relatório final — NutriPro

Janela da validação: 10–11 de agosto de 2026, fuso America/Sao_Paulo.

## Ambiente

| Componente | Versão efetiva |
|---|---:|
| Node.js | 24.18.1 |
| npm | 11.16.0 |
| Next.js | 16.3.0 |
| React | 19.2.8 |
| TypeScript | 5.9.3 |
| Supabase CLI local | 2.113.0 |
| PostgreSQL portátil | 17.10 |

O lockfile foi reinstalado com `npm ci`. A primeira tentativa encontrou um processo de validação Next do próprio projeto ainda segurando o binário SWC no Windows. O PID e o diretório foram confirmados, somente essa árvore temporária foi encerrada e a repetição limpa terminou com exit code 0.

## Banco

Migrations executadas, em ordem, em dois bancos PostgreSQL 17 novos:

1. `0001_core.sql`;
2. `0002_clinical_and_operations.sql`;
3. `0003_storage.sql`;
4. `20260810230027_operational_foundation.sql`;
5. `20260810235302_module_transactions.sql`;
6. `20260811013000_plan_editor_operations.sql`;
7. `20260811014500_team_audit.sql`;
8. `20260811020000_payment_gateway.sql`.

Validações executadas:

- todas as tabelas públicas com RLS;
- policies sem confiança em `user_metadata` editável;
- funções definer em allowlist e com `search_path` vazio;
- isolamento de leitura e escrita por organização;
- tentativa de IDOR por UUID conhecido;
- assistente sem leitura/escrita clínica por padrão;
- paciente restrito ao próprio cadastro e arquivos liberados;
- Storage cross-tenant negado;
- convites de equipe e portal por hash, validade e e-mail exato;
- respostas de questionário e check-in atômicas;
- avaliação, medidas e dobras atômicas;
- exame e marcador atômicos;
- importação de pacientes transacional;
- plano publicado por snapshot/checksum e refeição duplicada com itens/substituições;
- recibo numerado persistido;
- webhook de pagamento idempotente, valor verificado e notificação real;
- alteração de permissão auditada pelo banco;
- documento emitido imutável;
- duas reservas concorrentes, com uma rejeitada pela exclusion constraint `23P01`.

O NutriPro foi configurado para execução sem Docker: o runtime local usa Supabase hospedado. A validação isolada inicia PostgreSQL 17 temporário, aplica todas as migrations, descarta o primeiro banco, aplica novamente em outro banco e executa os testes de integração. O script reproduzível é `scripts/verify-database.mjs`.

## Testes e comandos finais

| Comando exato | Resultado final |
|---|---|
| `npm ci` | exit code 0; 452 pacotes; 0 vulnerabilidades |
| `npm audit --omit=dev` | exit code 0; 0 vulnerabilidades |
| `npm run verify:text` | exit code 0; nenhum marcador funcional proibido em produção/documentação |
| `npm run lint` | exit code 0 |
| `npm run typecheck` | exit code 0 |
| `npm test` | exit code 0; 5 arquivos, 16 testes |
| `npm run db:verify:portable` | exit code 0; duas instalações limpas + integração/concurrency |
| `npm run build` | exit code 0; 44 páginas estáticas geradas e rotas dinâmicas compiladas |
| `npm run test:e2e` | exit code 0; 3 testes Playwright |

O build final foi executado depois do `npm ci` e inclui `/api/health`, `/api/webhooks/payments/[provider]`, 28 rotas `/app`, portal, admin, auth e rotas públicas.

## Testes unitários e de contrato

- validação de paciente;
- cálculos antropométricos com fórmula registrada;
- cálculos nutricionais preservando ausência de dados;
- parser CSV e linhas inválidas;
- PDFs clínico multipágina e recibo;
- contrato, HMAC, integridade e janela antirreplay do gateway.

O PDF clínico de cinco páginas foi renderizado em imagens e inspecionado visualmente: cabeçalho/rodapé em todas as páginas, acentuação correta, quebra de parágrafos e ausência de conteúdo órfão.

## Segurança

- nenhum secret preenchido no pacote;
- service role disponível somente ao handler server-only opcional do webhook;
- autenticação SSR e proteção de rotas;
- navegação filtrada por permissões e autorização repetida no backend/RLS;
- uploads privados com MIME, assinatura mágica, tamanho e ownership;
- URLs assinadas com expiração;
- double booking protegido no banco;
- prontuário finalizado, versões de plano, PDFs e recibos imutáveis;
- HMAC com comparação constante, janela de cinco minutos, payload hash e deduplicação;
- headers de segurança e health check sem informação sensível;
- mensagens de erro sem stack trace/erro interno;
- varredura por secrets e marcadores funcionais;
- audit de dependências sem vulnerabilidades conhecidas no momento da execução.

## E2E

Fluxos executados no build de produção, porta isolada 3101:

1. landing, cadastro, login e recuperação carregam sem erro de console;
2. health check retorna serviço configurado sem expor secret;
3. `/app/dashboard` sem sessão redireciona ao login preservando destino;
4. `/portal` sem sessão redireciona ao login preservando destino;
5. landing e cadastro, a 390 × 844, não apresentam overflow estrutural.

A primeira tentativa detectou outro servidor já presente na porta 3000. A configuração Playwright foi corrigida para nunca reutilizar servidor e usar a porta 3101; o processo da porta 3000 foi preservado.

Fluxos autenticados completos com envio real de e-mail, MFA e Storage remoto dependem de um projeto Supabase do proprietário. As contas/credenciais não foram fabricadas. RLS, papéis, portal, transações, Storage, convites e concorrência foram validados diretamente no PostgreSQL portátil; o roteiro remoto está em `docs/EXTERNAL_CONFIG.md`.

## Módulos operacionais entregues

- autenticação, MFA e onboarding;
- pacientes, tags, paginação, timeline, importação/exportação;
- agenda interna/pública e conflitos concorrentes;
- prontuário versionado, adendos e anamnese;
- avaliação, antropometria, dobras, bioimpedância, evolução e exames;
- alimentos com origem, receitas, orientações e planos versionados;
- PDFs, documentos, recibos e Storage privado;
- portal, questionários e check-ins;
- financeiro manual e gateway opcional conciliado por webhook;
- CRM, tarefas, notificações, busca e relatórios;
- equipe, overrides auditados, configurações e privacidade;
- superadmin não clínico, planos SaaS e feature flags.

## Integrações externas

Dependem exclusivamente de dados do proprietário:

- projeto Supabase, URL, publishable key, Project Ref e credenciais administrativas de migration;
- domínio, TLS, URLs de callback e SMTP;
- service role server-only e credenciais do gateway, se pagamento online for ativado;
- provedores opcionais de WhatsApp, teleconsulta, error tracking e IA;
- política de backup/PITR e revisão jurídica brasileira.

Cada variável, serviço, finalidade, local de configuração e teste de validação está documentado em `docs/EXTERNAL_CONFIG.md`. O aplicativo principal permanece operacional sem integrações opcionais.
