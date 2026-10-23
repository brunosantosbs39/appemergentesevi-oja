import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity, recoverIdentity, sealMessage, openMessage, fingerprint, securityCode, unb64, b64 } from '../frontend/src/lib/e2ee/protocol.mjs';
const alice = await createIdentity('alice'), bob = await createIdentity('bob'), eve = await createIdentity('eve');
const directory = { alice: alice.local, bob: bob.local };
const record = (identity) => ({ user_id: identity.local.user_id, key_id: identity.local.key_id, ...identity.registration });
const seal = (kind = 'text', value = { text: 'Olá 👋 mensagem privada' }, bytes = null) => sealMessage(alice.local, bob.local, 'chat', crypto.randomUUID(), kind, value, bytes);
const open = (packet, local = bob.local, cid = 'chat', sender = 'alice', bytes = null) => openMessage(local, directory, cid, sender, packet, bytes);
test('sender and recipient decrypt Unicode; storage envelope has no plaintext', async () => {
  const { envelope } = await seal();
  assert.equal((await open(envelope)).text, 'Olá 👋 mensagem privada');
  assert.equal((await open(envelope, alice.local)).text, 'Olá 👋 mensagem privada');
  assert.equal(JSON.stringify(envelope).includes('mensagem privada'), false);
  assert.equal(await fingerprint(alice.registration.public), alice.local.key_id);
});
test('private keys nonextractable and backup contains no raw private material', async () => {
  assert.equal(alice.local.signingKey.extractable, false);
  assert.equal(alice.local.encryptionKey.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('jwk', alice.local.encryptionKey));
  assert.equal(JSON.stringify(alice.registration).includes('"d":'), false);
  assert.equal(JSON.stringify(alice.local).includes(alice.recoveryCode), false);
});
test('recovery on another device opens previous history; wrong code and account rejected', async () => {
  const { envelope } = await seal();
  const restored = await recoverIdentity('bob', record(bob), bob.recoveryCode);
  assert.equal((await open(envelope, restored)).text, 'Olá 👋 mensagem privada');
  await assert.rejects(recoverIdentity('bob', record(bob), alice.recoveryCode));
  await assert.rejects(recoverIdentity('eve', record(bob), bob.recoveryCode));
});
test('outsider, changed context and changed identity fail closed', async () => {
  const { envelope } = await seal();
  await assert.rejects(open(envelope, eve.local));
  await assert.rejects(open(envelope, bob.local, 'other-chat'));
  await assert.rejects(open(envelope, bob.local, 'chat', 'bob'));
  await assert.rejects(openMessage(bob.local, { ...directory, alice: eve.local }, 'chat', 'alice', envelope));
});
test('every authenticated envelope field is protected against tampering', async () => {
  const { envelope } = await seal();
  const mutations = [p => p.header.client_id = 'replayed-id', p => p.header.kind = 'audio', p => p.ciphertext = b64(new Uint8Array(unb64(p.ciphertext).length)), p => p.wrapped_keys.bob.iv = b64(new Uint8Array(12)), p => p.signature = b64(new Uint8Array(64)), p => p.header.keys.eve = eve.local.key_id];
  for (const mutate of mutations) { const packet = structuredClone(envelope); mutate(packet); await assert.rejects(open(packet)); }
});
test('audio is encrypted before upload; digest tampering is rejected', async () => {
  const bytes = new TextEncoder().encode('test audio sentinel');
  const { envelope, file } = await seal('audio', { mime: 'audio/webm;codecs=opus' }, bytes);
  assert.notDeepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  assert.notEqual(envelope.iv, envelope.attachment.iv);
  const result = await open(envelope, bob.local, 'chat', 'alice', await file.arrayBuffer());
  assert.deepEqual(new Uint8Array(await result.audio.arrayBuffer()), bytes);
  const altered = new Uint8Array(await file.arrayBuffer()); altered[0] ^= 1;
  await assert.rejects(open(envelope, bob.local, 'chat', 'alice', altered));
});
test('fresh random message keys/nonces and symmetric verification codes', async () => {
  const a = await seal(), b = await seal();
  assert.notEqual(a.envelope.iv, b.envelope.iv);
  assert.notEqual(a.envelope.header.salt, b.envelope.header.salt);
  assert.notEqual(a.envelope.ciphertext, b.envelope.ciphertext);
  assert.equal(await securityCode(alice.local, bob.local), await securityCode(bob.local, alice.local));
  assert.notEqual(await securityCode(alice.local, bob.local), await securityCode(alice.local, eve.local));
});
