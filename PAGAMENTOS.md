# Carteira ServiçoJá — Pix, produção e testes

## Seleção do ambiente
Por padrão, produção está desligada. O Sandbox existente continua exclusivo de Preview com ASAAS_SANDBOX_ENABLED=true, ASAAS_SANDBOX_API_KEY e ASAAS_SANDBOX_WEBHOOK_TOKEN. Ele usa api-sandbox.asaas.com e sandbox_wallet_state; seus valores não são convertidos nem migrados para dinheiro real.

Para selecionar depósitos reais, configure **no backend da Vercel**, no ambiente/branch desejado:
```dotenv
ASAAS_PRODUCTION_ENABLED=true
ASAAS_API_KEY=<configure no painel, nunca no Git>
ASAAS_WEBHOOK_TOKEN=<token aleatório de 32 a 255 caracteres>
```
Nunca use prefixos REACT_APP_, NEXT_PUBLIC_ ou VITE_ para esses segredos. Não coloque chaves em commits, screenshots ou logs. A chave de homologação é recusada em produção. Produção selecionada mas sem credenciais válidas falha fechada, sem voltar para simulação. Faça novo deployment após mudar variáveis. A chave do Sandbox não serve para produção.

## Depósito real
- POST /api/wallet/deposits exige sessão Clerk, perfil concluído, amount_cents inteiro de 500 a 10000 (R$5 a R$100), cpf_cnpj válido e idempotency_key de 16–80 caracteres.
- Busca cliente Asaas por CPF/CNPJ; se não existir, cria com nome do perfil. Não persiste CPF/CNPJ no razão do app.
- Cria cobrança PIX com referência exclusiva e vencimento no dia em Brasília. Persiste seu ID antes de buscar /payments/{id}/pixQrCode.
- Exibe encodedImage, payload e expirationDate fornecidos pelo Asaas. A validade não é inventada pelo app: pode variar conforme configuração da conta e chave Pix.
- A criação nunca credita saldo. A tela consulta a carteira a cada 15 segundos. O servidor limita consultas por usuário a uma rodada por 10 segundos e até cinco pendências por rodada.
- Crédito é do **valor líquido netValue** após tarifas, mostrado separadamente do valor solicitado. O saldo disponível é em centavos inteiros.
- Saques de produção usam saldo disponível e chave Pix CPF, CNPJ, e-mail, telefone com DDD ou aleatória, até R$ 100 por operação. A reserva é transacional. Habilite eventos TRANSFER_* no webhook Asaas existente. A carteira também reconsulta transferências identificadas. Em caso de resposta ambígua, concilie pela referência externa antes de liberar a reserva. As tarifas de saída do provedor ficam a cargo da plataforma. Autorizações exigidas pelo Asaas são realizadas no painel da conta.
- Conta única continua permitindo contratar e trabalhar; os participantes de cada pedido são pessoas distintas.

## Webhook e confirmação
Configure na conta **de produção** Asaas POST https://SEU-DOMINIO/api/wallet/webhook com authToken igual a ASAAS_WEBHOOK_TOKEN. Habilite eventos de cobrança, incluindo PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_UPDATED, PAYMENT_DELETED e eventos de estorno. Não reutilize o webhook de Sandbox para movimentações reais.

O receptor compara em tempo constante o header asaas-access-token, limita payload a 64 KB e consulta GET /payments/{id} com a chave secreta. Valida ID, referência, cliente, billingType PIX, valor bruto e valor líquido. Campos financeiros do evento nunca são aceitos como prova de pagamento.

Somente **RECEIVED** credita. CONFIRMED permanece pending: no Pix pode representar bloqueio cautelar; liberar antes do recebimento seria incorreto. Falha de consulta retorna 503 para nova tentativa do Asaas. Evento desconhecido é ignorado sem criar crédito. Processamento é síncrono e curto; monitore falhas e fila pausada no painel Asaas. A consulta periódica também reconcilia pendências.

Preview protegido precisa permitir entrega pelo mecanismo de bypass de automação autorizado no projeto, mantendo separado o token do webhook. Não desative a proteção global. Não publique a URL com bypass em documentação ou frontend. Ao trocar o ambiente, configure webhook e variáveis no mesmo destino; URLs antigas de deployments preservam sua configuração antiga.

## Persistência e idempotência
Coleções exclusivas: pix_deposits, pix_balances, pix_ledger, pix_creation_locks e pix_sync.
Cada depósito salva usuário, amount_cents, provider_payment_id único, status, created_at, paid_at, credited_cents, cliente e estado consultado no provedor. QR/validade são associados ao depósito.

