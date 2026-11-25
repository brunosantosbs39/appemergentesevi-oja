# Avisos de oportunidades

Ao publicar um pedido, o servidor procura perfis da mesma categoria, com localização válida e a até 25 km do local do pedido. Uma conta pode contratar e se candidatar; não há restrição a um único papel.

Os destinatários são processados do mais próximo para o mais distante. A ordem de chegada do push depende do provedor. Pedidos direcionados nunca são divulgados a outros profissionais. O autor não recebe seu próprio aviso. Sem localização válida, não há disparo por proximidade.

Cada par pedido/usuário tem um identificador único no MongoDB, impedindo duplicação no sino. Pedidos encerrados ou vencidos são conferidos antes do aviso. O envio roda após a resposta de publicação. A caixa de notificações persiste; o push é opcional, depende das chaves VAPID e autorização do usuário e não possui garantia de entrega/repetição após falhas da infraestrutura.

O aviso abre o feed para candidatura. Nenhuma notificação seleciona ou contrata automaticamente: o contratante analisa e aprova as candidaturas no fluxo existente.

Testes: python -m unittest discover -s backend/tests -p test_opportunities.py
