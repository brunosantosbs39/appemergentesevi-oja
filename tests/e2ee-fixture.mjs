// Emits only public identities, encrypted backups and ciphertext; never secrets.
import { createIdentity, sealMessage, b64 } from '../frontend/src/lib/e2ee/protocol.mjs';
const alice = await createIdentity('alice'), bob = await createIdentity('bob');
const identities = [alice, bob].map(({ local, registration }) => ({ user_id: local.user_id, key_id: local.key_id, created_at: 'test', ...registration }));
const { envelope: text } = await sealMessage(alice.local, bob.local, 'chat', 'text-client-id', 'text', { text: 'PLAINTEXT_SENTINEL' });
const { envelope: audio, file } = await sealMessage(alice.local, bob.local, 'chat', 'audio-client-id', 'audio', { mime: 'audio/webm' }, new TextEncoder().encode('AUDIO_SENTINEL'));
process.stdout.write(JSON.stringify({ identities, text, audio, file: b64(await file.arrayBuffer()) }));
