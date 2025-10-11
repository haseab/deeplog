# E2EE (End-to-End Encryption) Implementation Plan

## Overview
Implement client-side encryption for time entry descriptions using a 6-digit PIN. Data is encrypted locally before being sent to Toggl servers, ensuring privacy while staying within Toggl's 3000 character limit.

## Encryption Strategy

### Challenge: Character Limit
Toggl has a 3000 character limit for descriptions. Standard encryption (AES-256) would expand the data significantly due to:
- Base64 encoding (33% overhead)
- IV (initialization vector) storage
- Authentication tags

### Solution: Format-Preserving Encryption (FPE)
Use **FF3-1 algorithm** (NIST-approved Format-Preserving Encryption):
- **No expansion**: Encrypted text is same length as plaintext
- **Preserves character set**: Can restrict to printable characters
- **NIST standard**: Secure and vetted
- **6-digit PIN**: Derives 128-bit key using PBKDF2
- **Per-entry IV**: Store hash of entry timestamp as deterministic IV

### Implementation Library
Use `node-fpe` or `fpe-js` for FF3-1:
```bash
npm install fpe-js
```

### Key Derivation
```typescript
// Derive 128-bit key from 6-digit PIN
const key = PBKDF2(pin + deviceId, salt="deeplog-e2ee", iterations=100000, keylen=16)
```

## Architecture

### Storage
- **PIN hash**: Store in localStorage (PBKDF2 hash for verification)
- **Device ID**: Generate once, store in localStorage (adds entropy to key derivation)
- **E2EE enabled flag**: Store in localStorage
- **Encrypted flag per entry**: Track which descriptions are encrypted

### Encryption Flow
1. User enters description
2. If E2EE enabled → encrypt before syncing to Toggl
3. Store marker in localStorage: `encrypted_entries: Set<entryId>`
4. Description stays same length, looks like random characters

### Decryption Flow
1. Fetch entries from Toggl
2. Check if entry ID in `encrypted_entries` set
3. If encrypted → decrypt for display
4. User sees original plaintext

## Implementation Tasks

### 1. **Create Encryption Utility Module**
   - File: `src/lib/encryption.ts`
   - Functions:
     - `deriveKey(pin: string, deviceId: string): string`
     - `encryptDescription(text: string, key: string, entryId: number): string`
     - `decryptDescription(ciphertext: string, key: string, entryId: number): string`
     - `hashPin(pin: string): string` (for verification)
     - `generateDeviceId(): string`
     - `verifyPin(pin: string, hash: string): boolean`
   - Use FPE (Format-Preserving Encryption) to maintain character length
   - Store device ID in localStorage on first generation

### 2. **Create E2EE Settings Hook**
   - File: `src/hooks/use-encryption.ts`
   - State management for:
     - `isE2EEEnabled: boolean`
     - `isUnlocked: boolean` (PIN verified in current session)
     - `encryptedEntries: Set<number>` (which entries are encrypted)
   - Functions:
     - `enableE2EE(pin: string): void`
     - `disableE2EE(pin: string): Promise<void>` (decrypts all entries first)
     - `lockE2EE(): void` (clears session key)
     - `unlockE2EE(pin: string): boolean`
     - `isEntryEncrypted(entryId: number): boolean`
     - `markEntryEncrypted(entryId: number): void`
     - `markEntryDecrypted(entryId: number): void`
   - Load settings from localStorage on mount
   - Store encrypted entry IDs in localStorage

### 3. **Create PIN Entry Dialog Component**
   - File: `src/components/pin-dialog.tsx`
   - Props:
     - `open: boolean`
     - `onOpenChange: (open: boolean) => void`
     - `mode: 'setup' | 'verify' | 'change'`
     - `onSuccess: (pin: string) => void`
   - Features:
     - 6-digit numeric input with individual boxes
     - Auto-focus next box on digit entry
     - Show/hide PIN toggle
     - Confirmation field for setup/change mode
     - Validation: must be 6 digits
     - Error display for wrong PIN
     - Keyboard shortcuts: Enter to submit, Escape to cancel

### 4. **Update App Settings Component**
   - File: `src/components/app-settings.tsx`
   - Add E2EE section in "General" tab:
     ```tsx
     <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
       <div className="space-y-0.5">
         <Label htmlFor="e2ee-mode" className="text-base font-medium">
           End-to-End Encryption
         </Label>
         <p className="text-sm text-muted-foreground">
           Encrypt time entry descriptions locally with a 6-digit PIN
         </p>
       </div>
       <Switch
         id="e2ee-mode"
         checked={isE2EEEnabled}
         onCheckedChange={handleE2EEToggle}
       />
     </div>
     ```
   - When toggled ON:
     - Show PIN setup dialog
     - After PIN set, enable encryption for future entries
   - When toggled OFF:
     - Prompt for PIN verification
     - Decrypt all encrypted entries
     - Clear encryption settings
   - Add "Change PIN" button when E2EE enabled
   - Add "Lock/Unlock" status indicator

