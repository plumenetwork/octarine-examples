import type {
    HealthResponse,
    StatsResponse,
    Redemption,
    Liquidation,
    PaginatedResponse,
    Period,
} from '../types';

const API_BASE = '/api';

class ApiClient {
    private credentials: string = '';

    setCredentials(username: string, password: string) {
        this.credentials = btoa(`${username}:${password}`);
        localStorage.setItem('dashboard_credentials', this.credentials);
    }

    loadCredentials(): boolean {
        const saved = localStorage.getItem('dashboard_credentials');
        if (saved) {
            this.credentials = saved;
            return true;
        }
        return false;
    }

    clearCredentials() {
        this.credentials = '';
        localStorage.removeItem('dashboard_credentials');
    }

    hasCredentials(): boolean {
        return this.credentials.length > 0;
    }

    private async fetch<T>(endpoint: string): Promise<T> {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                Authorization: `Basic ${this.credentials}`,
                'Content-Type': 'application/json',
            },
        });

        if (response.status === 401) {
            this.clearCredentials();
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        return response.json();
    }

    async getHealth(): Promise<HealthResponse> {
        return this.fetch('/health');
    }

    async getStats(period: Period = '7d', chainId?: number): Promise<StatsResponse> {
        const params = new URLSearchParams({ period });
        if (chainId) params.set('chainId', String(chainId));
        return this.fetch(`/stats?${params}`);
    }

    async getRedemptions(
        period: Period = '7d',
        limit = 50,
        offset = 0,
    ): Promise<PaginatedResponse<Redemption>> {
        const params = new URLSearchParams({
            period,
            limit: String(limit),
            offset: String(offset),
        });
        return this.fetch(`/redemptions?${params}`);
    }

    async getLiquidations(
        period: Period = '7d',
        limit = 50,
        offset = 0,
    ): Promise<PaginatedResponse<Liquidation>> {
        const params = new URLSearchParams({
            period,
            limit: String(limit),
            offset: String(offset),
        });
        return this.fetch(`/liquidations?${params}`);
    }
}

export const apiClient = new ApiClient();
