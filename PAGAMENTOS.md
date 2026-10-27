# Carteira Sandbox — rodada de homologação

Esta implementação é exclusiva de Preview + ASAAS_SANDBOX_ENABLED=true + ASAAS_SANDBOX_API_KEY. A URL do provedor é fixa em api-sandbox.asaas.com. Nenhuma operação usa produção.

## Fluxo
- Depósito entre R$5 e R$100 cria cliente fictício sem notificações, cobrança PIX e confirma usando a ação exclusiva de Sandbox. Saldo é creditado somente após consultar RECEIVED, validando ID, referência, cliente e valor. Crédito líquido após tarifas.
- Saque reserva saldo antes da chamada; somente DONE encerra. FAILED/CANCELLED devolvem a reserva uma vez. Timeout ambíguo não reenvia nem devolve automaticamente: requer revisão.
- Contratante reserva um valor de teste em serviço aceito/em execução. Profissional vê pendente após check-in. Após check-out, ambos confirmam o pagamento na carteira (separado da avaliação e da confirmação histórica do serviço). Contestação bloqueia liberação. Serviço cancelado permite devolução pelo contratante antes de contestação/liberação.
- IDs de intenção impedem cliques repetidos. Cada atualização de saldo e contrapartida é atômica por comparação de versão em um documento MongoDB exclusivo sandbox_wallet_state. Limites: 200 operações e 100 reservas por rodada; não é arquitetura de custódia de produção.
- Não se cria subconta nem contrata Escrow nesta etapa. Retenção e repasse entre participantes são simulações contábeis do app sobre a conta Sandbox. Saques são enviados ao Asaas Sandbox.

## Acompanhamento
A resposta da criação não significa liquidação. O botão Atualizar movimentações consulta o provedor para pendências. Há receptor POST /api/wallet/webhook autenticado com ASAAS_SANDBOX_WEBHOOK_TOKEN e reconciliação por GET na API, mas ele só funciona após configurar token e URL pública no Asaas. Preview com proteção pode impedir a entrega. Não desabilitar proteção global para contornar isso. Webhooks não foram provisionados nesta etapa.

## Antes de produção
Não basta trocar uma variável ou chave: implementar estrutura de contas aprovada pelo provedor, identidade dos titulares, consentimentos, antifraude, cancelamento/reembolso/chargeback posterior, reconciliação de taxas, razão imutável escalável, autorização de saques, outbox/retries operacionais e resolução administrativa de disputas. Escrow possui regras de expiração automática que precisam ser compatíveis com dupla confirmação. Não há homologação de produção.

## Verificação
15 testes unitários em memória e compilação JSX. Concorrência real em MongoDB, webhooks e fluxo de duas contas ainda exigem homologação. Não registrar credenciais ou payloads completos de provedor em logs.