### 5. **Integrate Encryption into Time Entry Operations**
   - File: `src/components/time-tracker-table.tsx`

   **On Entry Creation:**
   ```typescript
   const handleStartTimer = async (description: string) => {
     let finalDescription = description;
     if (isE2EEEnabled && isUnlocked) {
       finalDescription = encryptDescription(description, sessionKey, tempId);
       markEntryEncrypted(tempId);
     }
     // ... existing logic
   }
   ```

   **On Entry Fetch/Display:**
   ```typescript
   const decryptedEntries = useMemo(() => {
     if (!isE2EEEnabled || !isUnlocked) return timeEntries;

     return timeEntries.map(entry => {
       if (isEntryEncrypted(entry.id)) {
         return {
           ...entry,
           description: decryptDescription(entry.description, sessionKey, entry.id)
         };
       }
       return entry;
     });
   }, [timeEntries, isE2EEEnabled, isUnlocked, sessionKey]);
   ```

   **On Entry Update:**
   ```typescript
   const handleDescriptionUpdate = async (id: number, newDescription: string) => {
     let finalDescription = newDescription;
     if (isE2EEEnabled && isUnlocked && isEntryEncrypted(id)) {
       finalDescription = encryptDescription(newDescription, sessionKey, id);
     }
     // ... existing API call
   }
   ```

### 6. **Add Session Lock/Unlock UI**
   - File: `src/components/encryption-status.tsx`
   - Small indicator in header showing:
     - 🔒 Locked (when E2EE enabled but locked)
     - 🔓 Unlocked (when E2EE enabled and unlocked)
     - Click to lock/unlock
   - On app load with E2EE enabled:
     - Show locked state
     - Prompt for PIN before showing decrypted data
   - Auto-lock after inactivity (optional, configurable)

### 7. **Handle Edge Cases**
   - **Bulk operations**: Encrypt/decrypt all entries in split/combine operations
   - **Entry duplication**: New entry should be encrypted if source was encrypted
   - **Export/Import**: Warn user that exported data will be encrypted
   - **Search/Filter**: Decrypt before filtering (or filter on encrypted data)
   - **Recent timers cache**: Store decrypted descriptions only when unlocked
   - **PIN forgotten**: Add recovery flow (decrypt using master password? or accept data loss)

### 8. **Add Encryption Migration Flow**
   - When enabling E2EE on existing account:
     - Offer to encrypt all existing entries
     - Show progress bar during bulk encryption
     - API calls to update all descriptions
   - When disabling E2EE:
     - Require PIN verification
     - Decrypt all entries back to plaintext
     - Show progress bar during bulk decryption

## Storage Schema

### localStorage Keys
```typescript
{
  "e2ee_enabled": boolean,
  "e2ee_pin_hash": string,           // PBKDF2 hash of PIN
  "e2ee_device_id": string,          // UUID for key derivation
  "e2ee_encrypted_entries": string,  // JSON array of encrypted entry IDs
  "e2ee_auto_lock_minutes": number   // Optional: auto-lock timeout
}
```

## Security Considerations

1. **PIN Strength**: 6 digits = 1 million combinations (weak but user-friendly)
   - Add rate limiting to prevent brute force (3 attempts, 5 min lockout)
   - Consider adding optional longer passphrase mode

2. **Key Storage**: Never store raw PIN or derived key in localStorage
   - Session key only in memory during unlocked session
   - Clear on lock/logout/page refresh

3. **IV/Nonce**: Use deterministic IV based on entry ID
   - FPE requires consistent encryption for same input
   - Trade-off: deterministic but necessary for format preservation

4. **Encrypted Entry Tracking**: Store which entries are encrypted
   - Required to know what to decrypt
   - Not sensitive information

5. **Migration Safety**: Ensure atomic operations when encrypting/decrypting all entries
   - Use transaction-like pattern
   - Rollback on failure

## Testing Checklist
- [ ] Enable E2EE and set PIN
- [ ] Create new entry → verify it's encrypted on Toggl
- [ ] Refresh page → verify locked state, prompt for PIN
- [ ] Unlock with correct PIN → verify descriptions decrypt
- [ ] Try wrong PIN 3 times → verify lockout
- [ ] Edit encrypted entry → verify stays encrypted
- [ ] Disable E2EE → verify all entries decrypt
- [ ] Change PIN → verify re-encryption works
- [ ] Test with entries near 3000 char limit
- [ ] Lock session → verify can't see descriptions
- [ ] Test split/combine with encrypted entries
- [ ] Test bulk operations (delete multiple, combine, split)

## Files to Create

**Create:**
1. `src/lib/encryption.ts` (~150 lines) - Core encryption logic
2. `src/hooks/use-encryption.ts` (~200 lines) - E2EE state management
3. `src/components/pin-dialog.tsx` (~200 lines) - PIN entry UI
4. `src/components/encryption-status.tsx` (~100 lines) - Lock/unlock indicator

**Modify:**
1. `src/components/app-settings.tsx` (~100 lines added) - E2EE toggle & settings
2. `src/components/time-tracker-table.tsx` (~150 lines added) - Encrypt/decrypt integration
3. `src/app/api/time-entries/route.ts` (minimal changes) - Pass through encrypted data
4. `package.json` - Add `fpe-js` dependency

## Estimated Effort
- Encryption utility module: 2 hours
- E2EE hook & state management: 2 hours
- PIN dialog component: 1.5 hours
- Settings integration: 1 hour
- Time tracker integration: 2 hours
- Encryption status indicator: 1 hour
- Edge cases & migration: 2 hours
- Testing & refinement: 2 hours
**Total: ~13.5 hours**

## Alternative: If FPE doesn't work

If Format-Preserving Encryption proves too complex or has compatibility issues, fallback to:

**Compressed + Encrypted approach:**
1. Compress description (gzip/brotli)
2. Encrypt with AES-256-GCM
3. Base64 encode
4. If result > 3000 chars:
   - Truncate plaintext first
   - Show warning to user
   - Store full version in localStorage as backup

This has worse UX (possible data loss) but is simpler to implement.
