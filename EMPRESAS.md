# Empresas e filiais

Cada conta pode criar empresas, cadastrar filiais e acessar seu próprio painel em /empresas. Não há compartilhamento administrativo entre contas nesta versão. Todos os endpoints verificam o proprietário; uma filial deve pertencer à empresa selecionada.

Pedidos novos podem ser vinculados à empresa/filial com data de competência e quantidade de diárias. O orçamento continua sendo o TOTAL do pedido (inclusive negociações posteriores), nunca é multiplicado novamente por dias. Pedidos antigos não são automaticamente atribuídos. Data ausente usa a criação do pedido.

Diárias manuais têm trabalhador, data de competência, diária em centavos, quantidade de dias, observação e situação. Valores em centavos são inteiros e o total é diária × dias. Uma intenção repetida não cria outro lançamento. Não registrar manualmente uma despesa já representada por um pedido. A situação manual pode ser corrigida ou cancelada pelo proprietário.

Previsto, concluído/a pagar, pago informado e cancelado são separados. Pago informado é anotação administrativa; não prova bancária e não executa saque ou transferência. Pedidos concluídos NÃO são tratados como pagos. Cancelados não entram nos totais ativos. Pedidos sem orçamento são sinalizados.

Filtros usam a data de competência, com até 367 dias inclusivos. Um lançamento de vários dias pertence integralmente à data indicada; não há rateio entre meses. Para distribuir custos, lance períodos separados. Relatórios acima de 5000 registros por origem pedem intervalo menor em vez de mostrar soma truncada.

Mapa: GPS sem cache, amostragem de até 22 segundos escolhendo a melhor precisão e círculo de incerteza. Não promete precisão que o aparelho não oferece. Centro padrão não é marcado como posição real. Dados de profissionais continuam sendo localizações cadastradas, não rastreamento ao vivo. Requisições antigas não sobrescrevem filtros novos. Distâncias em linha reta.

Categorias novas: produção, som, iluminação, palco, roadie, DJ, músico/banda, segurança, recepção, garçom/buffet, LED/vídeo e carga/descarga de eventos.

Validação: testes unitários de autorização, filial, cálculo, idempotência, período e classificação de custos em tests/test_companies.py; compilação de frontend e backend; build na Vercel. Não se cria empresa fictícia na conta do usuário.
