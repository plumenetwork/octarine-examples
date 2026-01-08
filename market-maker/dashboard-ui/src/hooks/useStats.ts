import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { Period } from '../types';

export function useStats(period: Period = '7d') {
    return useQuery({
        queryKey: ['stats', period],
        queryFn: () => apiClient.getStats(period),
        refetchInterval: 30000, // Refresh every 30 seconds
    });
}
