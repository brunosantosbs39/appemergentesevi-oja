// Web Crypto primitives only. No content key or recovery code is sent to the API.
const utf8 = new TextEncoder();
const text = new TextDecoder("utf-8", { fatal: true });
const subtle = () => {
  if (!globalThis.crypto?.subtle) throw new Error("Este navegador precisa de HTTPS e suporte à criptografia.");
  return globalThis.crypto.subtle;
};
export const canonical = (value) => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]));
  return value;
}
export const encode = (value) => utf8.encode(canonical(value));
export const random = (size) => crypto.getRandomValues(new Uint8Array(size));
export const b64 = (data) => {
  const bytes = new Uint8Array(data); let value = "";
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64 = (value) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
export const hex = (bytes) => Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
export const digest = async (bytes) => hex(await subtle().digest("SHA-256", bytes));
const cleanPublic = (jwk) => ({ kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y });
export const fingerprint = (bundle) => digest(encode(bundle));
const importPublic = (jwk, name) => subtle().importKey("jwk", cleanPublic(jwk), { name, namedCurve: "P-256" }, false, name === "ECDSA" ? ["verify"] : []);
const aes = (bytes) => subtle().importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
async function derive(bytes, salt, info) {
  const material = await subtle().importKey("raw", bytes, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: encode(info) }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const encrypt = (key, bytes, iv, aad) => subtle().encrypt({ name: "AES-GCM", iv, additionalData: encode(aad), tagLength: 128 }, key, bytes);
const decrypt = (key, bytes, iv, aad) => subtle().decrypt({ name: "AES-GCM", iv, additionalData: encode(aad), tagLength: 128 }, key, bytes);
const sign = async (key, value) => b64(await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, key, encode(value)));
const backupInfo = (uid, kid) => ["servicoja.backup.v1", uid, kid];
const wrapInfo = (header, uid) => ["servicoja.wrap.v1", header.conversation_id, header.sender_id, header.client_id, header.kind, uid, header.keys[uid]];
function recoveryBytes(code) {
  const raw = code.trim().replace(/^SJ1-/i, "").replace(/[-\s]/g, "");
  if (!/^[a-fA-F0-9]{64}$/.test(raw)) throw new Error("Confira o código de recuperação completo.");
  return Uint8Array.from(raw.match(/.{2}/g), (v) => parseInt(v, 16));
}
async function importLocal(uid, pub, privateKeys) {
  const encryptionKey = await subtle().importKey("jwk", { ...privateKeys.encryption_key, key_ops: ["deriveBits"] }, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const signingKey = await subtle().importKey("jwk", { ...privateKeys.signing_key, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { user_id: uid, public: pub, key_id: await fingerprint(pub), encryptionKey, signingKey };
}
export async function createIdentity(uid) {
  const dh = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const signing = await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = { version: 1, encryption_key: cleanPublic(await subtle().exportKey("jwk", dh.publicKey)), signing_key: cleanPublic(await subtle().exportKey("jwk", signing.publicKey)) };
  const privateKeys = { encryption_key: await subtle().exportKey("jwk", dh.privateKey), signing_key: await subtle().exportKey("jwk", signing.privateKey) };
  const local = await importLocal(uid, pub, privateKeys);
  const codeBytes = random(32), salt = random(32), iv = random(12);
  const code = `SJ1-${hex(codeBytes).match(/.{8}/g).join("-")}`;
  const key = await derive(codeBytes, salt, backupInfo(uid, local.key_id));
  const backup = { salt: b64(salt), iv: b64(iv), ciphertext: b64(await encrypt(key, encode({ user_id: uid, key_id: local.key_id, ...privateKeys }), iv, backupInfo(uid, local.key_id))) };
  codeBytes.fill(0);
  const registration = { public: pub, backup };
  registration.proof = await sign(local.signingKey, { purpose: "servicoja.identity.v1", user_id: uid, public: pub, backup });
  return { local: { ...local, registration }, registration, recoveryCode: code };
}
export async function recoverIdentity(uid, record, code) {
  const bytes = recoveryBytes(code);
  const key = await derive(bytes, unb64(record.backup.salt), backupInfo(uid, record.key_id)); bytes.fill(0);
  let value;
  try { value = JSON.parse(text.decode(await decrypt(key, unb64(record.backup.ciphertext), unb64(record.backup.iv), backupInfo(uid, record.key_id)))); }
  catch { throw new Error("Código de recuperação incorreto ou cópia de segurança inválida."); }
  if (value.user_id !== uid || value.key_id !== record.key_id || await fingerprint(record.public) !== record.key_id) throw new Error("A identidade da conta não confere.");
  for (const name of ["encryption_key", "signing_key"]) {
    if (canonical(cleanPublic(value[name])) !== canonical(record.public[name])) throw new Error("Chaves de recuperação inválidas.");
  }
  const local = await importLocal(uid, record.public, value);
  // Check that the recovered signing private key actually belongs to the public key.
  const challenge = { purpose: "servicoja.recovery.check", user_id: uid };
  if (!await subtle().verify({ name: "ECDSA", hash: "SHA-256" }, await importPublic(record.public.signing_key, "ECDSA"), unb64(await sign(local.signingKey, challenge)), encode(challenge))) throw new Error("Chave de assinatura inválida.");
  return local;
}
export async function sealMessage(local, peer, cid, clientId, kind, value, attachmentBytes = null) {
  if (!peer || peer.user_id === local.user_id) throw new Error("A outra pessoa precisa ativar a proteção do chat.");
  if (peer.key_id !== await fingerprint(peer.public)) throw new Error("Identidade do contato inválida.");
  const pair = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const header = { version: 1, conversation_id: cid, sender_id: local.user_id, client_id: clientId, kind,
    keys: { [local.user_id]: local.key_id, [peer.user_id]: peer.key_id },
    ephemeral_key: cleanPublic(await subtle().exportKey("jwk", pair.publicKey)), salt: b64(random(32)) };
  const rawKey = random(32), key = await aes(rawKey), iv = random(12);
  const wrapped_keys = {};
  for (const record of [local, peer]) {
    const shared = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: await importPublic(record.public.encryption_key, "ECDH") }, pair.privateKey, 256));
    const kek = await derive(shared, unb64(header.salt), wrapInfo(header, record.user_id)); shared.fill(0);
    const nonce = random(12);
    wrapped_keys[record.user_id] = { iv: b64(nonce), ciphertext: b64(await encrypt(kek, rawKey, nonce, wrapInfo(header, record.user_id))) };
  }
  rawKey.fill(0);
  const packet = { header, iv: b64(iv), ciphertext: b64(await encrypt(key, encode(value), iv, ["servicoja.payload.v1", header])), wrapped_keys, attachment: null };
  let file = null;
  if (kind === "audio") {
    if (!attachmentBytes || attachmentBytes.byteLength > 4 * 1024 * 1024) throw new Error("Áudio deve ter até 4 MB.");
    let nonce = random(12); while (b64(nonce) === packet.iv) nonce = random(12);
    const encrypted = await encrypt(key, attachmentBytes, nonce, ["servicoja.attachment.v1", header]);
    packet.attachment = { iv: b64(nonce), sha256: await digest(encrypted), size: encrypted.byteLength };
    file = new Blob([encrypted], { type: "application/octet-stream" });
  }
  packet.signature = await sign(local.signingKey, packet);
  return { envelope: packet, file };
}
export async function openMessage(local, directory, cid, senderId, packet, fileBytes = null) {
  const { signature, ...signed } = packet;
  const h = packet.header, signer = directory[senderId];
  if (h.version !== 1 || h.conversation_id !== cid || h.sender_id !== senderId || !signer || h.keys[local.user_id] !== local.key_id || Object.keys(h.keys).length !== 2) throw new Error("Mensagem de outra conversa ou identidade inválida.");
  for (const uid of Object.keys(h.keys)) {
    if (!directory[uid] || directory[uid].key_id !== h.keys[uid] || await fingerprint(directory[uid].public) !== h.keys[uid]) throw new Error("A chave do contato mudou. Confira o código de segurança.");
  }
  if (!await subtle().verify({ name: "ECDSA", hash: "SHA-256" }, await importPublic(signer.public.signing_key, "ECDSA"), unb64(signature), encode(signed))) throw new Error("Assinatura inválida: a mensagem pode ter sido alterada.");
  const shared = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: await importPublic(h.ephemeral_key, "ECDH") }, local.encryptionKey, 256));
  const kek = await derive(shared, unb64(h.salt), wrapInfo(h, local.user_id)); shared.fill(0);
  const wrapped = packet.wrapped_keys[local.user_id];
  const raw = new Uint8Array(await decrypt(kek, unb64(wrapped.ciphertext), unb64(wrapped.iv), wrapInfo(h, local.user_id)));
  const key = await aes(raw); raw.fill(0);
  const value = JSON.parse(text.decode(await decrypt(key, unb64(packet.ciphertext), unb64(packet.iv), ["servicoja.payload.v1", h])));
  if (h.kind === "text" && (typeof value.text !== "string" || value.text.length > 2000)) throw new Error("Mensagem inválida.");
  if (fileBytes) {
    const a = packet.attachment;
    if (!a || a.size !== fileBytes.byteLength || await digest(fileBytes) !== a.sha256 || a.iv === packet.iv) throw new Error("Áudio alterado ou incompleto.");
    const mime = String(value.mime || "").split(";")[0];
    if (!["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav"].includes(mime)) throw new Error("Formato de áudio inválido.");
    value.audio = new Blob([await decrypt(key, fileBytes, unb64(a.iv), ["servicoja.attachment.v1", h])], { type: mime });
  }
  return value;
}
export async function securityCode(a, b) {
  const identities = [[a.user_id, a.key_id], [b.user_id, b.key_id]].sort(([x], [y]) => x.localeCompare(y));
  return (await digest(encode(["servicoja.verify.v1", identities]))).toUpperCase().match(/.{4}/g).join(" ");
}
