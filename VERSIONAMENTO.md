# Versionamento do ServiçoJá

## Versão de referência

- Versão: v0.1.0-beta.
- Branch de referência: release/v0.1.0-beta.
- Commit: c9ce8ebaebb5f7e703bd71848a22a526ecb1655b.
- Deploy validado: dpl_6wB8QekfYonoLoiP4gAfCaNgTnvA (Vercel, READY).
- Link de testes atual: https://servicoja-git-codex-wallet-setup-brunosantosbs39-5020.vercel.app/feed

## Próxima edição

Trabalhar na branch codex/v0.2.0, criada a partir da versão de referência. Não alterar main nem atualizar o link atual com trabalho incompleto. Preservar release/v0.1.0-beta como referência; não é uma tag nem uma branch protegida automaticamente.

Antes de publicar uma nova versão: registrar mudanças, executar testes e build, validar o preview da nova branch e então atualizar a branch de testes codex/wallet-setup quando a nova versão for aprovada para publicação. Isso mantém o mesmo endereço para os usuários.

As variáveis de ambiente específicas de codex/wallet-setup, incluindo CRON_SECRET, precisam ser configuradas separadamente se a próxima branch for usada para testes de tarefas agendadas. Nunca copiar valores para o código ou documentação. Rever o agendamento entre previews para não duplicar tarefas na mesma base de dados.
