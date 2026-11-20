# Trabalho persistente e recuperação

Vagas novas carregam alert_job no mesmo documento gravado na criação.
Cada aviso contém delivery junto do conteúdo, quando o push está configurado.
Depósitos novos têm sync_job na transação que cria a tentativa e a trava.
Não há chamada ao Asaas para criar cobrança dentro do trabalhador de fila.

## Execução e limites

- A criação da vaga, avisos, consultas da carteira, presença e listagem de
  notificações podem iniciar trabalho em segundo plano.
- O banco mantém ready/running/done/failed, data da próxima tentativa e token
  exclusivo. Uma instância interrompida pode ser substituída após 90 segundos.
- Um controle compartilhado limita execuções e uma atualização condicional
  impede o trabalhador antigo de sobrescrever o estado do novo.
- Cada execução atende no máximo seis itens, alternando vagas, push e Pix.
  Fan-out de vaga processa 50 destinatários por item e salva cursor por distância
  e usuário. A posição é avaliada no momento do processamento; mudanças de perfil
  durante a distribuição podem alterar a audiência.
- Falhas repetem com espera progressiva, até 12 tentativas. Após isso ficam
  failed para inspeção. last_error contém somente o tipo do erro, sem credenciais.
- A caixa de entrada deduplica por pedido/usuário. Push é ao menos uma vez:
  respostas ambíguas do provedor podem repetir entrega; o service worker usa o
  mesmo tag/id para substituir a notificação exibida.
- Cada aparelho aceito pelo provedor é registrado antes do próximo envio.
- Reconciliar dinheiro exige transação e confirmação RECEIVED do Asaas.
  Testes e produção continuam separados.

## Agendamento sem usuários conectados

A retomada por tráfego já funciona sem variáveis adicionais. Para execução
também enquanto ninguém usa o app, configure um agendador para
GET /api/internal/jobs com Authorization: Bearer <CRON_SECRET>. Defina um
segredo aleatório de pelo menos 32 caracteres apenas no backend.

O endpoint não é configuração de usuário e falha fechado sem segredo válido.
Esta alteração NÃO cria assinatura paga nem agenda serviço remoto. Em produção,
use Vercel Cron compatível com seu plano ou um trabalhador controlado; lembre-se
de que cron de produção não executa automaticamente em previews. Frequência
recomendada para avaliar: um minuto, medindo duração e backlog antes de ampliar.

## Operação

Monitore número e idade dos itens ready/running e qualquer failed. Investigue a
causa antes de recolocar um item em ready (available_at no presente, attempts=0).
Não altere saldo nem remova trancas financeiras manualmente para desobstruir fila.
A revisão de uma cobrança ambígua deve consultar o Asaas e preservar o ledger.

Os índices da fila, Pix e feed são idempotentes e criados no startup da API.
As coleções devem estar no mesmo replica set MongoDB. Índices do feed:
(status, target_pro_id, created_at desc, id desc) e variante com category.

## Verificação local

Execute pytest com SCALING_TEST_MONGO_URL apontando exclusivamente para um
MongoDB local replica set. tests/test_recovery_jobs.py verifica queda antes do
POST, incerteza após POST, criador antigo retomado, 32 créditos concorrentes,
retomada de lease, novas tentativas, duplicidade de avisos e índices do feed.

node --test tests/category-search.test.mjs tests/polling.test.mjs verifica busca
com/sem acentos, termos de áreas e atualização sem requisições sobrepostas.
