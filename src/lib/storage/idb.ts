const DB_NAME = 'magium-pwa'
const DB_VERSION = 4

type StoreName = 'achievementProgress' | 'contributionEmailConsents' | 'contributionEmailPending' | 'contributionProfile' | 'keys' | 'saves'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys')
      }
      if (!db.objectStoreNames.contains('saves')) {
        db.createObjectStore('saves', { keyPath: 'slotId' })
      }
      if (!db.objectStoreNames.contains('achievementProgress')) {
        db.createObjectStore('achievementProgress', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('contributionProfile')) {
        db.createObjectStore('contributionProfile')
      }
      if (!db.objectStoreNames.contains('contributionEmailConsents')) {
        db.createObjectStore('contributionEmailConsents')
      }
      if (!db.objectStoreNames.contains('contributionEmailPending')) {
        db.createObjectStore('contributionEmailPending')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

export async function idbGet<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDatabase()
  return requestToPromise<T | undefined>(db.transaction(storeName, 'readonly').objectStore(storeName).get(key))
}

export async function idbSet<T>(storeName: StoreName, key: IDBValidKey, value: T): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).put(value, key)
  await transactionDone(transaction)
}

export async function idbPut<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).put(value)
  await transactionDone(transaction)
}

export async function idbDelete(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).delete(key)
  await transactionDone(transaction)
}

export async function idbClear(storeName: StoreName): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).clear()
  await transactionDone(transaction)
}

export async function idbAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase()
  return requestToPromise<T[]>(db.transaction(storeName, 'readonly').objectStore(storeName).getAll())
}

function requestToPromise<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}
