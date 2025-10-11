const crypto = require('crypto');

// Configuration
const SALT = 'deeplog-e2ee-v1';

// Get PIN and deviceId from command line arguments
const pin = process.argv[2] || "123456";
const deviceId = process.argv[3] || "example-device-id-32chars-here";

console.log('=== PIN Hashing Test ===\n');

// Step 1: Hash the PIN
const pinHashInput = pin + SALT + '_pin_hash';
console.log('Step 1: Hash PIN');
console.log('  Input string:', JSON.stringify(pinHashInput));
console.log('  Input length:', pinHashInput.length);

const pinHash = crypto.createHash('sha256').update(pinHashInput).digest('hex');
console.log('  Output (pinHash):', pinHash);
console.log('  Output length:', pinHash.length);

console.log('\n=== Encryption Key Derivation ===\n');

// Step 2: Derive encryption key
const keyInput = pinHash + deviceId + SALT;
console.log('Step 2: Derive Encryption Key');
console.log('  Input string:', JSON.stringify(keyInput));
console.log('  Input length:', keyInput.length);

const encryptionKey = crypto.createHash('sha256').update(keyInput).digest('hex');
console.log('  Output (key):', encryptionKey);
console.log('  Output length:', encryptionKey.length);

console.log('\n=== Summary ===\n');
console.log('PIN:', pin);
console.log('PIN Hash (stored in localStorage):', pinHash);
console.log('Encryption Key (used for AES-256-GCM):', encryptionKey);
