'use client';
import React, { createContext, useContext, useMemo } from 'react';
import { DataRepositories } from '../core/ports/repositories';
import { createMemoryRepositories } from './memory/repositories';
// import { createFirestoreRepositories } from './firebase/repositories';

const RepoContext = createContext<DataRepositories | null>(null);

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const repos = useMemo<DataRepositories>(() => {
    const driver = process.env.NEXT_PUBLIC_REPOSITORY_DRIVER ?? 'memory';
    // if (driver === 'firebase') return createFirestoreRepositories();
    return createMemoryRepositories();
  }, []);
  return <RepoContext.Provider value={repos}>{children}</RepoContext.Provider>;
}

export function useRepositories(): DataRepositories {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error('useRepositories must be used within RepositoryProvider');
  return ctx;
}
