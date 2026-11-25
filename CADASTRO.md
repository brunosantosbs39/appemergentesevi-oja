# Cadastro e autenticação

O login apresenta e-mail e senha juntos e mantém Google, usando o SDK Clerk 6.17.0. As senhas nunca passam pela API ServiçoJá nem são armazenadas no banco do app. E-mail/senha e Google devem continuar habilitados na instância Clerk.

Fluxo de cadastro:
1. Criar acesso com e-mail/senha (com confirmação do e-mail) ou autenticar com Google.
2. Concluir /onboarding com nome, e-mail verificado da conta e endereço: CEP, rua, número ou S/N, bairro, cidade e UF; complemento opcional.
3. Consultar o CEP, confirmar região e salvar. O app abre /mapa na região cadastrada. A localização do dispositivo só é solicitada por ação explícita.

O mesmo cadastro é obrigatório para contas antigas sem endereço e para Google. Conta única para contratar e trabalhar. A API onboarded e AppShell bloqueiam o uso antes da conclusão; PUT /me não permite contornar essa etapa.

GET /api/me/address/{cep} consulta BrasilAPI CEP v2 e mantém cache por CEP no MongoDB. Só o CEP é enviado ao provedor, não nome, rua ou número. Coordenadas de CEP são aproximadas. Quando ausentes, é obrigatório escolher/confirmar um ponto no mapa; não há fallback silencioso para São Paulo. O mapa usa tiles OpenStreetMap. Botão Usar centro do mapa permite confirmação com teclado.

PUT /api/me/registration valida os campos, confere cidade/UF com o CEP e consulta o e-mail primário verificado diretamente no Clerk. Salva endereço privado, e-mail, região, origem da localização e data de conclusão. Projeções públicas não incluem endereço completo nem e-mail. Respostas /api/me têm Cache-Control private, no-store.

OAuth retorna por /sso-callback; desafios adicionais e MFA continuam sob controle do Clerk. Não há alteração das políticas de MFA ou da senha na instância. Recuperação de senha usa código de e-mail e redefinição pelo SDK Clerk. MFA continua exigido quando configurado.

Validação:
- python -m unittest discover -s tests -p test_registration.py -v
- node --test tests/auth-forms.test.cjs (dependências instaladas em frontend)
- build da Vercel na branch codex/wallet-setup

Os testes simulam Clerk, CEP e banco: não criam contas reais nem enviam códigos de e-mail.
