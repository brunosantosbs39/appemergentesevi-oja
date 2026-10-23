// IndexedDB stores non-extractable CryptoKeys, public fingerprints and encrypted
// registration data. Recovery codes and exported private JWKs are never stored.
const DB = "servicoja-e2ee-v1";
function open() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("Este navegador não permite guardar as chaves. Desative a navegação privada ou use outro navegador."));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Não foi possível abrir o armazenamento seguro deste aparelho."));
  });
}
async function read(key) {
  const db = await open();
  try { return await new Promise((resolve, reject) => { const tx = db.transaction("state", "readonly"), req = tx.objectStore("state").get(key); req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error); }); }
  finally { db.close(); }
}
async function putOnce(key, value, field) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readwrite"), store = tx.objectStore("state");
      let failure;
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result[field] !== value[field]) { failure = new Error("A chave desta conta ou contato mudou. Não foi substituída. Confira o código de segurança."); tx.abort(); return; }
        store.put(value, key);
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(failure || new Error("Não foi possível salvar as chaves neste aparelho."));
    });
  } finally { db.close(); }
}
export const readIdentity = (uid) => read(`identity:${uid}`);
export const saveIdentity = (record) => putOnce(`identity:${record.user_id}`, record, "key_id");
export const pinContact = (uid, peer) => putOnce(`pin:${uid}:${peer.user_id}`, { user_id: peer.user_id, key_id: peer.key_id }, "key_id");
export async function forgetIdentity(uid) {
  const db = await open();
  try { await new Promise((resolve, reject) => { const tx = db.transaction("state", "readwrite"); tx.objectStore("state").delete(`identity:${uid}`); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}
export function clearChatCache(uid) {
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i));
    for (const key of keys) if (key?.startsWith(`sj-draft:${uid}:`) || key?.startsWith(`sj-outbox:${uid}:`)) sessionStorage.removeItem(key);
  } catch { /* Browser can deny sessionStorage; no plaintext fallback. */ }
}
