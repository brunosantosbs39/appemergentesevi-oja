# Revisão de confiabilidade — 2026-11-10

## Implementado nesta revisão
- Cancelamento/desistência com confirmação, explicação e motivo obrigatório (5–500 caracteres).
- Registro do autor, horário e estado anterior; motivo restrito ao contratante e autor da desistência.
- Avaliação apenas entre participantes distintos, após checkout; nota inteira entre 1 e 5.
- Avaliação, marcação do pedido e reputação gravadas em uma transação MongoDB.
- Pedidos atualizados ao voltar à aba ou recuperar conexão; requisições simultâneas evitadas.
- Falha de carregamento não vira lista vazia; mensagem e nova tentativa preservam dados existentes.

## Recursos existentes conferidos no código
- Candidatura e escolha pelo contratante; contraproposta; pedido direto.
- Reserva na aprovação para serviços configurados para carteira; check-in, checkout e liberação.
- Avaliação após conclusão, feed regional, categorias e notificações de oportunidades.
- Empresas/filiais com endereço reutilizável e despesas automáticas/manuais.
- Aviso de nova versão do frontend. Links de deployments antigos continuam apontando para builds antigos; usar URL estável da branch.

## Pendências operacionais que não devem ser anunciadas como prontas
- O responsável optou por sanções automáticas para falta/atraso, sem atendimento por e-mail. Contestação e revisão de casos excepcionais não estão implementadas.
- Definir política de resolução de disputas e janela de contestação antes de modificar liberação no checkout.
- Verificação documental/identidade: login e cadastro não equivalem a identidade verificada.
- Captar profissionais e contratantes reais por região; software não garante disponibilidade.
- Validação visual autenticada e notificações em aparelhos reais.
- Domínio próprio e configuração de autenticação de produção devem ser conferidos separadamente.

## Verificação
Testes em banco MongoDB descartável verificam concorrência de avaliações, rollback, reserva, devolução e liberação idempotentes. Não movimentam dinheiro real. Build de produção do frontend obrigatório antes da publicação.

## Política de presença definida pelo responsável pelo app
- Aviso 15 minutos antes do início; tolerância até 15 minutos depois; alerta após a tolerância.
- Sem check-in após 1 hora: pedido cancelado automaticamente, falta registrada e reserva do serviço devolvida ao contratante.
- Primeira falta: bloqueio por 24 horas. Segunda e seguintes: 30 dias, contados do prazo da falta. Contagem cumulativa, sem janela de reinício definida.
- Bloqueia publicar posts/pedidos, candidatar-se, aceitar convite direto e enviar/aceitar novas contrapropostas para o infrator. Não bloqueia leitura, serviços já em andamento, chat comum nem carteira.
- Só vale para novos pedidos com `attendance_policy_version=1`, data, hora e fuso definidos. Pedidos antigos não recebem punição retroativa.
- Check-in é uma ação registrada no servidor. Esta regra não comprova presença física nem verifica identidade documental.
- Registros e devolução são transacionais e idempotentes; o contratante não pode atribuir faltas manualmente.

### Agendamento e limitação atual de infraestrutura
O worker persistente `attendance_job` usa a fila existente, acionada pelo tráfego do app e por `/api/internal/jobs` (token `CRON_SECRET`). A verificação também ocorre antes de ações restritas e ao consultar `/api/me/attendance`, portanto o usuário não consegue publicar ou se candidatar após uma falta vencida mesmo se o worker não executou.

O arquivo vercel.json configura Vercel Schedules (beta) a cada 15 minutos, com jitter de 15 minutos, compatível com Hobby. CRON_SECRET deve estar configurado no mesmo ambiente do deployment. O horário de vencimento é exato no servidor, mas o processamento agendado e os avisos podem atrasar; não há precisão de minuto. A equipe Hobby tem limite de 5.000 execuções/mês e 15 minutos de jitter; este agendamento usa cerca de 2.880 execuções em 30 dias. Web Push depende também da permissão e disponibilidade do dispositivo. Nenhum plano pago contratado. Referências: https://vercel.com/docs/schedules/limits e https://vercel.com/docs/schedules/handle-runs.
