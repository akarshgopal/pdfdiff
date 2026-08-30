import type { DiffOptions } from "./PdfDiffApp";

const DATABASE_NAME = "pdfdiff-history";
const DATABASE_VERSION = 1;
const STORE_NAME = "comparisons";
const MAX_SAVED_COMPARISONS = 6;

export interface ComparisonHistorySummary {
  id: string;
  earlierName: string;
  earlierSize: number;
  newerName: string;
  newerSize: number;
  updatedAt: number;
}

interface StoredComparison extends ComparisonHistorySummary {
  earlierBlob: Blob;
  earlierLastModified: number;
  earlierType: string;
  newerBlob: Blob;
  newerLastModified: number;
  newerType: string;
  options: DiffOptions;
}

export interface ResumableComparison {
  id: string;
  earlierFile: File;
  newerFile: File;
  options: DiffOptions;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open comparison history."));
  });
}

async function withDatabase<T>(operation: (database: IDBDatabase) => Promise<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await operation(database);
  } finally {
    database.close();
  }
}

function readRequest<T>(createRequest: (store: IDBObjectStore) => IDBRequest<T>, errorMessage: string): Promise<T> {
  return withDatabase((database) => new Promise((resolve, reject) => {
    const request = createRequest(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(errorMessage));
  }));
}

function writeTransaction(operation: (store: IDBObjectStore) => void, errorMessage: string): Promise<void> {
  return withDatabase((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    operation(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error(errorMessage));
    transaction.onabort = () => reject(transaction.error ?? new Error(errorMessage));
  }));
}

async function readAll(): Promise<StoredComparison[]> {
  return readRequest((store) => store.getAll() as IDBRequest<StoredComparison[]>, "Unable to read comparison history.");
}

export async function listComparisonHistory(): Promise<ComparisonHistorySummary[]> {
  const records = await readAll();
  return records
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map(({ id, earlierName, earlierSize, newerName, newerSize, updatedAt }) => ({
      id,
      earlierName,
      earlierSize,
      newerName,
      newerSize,
      updatedAt,
    }));
}

export async function saveComparisonHistory(input: {
  id?: string;
  earlierFile: File;
  newerFile: File;
  options: DiffOptions;
}): Promise<void> {
  const record: StoredComparison = {
    id: input.id ?? crypto.randomUUID(),
    earlierName: input.earlierFile.name,
    earlierSize: input.earlierFile.size,
    earlierBlob: input.earlierFile,
    earlierLastModified: input.earlierFile.lastModified,
    earlierType: input.earlierFile.type,
    newerName: input.newerFile.name,
    newerSize: input.newerFile.size,
    newerBlob: input.newerFile,
    newerLastModified: input.newerFile.lastModified,
    newerType: input.newerFile.type,
    options: input.options,
    updatedAt: Date.now(),
  };

  await writeTransaction((store) => { store.put(record); }, "Unable to save comparison history.");

  const records = await readAll();
  const expiredIds = records
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(MAX_SAVED_COMPARISONS)
    .map((item) => item.id);
  if (expiredIds.length === 0) return;

  await writeTransaction((store) => {
    expiredIds.forEach((id) => store.delete(id));
  }, "Unable to trim comparison history.");
}

export async function loadComparisonHistory(id: string): Promise<ResumableComparison | null> {
  const record = await readRequest((store) => store.get(id) as IDBRequest<StoredComparison | undefined>, "Unable to load this comparison.");
  if (!record) return null;
  return {
    id: record.id,
    earlierFile: new File([record.earlierBlob], record.earlierName, {
      type: record.earlierType || "application/pdf",
      lastModified: record.earlierLastModified,
    }),
    newerFile: new File([record.newerBlob], record.newerName, {
      type: record.newerType || "application/pdf",
      lastModified: record.newerLastModified,
    }),
    options: record.options,
  };
}

export async function clearComparisonHistory(): Promise<void> {
  await writeTransaction((store) => { store.clear(); }, "Unable to clear comparison history.");
}
