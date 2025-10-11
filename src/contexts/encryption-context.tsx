"use client";

import React, { createContext, useContext } from 'react';
import { useEncryption } from '@/hooks/use-encryption';

type EncryptionContextType = ReturnType<typeof useEncryption>;

const EncryptionContext = createContext<EncryptionContextType | null>(null);

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const encryption = useEncryption();

  return (
    <EncryptionContext.Provider value={encryption}>
      {children}
    </EncryptionContext.Provider>
  );
}

export function useEncryptionContext() {
  const context = useContext(EncryptionContext);
  if (!context) {
    throw new Error('useEncryptionContext must be used within EncryptionProvider');
  }
  return context;
}
