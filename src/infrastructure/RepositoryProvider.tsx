'use client';
import React, { createContext, useContext, useMemo } from 'react';
import { DataRepositories } from '../core/ports/repositories';
import { useAuthWorkspace } from './supabase/AuthProvider';
import { getBrowserSupabase } from './supabase/browser';
import { createSupabaseRepositories } from './supabase/repositories';

const RepoContext = createContext<DataRepositories | null>(null);

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const { user, workspaceId } = useAuthWorkspace();
  const repos = useMemo<DataRepositories>(() => {
    if (!user || !workspaceId) {
      throw new Error('RepositoryProvider requires an authenticated Supabase workspace');
    }
    return createSupabaseRepositories(getBrowserSupabase(), workspaceId, user.id);
  }, [user, workspaceId]);
  return <RepoContext.Provider value={repos}>{children}</RepoContext.Provider>;
}

export function useRepositories(): DataRepositories {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error('useRepositories must be used within RepositoryProvider');
  return ctx;
}
