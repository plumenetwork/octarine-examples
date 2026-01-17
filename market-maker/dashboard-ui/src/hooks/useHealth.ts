import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export function useHealth() {
    return useQuery({
        queryKey: ['health'],
        queryFn: () => apiClient.getHealth(),
        refetchInterval: 10000, // Refresh every 10 seconds
    });
}
