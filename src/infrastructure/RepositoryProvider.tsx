'use client';
import React, { createContext, useContext, useMemo } from 'react';
import { DataRepositories } from '../core/ports/repositories';
import { useAuthWorkspace } from './supabase/AuthProvider';
import { getBrowserSupabase } from './supabase/browser';
import { createSupabaseRepositories } from './supabase/repositories';

const RepoContext = createContext<DataRepositories | null>(null);

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const { user, workspaceId } = useAuthWorkspace();
  const userId = user?.id ?? null;
  const repos = useMemo<DataRepositories>(() => {
    if (!userId || !workspaceId) {
      throw new Error('RepositoryProvider requires an authenticated Supabase workspace');
    }
    return createSupabaseRepositories(getBrowserSupabase(), workspaceId, userId);
  }, [userId, workspaceId]);
  return <RepoContext.Provider value={repos}>{children}</RepoContext.Provider>;
}

export function useRepositories(): DataRepositories {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error('useRepositories must be used within RepositoryProvider');
  return ctx;
}
