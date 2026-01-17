import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { Period } from '../types';

export function useLiquidations(period: Period = '7d', limit = 50, offset = 0) {
    return useQuery({
        queryKey: ['liquidations', period, limit, offset],
        queryFn: () => apiClient.getLiquidations(period, limit, offset),
        refetchInterval: 30000,
    });
}
