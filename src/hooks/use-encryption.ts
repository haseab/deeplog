"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  deriveKeyFromHash,
  hashPin,
  getDeviceId,
  validatePin,
} from '@/lib/encryption';

interface EncryptionState {
  isE2EEEnabled: boolean;
  isUnlocked: boolean;
  sessionKey: Buffer | null;
  encryptedEntries: Set<number>;
  pinHash: string | null;
  failedAttempts: number;
  lockedUntil: number | null;
}

const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Hook for managing E2EE state and operations
 */
export function useEncryption() {
  const [state, setState] = useState<EncryptionState>({
    isE2EEEnabled: false,
    isUnlocked: false,
    sessionKey: null,
    encryptedEntries: new Set(),
    pinHash: null,
    failedAttempts: 0,
    lockedUntil: null,
  });

  // Use ref to keep session key in memory only (not in React state)
  const sessionKeyRef = useRef<Buffer | null>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const enabled = localStorage.getItem('e2ee_enabled') === 'true';
    const pinHash = localStorage.getItem('e2ee_pin_hash'); // Store hashed PIN
    const encryptedEntriesJson = localStorage.getItem('e2ee_encrypted_entries');
    const lockedUntil = localStorage.getItem('e2ee_locked_until');

    let encryptedEntries = new Set<number>();
    if (encryptedEntriesJson) {
      try {
        const parsed = JSON.parse(encryptedEntriesJson);
        encryptedEntries = new Set(parsed);
      } catch (error) {
        console.error('[E2EE] Failed to parse encrypted entries:', error);
      }
    }

    const lockedUntilTime = lockedUntil ? parseInt(lockedUntil, 10) : null;
    const isCurrentlyLocked = lockedUntilTime && Date.now() < lockedUntilTime;

    // Auto-unlock if PIN hash is stored and E2EE is enabled
    let key: Buffer | null = null;
    let isUnlocked = false;
    if (enabled && pinHash && !isCurrentlyLocked) {
      try {
        const deviceId = getDeviceId();
        key = deriveKeyFromHash(pinHash, deviceId);
        sessionKeyRef.current = key;
        isUnlocked = true;
      } catch (error) {
        console.error('[E2EE] Failed to auto-unlock:', error);
      }
    }


    setState({
      isE2EEEnabled: enabled,
      isUnlocked,
      sessionKey: key,
      encryptedEntries,
      pinHash,
      failedAttempts: isCurrentlyLocked ? MAX_ATTEMPTS : 0,
      lockedUntil: isCurrentlyLocked ? lockedUntilTime : null,
    });
  }, []);

  // Save encrypted entries to localStorage whenever they change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (state.encryptedEntries.size > 0) {
      const arr = Array.from(state.encryptedEntries);
      localStorage.setItem('e2ee_encrypted_entries', JSON.stringify(arr));
    }
  }, [state.encryptedEntries]);

  /**
   * Check if currently locked out due to failed attempts
   */
  const isLockedOut = useCallback((): boolean => {
    if (!state.lockedUntil) return false;
    if (Date.now() >= state.lockedUntil) {
      // Lockout expired
      setState(prev => ({ ...prev, failedAttempts: 0, lockedUntil: null }));
      localStorage.removeItem('e2ee_locked_until');
      return false;
    }
    return true;
  }, [state.lockedUntil]);

  /**
   * Get remaining lockout time in seconds
   */
  const getLockoutTimeRemaining = useCallback((): number => {
    if (!state.lockedUntil) return 0;
    const remaining = Math.max(0, state.lockedUntil - Date.now());
    return Math.ceil(remaining / 1000);
  }, [state.lockedUntil]);

  /**
   * Enable E2EE with new PIN
   */
  const enableE2EE = useCallback((pin: string): { success: boolean; error?: string } => {
    const validation = validatePin(pin);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const pinHashValue = hashPin(pin);
      const deviceId = getDeviceId();
      const key = deriveKeyFromHash(pinHashValue, deviceId);

      localStorage.setItem('e2ee_enabled', 'true');
      localStorage.setItem('e2ee_pin_hash', pinHashValue); // Store hash, not raw PIN

      sessionKeyRef.current = key;

      setState(prev => ({
        ...prev,
        isE2EEEnabled: true,
        isUnlocked: true,
        sessionKey: key,
        pinHash: pinHashValue,
      }));

      return { success: true };
    } catch (error) {
      console.error('[E2EE] Failed to enable:', error);
      return { success: false, error: 'Failed to enable encryption' };
    }
  }, []);

  /**
   * Disable E2EE (requires PIN verification)
   */
  const disableE2EE = useCallback((pin: string): { success: boolean; error?: string } => {
    if (!state.pinHash) {
      return { success: false, error: 'No PIN configured' };
    }

    // Verify PIN by hashing and comparing
    const enteredPinHash = hashPin(pin);
    if (enteredPinHash !== state.pinHash) {
      return { success: false, error: 'Incorrect PIN' };
    }

    // Clear all E2EE data
    localStorage.removeItem('e2ee_enabled');
    localStorage.removeItem('e2ee_pin_hash');
    localStorage.removeItem('e2ee_encrypted_entries');
    localStorage.removeItem('e2ee_locked_until');

    sessionKeyRef.current = null;

    setState({
      isE2EEEnabled: false,
      isUnlocked: false,
      sessionKey: null,
      encryptedEntries: new Set(),
      pinHash: null,
      failedAttempts: 0,
      lockedUntil: null,
    });

    return { success: true };
  }, [state.pinHash]);

  /**
   * Unlock E2EE session with PIN
   */
  const unlockE2EE = useCallback((pin: string): { success: boolean; error?: string } => {
    if (isLockedOut()) {
      const remaining = getLockoutTimeRemaining();
      return {
        success: false,
        error: `Too many attempts. Try again in ${remaining} seconds`,
      };
    }

    if (!state.pinHash) {
      return { success: false, error: 'No PIN configured' };
    }

    // Verify PIN by hashing and comparing
    const enteredPinHash = hashPin(pin);

    if (enteredPinHash !== state.pinHash) {
      const newAttempts = state.failedAttempts + 1;

      if (newAttempts >= MAX_ATTEMPTS) {
        const lockedUntil = Date.now() + LOCKOUT_DURATION;
        localStorage.setItem('e2ee_locked_until', lockedUntil.toString());
        setState(prev => ({ ...prev, failedAttempts: newAttempts, lockedUntil }));
        return {
          success: false,
          error: `Too many attempts. Locked for ${LOCKOUT_DURATION / 60000} minutes`,
        };
      }

      setState(prev => ({ ...prev, failedAttempts: newAttempts }));
      return {
        success: false,
        error: `Incorrect PIN (${newAttempts}/${MAX_ATTEMPTS} attempts)`,
      };
    }

    // Success - derive key and unlock
    try {
      const deviceId = getDeviceId();
      const key = deriveKeyFromHash(enteredPinHash, deviceId);

      sessionKeyRef.current = key;

      setState(prev => ({
        ...prev,
        isUnlocked: true,
        sessionKey: key,
        failedAttempts: 0,
        lockedUntil: null,
      }));

      localStorage.removeItem('e2ee_locked_until');

      return { success: true };
    } catch (error) {
      console.error('[E2EE] Failed to unlock:', error);
      return { success: false, error: 'Failed to unlock' };
    }
  }, [state.pinHash, state.failedAttempts, isLockedOut, getLockoutTimeRemaining]);

  /**
   * Lock E2EE session (clear session key)
   */
  const lockE2EE = useCallback(() => {
    sessionKeyRef.current = null;
    setState(prev => ({
      ...prev,
      isUnlocked: false,
      sessionKey: null,
    }));
  }, []);

  /**
   * Change PIN (requires old PIN verification)
   */
  const changePin = useCallback(
    (oldPin: string, newPin: string): { success: boolean; error?: string } => {
      if (!state.pinHash) {
        return { success: false, error: 'No PIN configured' };
      }

      // Verify old PIN by hashing and comparing
      const oldPinHash = hashPin(oldPin);

      if (oldPinHash !== state.pinHash) {
        return { success: false, error: 'Incorrect current PIN' };
      }

      const validation = validatePin(newPin);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      try {
        const newPinHash = hashPin(newPin);
        const deviceId = getDeviceId();
        const newKey = deriveKeyFromHash(newPinHash, deviceId);

        localStorage.setItem('e2ee_pin_hash', newPinHash);

        sessionKeyRef.current = newKey;

        setState(prev => ({
          ...prev,
          sessionKey: newKey,
          pinHash: newPinHash,
        }));

        return { success: true };
      } catch (error) {
        console.error('[E2EE] Failed to change PIN:', error);
        return { success: false, error: 'Failed to change PIN' };
      }
    },
    [state.pinHash]
  );

  /**
   * Check if an entry is encrypted
   */
  const isEntryEncrypted = useCallback(
    (entryId: number): boolean => {
      return state.encryptedEntries.has(entryId);
    },
    [state.encryptedEntries]
  );

  /**
   * Mark an entry as encrypted
   */
  const markEntryEncrypted = useCallback((entryId: number) => {
    setState(prev => ({
      ...prev,
      encryptedEntries: new Set([...prev.encryptedEntries, entryId]),
    }));
  }, []);

  /**
   * Mark an entry as decrypted (remove from set)
   */
  const markEntryDecrypted = useCallback((entryId: number) => {
    setState(prev => {
      const newSet = new Set(prev.encryptedEntries);
      newSet.delete(entryId);
      return { ...prev, encryptedEntries: newSet };
    });
  }, []);

  /**
   * Swap temp ID with real ID in encrypted entries set (when server resolves temp ID)
   */
  const swapEncryptedEntryId = useCallback((tempId: number, realId: number) => {
    setState(prev => {
      const newSet = new Set(prev.encryptedEntries);
      if (newSet.has(tempId)) {
        newSet.delete(tempId);
        newSet.add(realId);
      }
      return { ...prev, encryptedEntries: newSet };
    });
  }, []);

  /**
   * Get session key (use ref to avoid stale closures)
   */
  const getSessionKey = useCallback((): Buffer | null => {
    return sessionKeyRef.current;
  }, []);

  return {
    // State
    isE2EEEnabled: state.isE2EEEnabled,
    isUnlocked: state.isUnlocked,
    sessionKey: state.sessionKey,
    encryptedEntries: state.encryptedEntries,
    failedAttempts: state.failedAttempts,

    // Functions
    enableE2EE,
    disableE2EE,
    unlockE2EE,
    lockE2EE,
    changePin,
    isEntryEncrypted,
    markEntryEncrypted,
    markEntryDecrypted,
    swapEncryptedEntryId,
    getSessionKey,
    isLockedOut,
    getLockoutTimeRemaining,
  };
}
