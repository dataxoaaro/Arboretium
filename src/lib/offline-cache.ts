// ARB-164/165: a tiny IndexedDB key→value cache for offline reads.
//
// Deliberately lighter than Dexie (PRD §8.6): v1.0 only needs to stash the
// latest successful GET payloads so they can be re-served when the network is
// down. A schema-based store (Dexie) is reserved for the v1.1 offline write
// queue. Each entry records when it was saved so the UI can show "last synced".

const DB_NAME = "arb-cache";
const STORE = "responses";
const VERSION = 1;

export interface CachedEntry<T> {
  data: T;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ data, savedAt: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function cacheGet<T>(key: string): Promise<CachedEntry<T> | null> {
  const db = await openDb();
  try {
    return await new Promise<CachedEntry<T> | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as CachedEntry<T>) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
