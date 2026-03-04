import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { Period } from '../types';

export function useFailedTransactions(period: Period = '7d') {
    return useQuery({
        queryKey: ['failedTransactions', period],
        queryFn: () => apiClient.getFailedTransactions(period),
        refetchInterval: 15000,
    });
}

export function useRetryFailedTransaction() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => apiClient.retryFailedTransaction(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['failedTransactions'] });
        },
    });
}

export function useDismissFailedTransaction() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => apiClient.dismissFailedTransaction(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['failedTransactions'] });
        },
    });
}