Índice único parcial de provider_payment_id e chave de intenção por usuário impedem duplicação. O lançamento do razão usa o ID do pagamento como chave única. **Razão, incremento do saldo, estado pago e desbloqueio da próxima criação são gravados em uma transação MongoDB.** Atlas/replica set com transações é obrigatório: não há fallback de escrita não atômica. with_transaction repete conflitos transitórios; repetições do webhook consultam o estado já creditado e não creditam outra vez.

Estados: pending, paid, expired, failed, review. Expiração esconde o QR, mas um recebimento tardio legítimo ainda pode ser conciliado. Eventos antigos não rebaixam um pagamento creditado. Estornos posteriores ficam em review sem novo crédito ou débito automático; conciliação pelo suporte é necessária antes de liberar funcionalidades de gasto/saque.

Uma intenção é persistida no navegador até resposta para recuperar timeout; CPF/CNPJ não é salvo no navegador. Uma trava persistente limita uma criação ativa por usuário. Timeout ambíguo não repete POST; a conciliação busca a referência no Asaas e recupera a cobrança se encontrar exatamente uma. Se não houver prova suficiente, permanece em review. Erros de banco entre trava e criação ou respostas ambíguas de cliente também exigem revisão operacional; não apagar travas e repetir cobrança sem consultar o provedor.

## Operação e homologação
Antes de habilitar: conta Asaas de produção aprovada, chave Pix/configuração compatível, variáveis secretas, webhook de produção funcional, Mongo com transações e testes de recebimento supervisionados. Nenhuma chave real foi adicionada ao código. O preview desta entrega mantém o Sandbox porque as credenciais de produção não estão configuradas.

Os testes unitários de carteira cobrem criação/reuso de cliente, QR, ausência de crédito na criação, token incorreto, reconsulta do provedor, divergências, duplicatas, rollback, confirmação cautelar, expiração, estorno, seleção de ambiente e reserva, confirmação e devolução de saques. Use:
```sh
python -m unittest discover -s tests -p 'test_*wallet.py' -v
node tests/production_wallet_ui.cjs
cd frontend && yarn build
```
Os testes em memória simulam transações e falhas. Não substituem teste concorrente com Mongo real nem pagamento Pix real. Não foram movimentados valores reais para validar esta entrega.

## Referências
- [Cobrança Pix](https://docs.asaas.com/docs/cobrancas-via-pix)
- [Criar cobrança](https://docs.asaas.com/reference/criar-nova-cobranca)
- [QR Code](https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix)
- [Webhooks](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook)


## Recuperação de interrupções (novembro de 2026)

O depósito e sua trava são criados na mesma transação MongoDB. A etapa
preparing ainda não enviou cobrança; falhas nessa etapa encerram a tentativa sem
saldo e permitem outra. Se a instância parar, após dois minutos o trabalhador
pode encerrá-la. Uma atualização condicional impede que o criador antigo envie
a cobrança depois dessa recuperação.

Antes do POST ao Asaas, o estado passa para submitting. Uma resposta incerta
nessa etapa continua em review, mesmo se uma consulta retornar uma lista vazia:
o sistema nunca repete o POST nem presume que não existe cobrança. Operações
antigas sem indicação de etapa continuam conservadoramente em análise. Precisam
de verificação operacional com o provedor; esta migração não apaga travas antigas
de forma indiscriminada.

A leitura da carteira retorna o último estado salvo e agenda reconciliação
persistente. Webhooks continuam autenticados e consultam diretamente o Asaas
antes de atualizar o saldo. Consulte
OPERACAO_FILAS.md para retomadas e agendamento independente de usuários.

## Pagamento das novas vagas

Ofertas do contratante reservam o total anunciado e destinam 90% ao profissional. Contrapropostas preservam o valor solicitado pelo profissional e acrescentam 10% desse valor ao custo do contratante. Os cálculos usam centavos e arredondam o total. Na produção, a aprovação reserva o saldo na mesma transação que seleciona o candidato. Após o check-in, o profissional vê seu valor a receber. O check-out do profissional após o check-in libera o líquido imediatamente no saldo disponível. Registro do check-out, comissão e crédito são atômicos. A diferença fica registrada no livro de movimentações da plataforma. Cancelamento ou desistência antes do check-in devolve a reserva. Pedidos anteriores conservam as condições originais.
