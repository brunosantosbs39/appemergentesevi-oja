# Revisão de segurança — 3 de novembro de 2026

## Correções

- A API de profissionais fornece coordenadas em uma grade de 0,02 grau (cerca de 2 km, variando por latitude). O arredondamento ocorre antes do filtro de raio e do cálculo de distância: variar a busca não revela a coordenada original. O perfil público também usa essa posição aproximada para distância. O endereço exato permanece no cadastro privado. Isso reduz precisão pública; não garante anonimato, especialmente em áreas pouco povoadas.
- Sessões exigem assinatura RS256, expiração, início de validade, emissão, usuário e sessão. O emissor deve corresponder à instância Clerk configurada. Quando presente, a origem autorizada do token deve estar na lista permitida.
- Gravações autenticadas por cookie exigem Origin autorizado. Requisições com Bearer continuam disponíveis para o cliente autenticado. Tokens não devem ser enviados em logs.
- Todas as respostas /api/ recebem Cache-Control private, no-store e nosniff; Vary preserva valores existentes e inclui Authorization e Cookie.

## Configuração

CLERK_AUTHORIZED_PARTIES aceita origens completas separadas por vírgulas, sem caminhos, por exemplo https://app.example.com. As URLs de deployment, branch e produção fornecidas pela Vercel são adicionadas automaticamente. Domínios personalizados devem ser cadastrados explicitamente. Fora da Vercel, localhost:3000 é permitido para desenvolvimento.

A chave pública Clerk é pública por definição. Chaves secretas Clerk, Asaas e banco pertencem somente ao backend. A prévia usava instância de desenvolvimento Clerk na inspeção; configurar instância de produção é uma etapa separada antes do lançamento definitivo. Credenciais compartilhadas em conversa devem ser substituídas no provedor e na hospedagem.

## Verificação e limites

Testes usam usuários fictícios, banco Mongo local descartável com replica set e provedor financeiro simulado; não movimentam dinheiro. Cobrem tokens inválidos/expirados, gravações entre origens, acesso anônimo, isolamento entre contas, localização aproximada, webhook e idempotência. O build da interface foi executado com CI=true. Uma busca por formatos de segredos Asaas, Clerk, chaves privadas e credenciais Mongo no código versionado e JavaScript gerado não encontrou correspondências; isso não é prova de inexistência de todo tipo de segredo.

DevTools sempre mostra os dados entregues ao próprio navegador, inclusive os dados privados do usuário autenticado. A defesa é autorização no servidor e minimização dos dados retornados, não ocultar DevTools. Esta revisão não certifica que o sistema seja invulnerável; não inclui pentest independente completo, histórico inteiro do Git, configuração de todas as contas dos provedores ou autorização para executar ataques destrutivos.

Referência: https://clerk.com/docs/guides/sessions/manual-jwt-verification
