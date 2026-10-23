# Chat protegido — versão 1

## Uso e alcance

Novos textos e áudios usam criptografia ponta a ponta. As duas contas precisam abrir Conversas → cadeado, gerar e guardar o código de recuperação e ativar a proteção. Sem identidade do contato, não há envio; nenhuma rota aceita novos textos/áudios em claro. Rotas antigas respondem HTTP 426. Propostas, valores e avisos automáticos permanecem processáveis pelo servidor e estão identificados na interface. Histórico antigo permanece em claro e identificado como anterior à proteção.

O código aleatório de recuperação de 256 bits é mostrado no aparelho, com opções de copiar/baixar e confirmação de que foi guardado. Não é enviado ao servidor ou persistido pelo app. O backend guarda apenas a cópia criptografada das chaves privadas, acessível ao titular após login. Outro dispositivo ou acesso após sair exige o código. Não há redefinição de identidade: sem código e sem aparelho funcional, não há recuperação. Sair tenta remover as chaves locais; se o navegador impedir, o app avisa para limpar os dados do site em aparelhos compartilhados. O usuário precisa guardar o código antes de sair.

## Construção

Web Crypto nativo: ECDH P-256, HKDF-SHA256, AES-GCM-256 com tag de 128 bits e ECDSA P-256/SHA256. Cada mensagem usa chave de conteúdo aleatória e par ECDH efêmero; a chave é encapsulada individualmente para remetente e destinatário. IVs aleatórios de 96 bits são distintos para payload/anexo. AAD vincula conta, conversa, tipo e ID de cliente. Assinatura cobre todo o envelope, chaves encapsuladas, participantes e hash/tamanho do áudio criptografado. Servidor valida assinaturas e contexto antes de persistir; não recebe a chave de conteúdo ou texto/áudio em claro.

Recuperação: backup AES-GCM dos JWKs privados com HKDF do código aleatório, salt de 256 bits e contexto de conta/fingerprint. Exportação privada existe temporariamente só para criar esse backup. Uso e armazenamento local usam CryptoKeys não exportáveis no IndexedDB, separados por conta/origem. Previews têm armazenamento separado: use o domínio estável. Scripts antigos de captura de sessão/analytics e overlay remoto foram removidos do HTML de produção para evitar captura de texto/códigos no DOM. Rascunhos não são persistidos; caixa de saída guarda envelopes. Respostas de identidade/conversas usam private, no-store. Áudios são descriptografados sob demanda; URLs de objeto são revogadas ao sair/bloquear.

Identidades são imutáveis no servidor. Fingerprints dos contatos são fixados no primeiro uso (TOFU). Compare o código de segurança com o contato pessoalmente ou por canal independente; isso é necessário para detectar substituição antes do primeiro contato. Mudanças posteriores são bloqueadas. Ativações concorrentes em dispositivos diferentes podem gerar conflito; preserve o aparelho/código da identidade registrada primeiro. Nunca substitua a identidade silenciosamente para resolver o conflito.

## Limites

Protocolo próprio sem auditoria criptográfica independente. Não implementa Signal/Double Ratchet, forward secrecy contra comprometimento da identidade ou recuperação após comprometimento. Obter chave privada ou código e os dados criptografados pode permitir ler o histórico. Não é equivalente ao protocolo WhatsApp.

Participantes, horários, presença, recibos e registros de contratação permanecem visíveis ao servidor. Notificações e previews de mensagens protegidas têm texto genérico. Mensagens antigas não são migradas retroativamente.

Página/atualização comprometida, XSS, extensão ou aparelho comprometido pode acessar texto durante o uso. CryptoKey não exportável não impede JavaScript da origem de usar a chave. HTTPS, autenticação e demais controles continuam essenciais. Esta mudança não resolve automaticamente os demais achados da revisão de segurança.

Testes verificam WebCrypto/Python, manipulação, recuperação, assinatura, contexto, isolamento e persistência com MongoDB descartável. IndexedDB foi verificado com fake-indexeddb e CryptoKeys reais do Node. Faltam testes completos em dois celulares reais iOS/Android; não confundir testes com auditoria independente.

Referência das primitivas/armazenamento: https://www.w3.org/TR/webcrypto-1/

## Testes

`node --test tests/e2ee-protocol.test.mjs`

`SCALING_TEST_MONGO_URL=mongodb://127.0.0.1:27028 uv run --with pytest --with httpx==0.27.2 --with-requirements backend/requirements.txt python -m pytest tests -q`

Integração só aceita Mongo local descartável. Fixtures emitem apenas chaves públicas, backups já criptografados e ciphertext; nunca chaves privadas/códigos.
