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
- Definir canal oficial e responsável pelo atendimento de faltas, atrasos e contestações.
- Definir política de resolução de disputas e janela de contestação antes de modificar liberação no checkout.
- Verificação documental/identidade: login e cadastro não equivalem a identidade verificada.
- Captar profissionais e contratantes reais por região; software não garante disponibilidade.
- Validação visual autenticada e notificações em aparelhos reais.
- Domínio próprio e configuração de autenticação de produção devem ser conferidos separadamente.

## Verificação
Testes em banco MongoDB descartável verificam concorrência de avaliações, rollback, reserva, devolução e liberação idempotentes. Não movimentam dinheiro real. Build de produção do frontend obrigatório antes da publicação.
