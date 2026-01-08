import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { Period } from '../types';

export function useRedemptions(period: Period = '7d', limit = 50, offset = 0) {
    return useQuery({
        queryKey: ['redemptions', period, limit, offset],
        queryFn: () => apiClient.getRedemptions(period, limit, offset),
        refetchInterval: 30000,
    });
}
