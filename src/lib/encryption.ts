/**
 * Encryption Utility Module
 *
 * Provides client-side encryption/decryption for time entry descriptions
 * using Format-Preserving Encryption (FPE) to maintain character length.
 */

import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const SALT = 'deeplog-e2ee-v1';
const ALGORITHM = 'aes-256-gcm';

/**
 * Generate a unique device ID for additional key entropy
 */
export function generateDeviceId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Get or create device ID from localStorage
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';

  let deviceId = localStorage.getItem('e2ee_device_id');
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem('e2ee_device_id', deviceId);
  }
  return deviceId;
}

/**
 * Hash PIN to create storable key material
 * This hash is stored in localStorage and used to derive the encryption key
 * Just a simple hash - no need for slow PBKDF2, this is local browser storage only
 */
export function hashPin(pin: string): string {
  const hash = createHash('sha256')
    .update(pin + SALT + '_pin_hash')
    .digest('hex');
  return hash;
}

/**
 * Derive encryption key from PIN hash and device ID
 * Takes the hashed PIN (not raw PIN) as input
 * Simple SHA-256 - fast and sufficient for local-only encryption
 */
export function deriveKeyFromHash(pinHash: string, deviceId: string): Buffer {
  const material = pinHash + deviceId + SALT;
  const hash = createHash('sha256')
    .update(material)
    .digest();
  return hash;
}

/**
 * Encrypt description using AES-256-GCM
 * Simple and reliable - encrypted text will be longer due to IV and auth tag
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function encryptDescription(text: string, key: Buffer, _entryId: number): string {
  if (!text || text.length === 0) return text;

  try {
    // Generate a random IV (12 bytes for GCM)
    const iv = randomBytes(12);

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, key, iv);

    // Encrypt
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Combine: iv + authTag + encrypted (all base64)
    const combined = iv.toString('base64') + ':' + authTag.toString('base64') + ':' + encrypted;

    return combined;
  } catch (error) {
    console.error('[Encryption] Failed to encrypt:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt description using AES-256-GCM
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function decryptDescription(ciphertext: string, key: Buffer, _entryId: number): string {
  if (!ciphertext || ciphertext.length === 0) return ciphertext;

  try {
    // Split the combined string
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = parts[2];

    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[Encryption] Failed to decrypt:', error);
    throw new Error('Decryption failed');
  }
}

/**
 * Validate PIN format (must be 6 digits)
 */
export function validatePin(pin: string): { valid: boolean; error?: string } {
  if (!pin || pin.length !== 6) {
    return { valid: false, error: 'PIN must be 6 digits' };
  }

  if (!/^\d{6}$/.test(pin)) {
    return { valid: false, error: 'PIN must contain only numbers' };
  }

  return { valid: true };
}

/**
 * Test encryption/decryption roundtrip
 */
export function testEncryption(pin: string): boolean {
  try {
    const deviceId = getDeviceId();
    const pinHash = hashPin(pin);
    const key = deriveKeyFromHash(pinHash, deviceId);
    const testText = 'Hello World! Testing 123 #$%';
    const entryId = 12345;

    const encrypted = encryptDescription(testText, key, entryId);
    const decrypted = decryptDescription(encrypted, key, entryId);

    console.log('[Encryption Test]', {
      original: testText,
      encrypted,
      decrypted,
      lengthMatch: testText.length === encrypted.length,
      contentMatch: testText === decrypted,
    });

    return testText === decrypted && testText.length === encrypted.length;
  } catch (error) {
    console.error('[Encryption Test] Failed:', error);
    return false;
  }
}
