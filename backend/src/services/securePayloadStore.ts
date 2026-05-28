import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { backendEnv } from '../config/env.js';

const STORE_ROOT = path.join(process.cwd(), 'data', 'secure-store');

function resolveEncryptionKey() {
  const raw = backendEnv.BACKEND_SECRETS_KEY.trim();

  if (!raw) {
    return createHash('sha256').update('executive-ai-dev-only-key').digest();
  }

  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  return createHash('sha256').update(raw).digest();
}

function encryptJson(value: unknown) {
  const key = resolveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    payload: encrypted.toString('base64'),
  };
}

function decryptJson<T>(envelope: { iv: string; tag: string; payload: string }) {
  const key = resolveEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.payload, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8')) as T;
}

function sanitizeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function writeSecurePayload(namespace: string, key: string, value: unknown) {
  const directory = path.join(STORE_ROOT, namespace);
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${sanitizeKey(key)}.json`);
  const envelope = encryptJson(value);

  await writeFile(filePath, JSON.stringify(envelope), 'utf8');
}

export async function readSecurePayload<T>(namespace: string, key: string) {
  const filePath = path.join(STORE_ROOT, namespace, `${sanitizeKey(key)}.json`);

  try {
    const raw = await readFile(filePath, 'utf8');
    const envelope = JSON.parse(raw) as { iv: string; tag: string; payload: string };

    return decryptJson<T>(envelope);
  } catch {
    return null;
  }
}

export async function deleteSecurePayload(namespace: string, key: string) {
  const filePath = path.join(STORE_ROOT, namespace, `${sanitizeKey(key)}.json`);

  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
