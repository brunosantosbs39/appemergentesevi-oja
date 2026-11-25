# Revisão de usabilidade — 23/11/2026

Base: [10 heurísticas de Jakob Nielsen](https://www.nngroup.com/articles/ten-usability-heuristics/). Mantida a identidade visual Chama aê.

| Heurística | Aplicação nesta revisão |
| --- | --- |
| Visibilidade do estado | Gerando Pix, enviando saque, carregando publicações e aviso global de conexão. |
| Linguagem familiar | Mensagens claras de sessão expirada, limite de tentativas e falha de conexão. |
| Controle e liberdade | Ajuda com retorno ao feed, fechamento do Pix explicado, filtros com limpeza e seleção dos pedidos preservada na URL. |
| Consistência | Mesmos componentes, cores, bordas e padrão de ajuda em feed, mapa, pedidos, carteira, empresas e perfil. |
| Prevenção de erros | Recuperação do QR sem repetir POST ambíguo; aviso para não pagar novamente durante análise; revisão do saque preservada. |
| Reconhecimento | Pesquisa informa resultados e filtro aplicado; carteira explica o estado da operação. |
| Flexibilidade | Link de pular ao conteúdo para teclado; aba de pedidos compartilhável e compatível com Voltar/Avançar. |
| Minimalismo | Ajuda recolhida por padrão; QR em janela própria, sem expor detalhes internos do provedor. |
| Recuperação | Erro persistente no depósito, tentativa automática do código, ação de tentar novamente no feed e alternativas em estados vazios. |
| Ajuda | Orientações contextuais sobre localização, compromissos, saldo, empresas e perfil. |

Escopo: melhorias incrementais nos componentes comuns e fluxos acima. A inspeção heurística não substitui testes de usabilidade com pessoas nem certifica acessibilidade completa. O mapa mantém sua lógica de localização e não promete precisão GPS no computador.

## Perfil — complemento em 24/11/2026

Revisados os itens já presentes antes de acrescentar as heurísticas 1, 2, 5 e 6:

- **1 — Estado visível:** estados de salvar, envio de foto/capa e captura de localização; falhas de conexão com nova tentativa, sem confundir erro de publicações com perfil inexistente. Paginação informa carregamento e permite repetir após falha.
- **2 — Linguagem familiar:** “Profissão ou especialidade”, “Valor por hora” e exemplos nos campos. O estado on-line continua significando presença no app.
- **5 — Prevenção:** nome e valores validados antes do envio; limite de áreas e funções; valor com centavos; salvamento bloqueado durante qualquer envio de imagem; proteção contra cliques repetidos e descarte acidental ao fechar a edição. Aviso do navegador ao recarregar com alterações pendentes.
- **6 — Reconhecimento:** nota numérica, quantidade de avaliações, ausência de avaliações explícita, campos associados aos rótulos e seleção atual das áreas visível. Edição conserva os dados quando há erro.

Validação: testes de componentes em `tests/profile-ux.test.cjs` e build do frontend. A inspeção visual do perfil em produção depende de uma sessão autenticada.
