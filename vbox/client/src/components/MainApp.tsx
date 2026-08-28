import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { EmailItem } from './EmailItem';
import { EmailReader } from './EmailReader';
import { SettingsPage } from './SettingsPage';
import { LoginPage } from './LoginPage';
import { useRealtime } from '../hooks/useRealtime';
import { useToast } from './Toast';
import { Email, EmailListResponse } from '../types';
import { Inbox, Search } from 'lucide-react';

export const MainApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentFolder, setCurrentFolder] = useState('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Setup Real-time SSE listener
  useRealtime();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Check auth status on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (res.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      })
      .catch(() => setIsAuthenticated(false));
  }, []);

  // Fetch emails with TanStack Query
  const { data, isLoading, isError, refetch } = useQuery<EmailListResponse>({
    queryKey: ['emails', currentFolder, debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        folder: currentFolder,
        search: debouncedSearch,
        page: page.toString(),
        limit: '30'
      });
      const res = await fetch(`/api/emails?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch emails');
      return res.json();
    },
    enabled: isAuthenticated === true
  });

  // Star / Unstar mutation
  const toggleStarMutation = useMutation({
    mutationFn: async ({ email }: { email: Email }) => {
      const endpoint = email.isStarred
        ? `/api/emails/${email.id}/unstar`
        : `/api/emails/${email.id}/star`;
      const res = await fetch(endpoint, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to update star state');
      return res.json();
    },
    onSuccess: (updatedEmail: Email) => {
      toast(updatedEmail.isStarred ? '✓ Email starred' : 'Email unstarred', 'info');
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      if (selectedEmail && selectedEmail.id === updatedEmail.id) {
        setSelectedEmail(updatedEmail);
      }
    }
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async (email: Email) => {
      const res = await fetch(`/api/emails/${email.id}/archive`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to archive email');
      return res.json();
    },
    onSuccess: () => {
      toast('✓ Email archived', 'success');
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    }
  });

  // Trash mutation
  const trashMutation = useMutation({
    mutationFn: async (email: Email) => {
      const res = await fetch(`/api/emails/${email.id}/trash`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to trash email');
      return res.json();
    },
    onSuccess: () => {
      toast('✓ Email moved to trash', 'info');
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    }
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async (email: Email) => {
      const res = await fetch(`/api/emails/${email.id}/restore`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to restore email');
      return res.json();
    },
    onSuccess: () => {
      toast('✓ Email restored', 'success');
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    }
  });

  // Delete permanently mutation
  const deletePermanentlyMutation = useMutation({
    mutationFn: async (email: Email) => {
      const res = await fetch(`/api/emails/${email.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete email permanently');
      return res.json();
    },
    onSuccess: () => {
      toast('Email permanently deleted', 'info');
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    }
  });

  // Manual Resend API Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/emails/sync', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Sync failed');
      }
      return res.json();
    },
    onSuccess: (resData: { imported: number; duplicates: number }) => {
      toast(`✓ Sync complete: ${resData.imported} imported, ${resData.duplicates} existing`, 'success');
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
    onError: (err: any) => {
      toast(`Sync failed: ${err.message}`, 'error');
    }
  });

  // Keyboard Shortcuts Handler (r, e, Delete, u, s, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'Escape' && selectedEmail) {
        setSelectedEmail(null);
      } else if (e.key === 'r') {
        refetch();
      } else if (selectedEmail) {
        if (e.key === 'e') {
          archiveMutation.mutate(selectedEmail);
        } else if (e.key === 'Delete') {
          trashMutation.mutate(selectedEmail);
        } else if (e.key === 's') {
          toggleStarMutation.mutate({ email: selectedEmail });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEmail, refetch, archiveMutation, trashMutation, toggleStarMutation]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsAuthenticated(false);
  };

  if (isAuthenticated === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0B0D10]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0B0D10]">
      <Sidebar
        currentFolder={currentFolder}
        onSelectFolder={(folder) => {
          setCurrentFolder(folder);
          setSelectedEmail(null);
          setIsSettingsOpen(false);
          setPage(1);
        }}
        unreadCount={data?.unreadCount}
        onOpenSettings={() => {
          setIsSettingsOpen(true);
          setSelectedEmail(null);
        }}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={() => refetch()}
          onOpenSettings={() => {
            setIsSettingsOpen(true);
            setSelectedEmail(null);
          }}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onLogout={handleLogout}
          isSyncing={syncMutation.isPending}
        />

        <main className="flex-1 flex overflow-hidden relative">
          {isSettingsOpen ? (
            <SettingsPage
              onBack={() => setIsSettingsOpen(false)}
              onSync={() => syncMutation.mutate()}
              isSyncing={syncMutation.isPending}
            />
          ) : selectedEmail ? (
            <EmailReader
              email={selectedEmail}
              onBack={() => setSelectedEmail(null)}
              onStar={(email) => toggleStarMutation.mutate({ email })}
              onArchive={(email) => archiveMutation.mutate(email)}
              onTrash={(email) => trashMutation.mutate(email)}
              onRestore={(email) => restoreMutation.mutate(email)}
              onDeletePermanently={(email) => deletePermanentlyMutation.mutate(email)}
            />
          ) : (
            <div className="flex-1 flex flex-col h-full bg-white dark:bg-darkSurface overflow-y-auto">
              {/* Email List Skeleton Loader */}
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center gap-4 p-3 rounded-xl bg-gray-100 dark:bg-darkBg">
                      <div className="w-4 h-4 rounded bg-gray-300 dark:bg-darkBorder" />
                      <div className="w-32 h-4 rounded bg-gray-300 dark:bg-darkBorder" />
                      <div className="flex-1 h-4 rounded bg-gray-300 dark:bg-darkBorder" />
                      <div className="w-16 h-4 rounded bg-gray-300 dark:bg-darkBorder" />
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <p className="text-base font-medium text-rose-600">Something went wrong</p>
                  <p className="text-xs text-gray-400">We couldn't load your emails from the server.</p>
                  <button
                    onClick={() => refetch()}
                    className="px-4 py-2 text-xs font-medium rounded-xl bg-blue-600 text-white shadow-sm"
                  >
                    Try Again
                  </button>
                </div>
              ) : data?.emails.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 my-auto">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-darkBg text-gray-400 dark:text-darkTextSecondary flex items-center justify-center">
                    {debouncedSearch ? <Search className="w-8 h-8" /> : <Inbox className="w-8 h-8" />}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-darkTextPrimary">
                      {debouncedSearch ? 'No emails found' : 'Your inbox is empty'}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-darkTextSecondary mt-1">
                      {debouncedSearch
                        ? 'Try a different search query or filter.'
                        : 'New inbound emails from Resend will appear here automatically.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-darkBorder">
                  {data?.emails.map((email: Email) => (
                    <EmailItem
                      key={email.id}
                      email={email}
                      isSelected={selectedEmail !== null && (selectedEmail as Email).id === email.id}
                      onSelect={(e) => setSelectedEmail(e)}
                      onToggleStar={(evt, e) => {
                        evt.stopPropagation();
                        toggleStarMutation.mutate({ email: e });
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
