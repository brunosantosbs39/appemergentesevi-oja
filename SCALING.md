# ServiçoJá: capacidade e operação

A versão de outubro/2026 reduz o custo das atualizações e remove cortes silenciosos do histórico. Nenhuma quantidade de usuários simultâneos está homologada para produção.

## Mudanças

- Chat: uma chamada `/conversations/{id}/sync` substitui a leitura separada da conversa e das mensagens. A abertura carrega 50 mensagens; atualizações consultam somente mensagens novas ou alteradas (inclusive contrapropostas). Uma página de novidades tem até 100 mensagens e um cursor por horário + ID. Há sobreposição de cinco segundos para escritas em andamento e deduplicação por ID no cliente.
- Frequência da conversa: cinco segundos enquanto ativa; quinze após períodos sem novidades; nenhuma consulta de atualização enquanto a aba está oculta ou sem rede. Erros usam espera e respeitam `Retry-After`.
- Histórico: mensagens e conversas têm botão para carregar páginas anteriores. O feed e meus pedidos também têm paginação. A API de oportunidades/profissionais aceita `limit` e `offset`; oportunidades têm carregamento adicional na interface.
- Busca: a caixa de latitude/longitude é filtrada no banco, incluindo antimeridiano/polos. Distância esférica, raio e ordenação são calculados antes do limite da página, evitando o corte anterior dos primeiros 1.000 perfis. A implementação usa as coordenadas existentes, sem regravar perfis. Não há índice `2dsphere`; buscas sem raio ainda processam todos os resultados correspondentes e devem ser medidas em bases maiores.
- MongoDB: cliente reutilizado, limite padrão de dez conexões por processo, espera máxima na fila de cinco segundos, conexões ociosas fechadas após um minuto. `MONGO_MAX_POOL_SIZE` permite ajustar o pool; é um limite por processo, não por projeto.
- Índices adicionais para coordenadas, participantes/horário de conversas, alterações de mensagens, autor/categoria das publicações e responsáveis dos pedidos. Criados idempotentemente no startup.
- Escritas têm limites atômicos por conta/minuto compartilhados no MongoDB: 60 mensagens, 60 eventos de digitação, 12 uploads, 12 sinais de presença e 60 demais ações. Contadores vencem por TTL. Esse limite não é uma cota de usuários.
- Leituras têm proteção adicional por conta/instância (180/minuto), com memória limitada. Não substitui um firewall/limitador global contra ataques. Autenticação e autorização continuam obrigatórias.
- Erros do banco retornam 503 com `Retry-After`; limites retornam 429. O cliente tem timeout.
- Notificações são persistidas antes da resposta. Web Push usa tarefas de background vinculadas à requisição, com timeout no provedor. A entrega push permanece best-effort; não existe fila durável de reenvio automático.

## Infraestrutura confirmada

MongoDB Atlas `FREE`, região `iad1`, ligado ao projeto ServiçoJá em preview e produção. A API também está em `iad1`. Não houve contratação ou alteração de plano.

Clerk ainda usa chaves de desenvolvimento. O recurso da integração informa `Production domain required`: é preciso configurar e validar um domínio de produção no Clerk antes de migrar a autenticação. Não basta renomear variáveis ou esconder o aviso. Contas e identidades devem ser preservadas na migração.

## Verificação

Testes unitários e de regressão:

```bash
uv run --with pytest --with httpx==0.27.2 --with-requirements backend/requirements.txt python -m pytest tests -q
```

Os testes de integração novos precisam de um MongoDB 8 local e descartável. Inicie-o em uma porta local (exemplo 27028), sem apontar para dados reais:

```bash
mongod --dbpath /caminho/temporario/para/dados --bind_ip 127.0.0.1 --port 27028 --nounixsocket
SCALING_TEST_MONGO_URL=mongodb://127.0.0.1:27028 uv run --with pytest --with httpx==0.27.2 --with-requirements backend/requirements.txt python -m pytest tests -q
```

Os testes só aceitam localhost/127.0.0.1, criam um banco aleatório e o apagam ao terminar. Sem essa variável, os testes que dependem de MongoDB local são pulados. São cobertos mais de 1.500 perfis, 550 conversas/pedidos, paginação com horários iguais, atualização de proposta antiga, 100 escritas concorrentes contra o limitador, autenticação, autorização, erros do pool e persistência da notificação antes do push.

Isso verifica funcionalidade e concorrência específica, não capacidade ou latência do Atlas Free/Vercel/Clerk em produção. Próximo passo para homologação: staging com banco independente, contas sintéticas, carga progressiva e mistura de navegação/chat/envio/áudio, medindo latência p95, erros, operações e conexões. Só publicar um teto depois de sustentá-lo com margem durante o teste. Preview e produção atualmente compartilham o mesmo banco; um teste pesado na prévia também afetaria usuários reais.
