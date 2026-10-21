# ServiçoJá na Vercel

O projeto usa Vercel Services (beta): React na raiz e FastAPI em `/api`.
O frontend usa URLs relativas, inclusive nos previews. Rotas como `/feed` e
`/sign-in` retornam a aplicação React. O backend conserva o prefixo `/api`.

## Serviços necessários

- MongoDB Atlas: configure `MONGO_URL` (ou `MONGODB_URI`) e `DB_NAME=servicoja`.
  Use um banco separado de desenvolvimento para previews.
- Clerk: configure `CLERK_SECRET_KEY` e `CLERK_PUBLISHABLE_KEY`
  (também aceita `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` da integração Vercel).
  Use chaves de desenvolvimento no preview. Configure o domínio no Clerk antes
  de ativar a instância de produção. O proxy da Emergent fica desativado.
- Vercel Blob privado: conecte o armazenamento ao projeto para fornecer
  `BLOB_READ_WRITE_TOKEN`. Os arquivos são entregues pela rota existente da API,
  após consultar o registro no banco, preservando a exibição pública das fotos.

Configure os valores diretamente no painel Vercel; nunca publique `.env` no Git.
O banco e as contas existentes na Emergent não são migrados automaticamente.

## Configuração

- `STORAGE_PROVIDER=vercel` (padrão). `emergent` mantém o adaptador anterior
  apenas para ambientes antigos que ainda tenham suas credenciais.
- `SEED_DEMO=false` (padrão). Ative somente em um banco de demonstração.
- `CORS_ORIGINS` só é necessário quando o frontend usa outro domínio.
- `REACT_APP_BACKEND_URL` deve ficar vazio para o deploy integrado.
- Python 3.12 no backend; dependências de testes em requirements-dev.txt.
- Upload máximo: 4 MiB por imagem, abaixo do limite de corpo das Functions.
  O frontend e o backend validam o mesmo limite. Fotos existentes na Emergent
  precisam de migração de conteúdo antes de trocar o armazenamento.

## Validação antes da produção

1. Confirmar as variáveis obrigatórias no Preview.
2. Executar build e confirmar abertura de `/`, `/sign-in` e `/feed`.
3. Testar cadastro, login, onboarding, pedidos e mensagens com contas de teste.
4. Testar envio e leitura de imagem e rejeição de imagem maior que 4 MiB.
5. Promover a produção somente após validar banco e Clerk próprios.
