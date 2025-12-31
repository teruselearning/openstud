/**
 * OpenStudbook High-Capacity Local Database
 * Uses IndexedDB to store large records (images, DNA, histories) 
 * that exceed the 5MB localStorage limit.
 */

const DB_NAME = 'OpenStudbookDB';
const DB_VERSION = 1;
const STORES = {
  INDIVIDUALS: 'individuals',
  SPECIES: 'species'
};

let dbPromise: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.INDIVIDUALS)) {
        db.createObjectStore(STORES.INDIVIDUALS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SPECIES)) {
        db.createObjectStore(STORES.SPECIES, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });

  return dbPromise;
};

export const localDb = {
  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async saveAll<T extends { id: string }>(storeName: string, items: T[]): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Clear current and rewrite (simplest for sync logic)
      store.clear();
      items.forEach(item => store.put(item));

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
};
