# Mapa funcional

## Produto público e acesso

- landing page, FAQ, planos vindos do banco e CTAs reais;
- cadastro, confirmação de e-mail, login, logout, recuperação, troca de senha e MFA/TOTP;
- onboarding completo de profissional, clínica, horários e identidade visual;
- suspensão de workspace e área SaaS separada.

## Operação da clínica

- dashboard com métricas reais e agenda do dia;
- pacientes com pesquisa, filtro, paginação, status, tags, emergência, timeline, exportação e soft delete;
- agenda dia/semana/mês, serviços, bloqueios, estados, reagendamento e agendamento público;
- CRM enxuto, tarefas editáveis e central de notificações;
- busca global autorizada e relatórios por período com CSV.

## Clínica

- prontuário com rascunho, versões, finalização e adendos;
- anamnese versionada;
- avaliações, antropometria, fórmulas registradas, dobras, bioimpedância e gráfico real;
- fotos privadas com consentimento de compartilhamento;
- exames, arquivo privado e marcadores sem diagnóstico automático;
- alimentos globais/customizados com fonte e valores ausentes preservados;
- receitas e orientações reutilizáveis com edição e arquivamento;
- plano diário/semanal, refeições, itens, receitas, substituições, duplicação, ordem, publicação, snapshot e checksum;
- documentos PDF e recibos numerados imutáveis.

## Acompanhamento e portal

- convite do portal por token com hash, validade, e-mail exato e revogação;
- plano publicado, orientações, documentos, questionários, check-ins, financeiro, recibos e privacidade;
- builder de questionários com todos os tipos previstos e campos adicionais;
- check-in semanal, quinzenal ou customizado sem pontuação clínica inventada.

## Administração

- equipe por convite, papel, desativação e permissões específicas auditadas;
- configurações persistidas de clínica, profissional, horários, documentos e segurança;
- integrações explicitamente configuradas ou desligadas;
- solicitações LGPD com análise e justificativa;
- superadmin não clínico para contas, planos SaaS, assinaturas e feature flags.

## Dependências externas opcionais

SMTP, gateway, WhatsApp oficial, teleconsulta, error tracker e IA dependem de serviço contratado. A ausência não interrompe agenda, clínica, portal, PDFs ou financeiro manual. Consulte `EXTERNAL_CONFIG.md`.
