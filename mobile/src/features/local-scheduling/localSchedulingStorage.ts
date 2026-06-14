import { getStoredJson, setStoredJson } from '@/src/shared/storage/asyncStorage';

type MemoryStore = Record<string, string>;

let useMemoryStore = false;
let memoryStore: MemoryStore = {};

export function useInMemoryLocalSchedulingStorageForTests() {
  useMemoryStore = true;
  memoryStore = {};
}

export function resetInMemoryLocalSchedulingStorageForTests() {
  memoryStore = {};
}

export async function readSchedulingJson<T>(key: string, fallback: T): Promise<T> {
  if (useMemoryStore) {
    const rawValue = memoryStore[key];

    if (!rawValue) {
      return fallback;
    }

    try {
      return JSON.parse(rawValue) as T;
    } catch {
      return fallback;
    }
  }

  return getStoredJson(key, fallback);
}

export async function writeSchedulingJson<T>(key: string, value: T): Promise<boolean> {
  if (useMemoryStore) {
    memoryStore[key] = JSON.stringify(value);
    return true;
  }

  return setStoredJson(key, value);
}
