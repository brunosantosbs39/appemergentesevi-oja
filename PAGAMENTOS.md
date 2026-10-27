# Carteira e pagamento protegido — estado da implementação

## Disponível nesta etapa
- Carteira autenticada para os dois perfis, sem valores financeiros fictícios.
- Depósito e saque desabilitados; nenhuma credencial bancária coletada.
- Check-out continua registrando a saída e encerrando a execução. Uma confirmação posterior é registrada separadamente por contratante e profissional.
- Atualização atômica no documento MongoDB, com conjunto de IDs para não contar duas vezes a mesma pessoa.
- Repetições não duplicam a confirmação nem alteram o horário da confirmação conjunta. Só pedidos concluídos com check-out aceitam confirmação; nenhuma confirmação muda saldo ou estado do serviço.
- Este código não cobra, retém, transfere nem libera dinheiro.

## Pendente antes de habilitar dinheiro
1. Escolher e contratar provedor com contas verificadas, custódia apropriada, retenção por serviço e transferências.
2. Confirmar com o provedor o modelo de aporte reutilizável pelo contratante. Split por cobrança não equivale a carteira com depósito.
3. Configurar sandbox e webhooks autenticados com reconciliação pela API do provedor.
4. Registrar centavos inteiros, moeda BRL e razão contábil imutável com partidas balanceadas; operações atômicas e chaves de idempotência.
5. Reservar valor do serviço antes de aceite/atribuição. Não derivar saldo do orçamento, de retorno do navegador ou de confirmação de presença.
6. Confirmar presença pelas duas partes (ou código único de chegada) antes de mostrar recebível pendente ao profissional.
7. Após ambas as confirmações finais, permitir liberação somente sem contestação, respeitando liquidação/chargeback e regras do provedor.
8. Disputas, reembolsos parciais/totais, cancelamento, ausência e falha de saque precisam de estados e trilha de auditoria próprios.
9. Saque apenas para titular verificado; saída pendente não pode ser debitada novamente; confirmação por webhook/API.
10. Testar concorrência, retries, eventos fora de ordem, assinatura inválida, insuficiência de saldo e acesso entre contas.
11. Reconciliar jobs_done/notificações por outbox antes de vincular eventos de conclusão a liberação financeira; hoje esses efeitos secundários não estão na mesma transação.

## Provedor em avaliação
Documentação oficial do Asaas descreve Conta Escrow para retenção temporária e liberação por subconta:
https://docs.asaas.com/docs/introducao-conta-escrow
https://docs.asaas.com/docs/bloqueio-dos-valores

Há cobrança recorrente por subconta e prazo de expiração que pode liberar automaticamente. Portanto, não assumir compatibilidade com a exigência de liberação exclusivamente por dupla confirmação. Avaliar essas condições com o provedor, inclusive congelamento de disputas e extensão de garantia, antes de contratação ou implementação financeira. Nenhum plano foi contratado.

## Validação desta etapa
Testes unitários com dependência MongoDB simulada verificam o limite dos campos alterados, filtros de acesso e check-out obrigatório, e preservação do horário nas repetições. Não substituem testes de integração concorrentes contra MongoDB real nem homologação financeira.

