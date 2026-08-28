import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/Toast';

export function useRealtime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  React.useEffect(() => {
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('email.received', (event) => {
      try {
        const newEmail = JSON.parse(event.data);
        toast(`✉ New Email from ${newEmail.fromName || newEmail.fromEmail}`, 'info');
        // Invalidate and refetch email list queries
        queryClient.invalidateQueries({ queryKey: ['emails'] });
      } catch (err) {
        console.error('Failed to parse SSE email.received data', err);
      }
    });

    eventSource.onerror = (err) => {
      console.warn('SSE connection error:', err);
    };

    return () => {
      eventSource.close();
    };
  }, [queryClient, toast]);
}
