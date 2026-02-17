import type {
    HealthResponse,
    StatsResponse,
    Redemption,
    Liquidation,
    PaginatedResponse,
    FailedTransactionsResponse,
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

    getCredentials(): string {
        return this.credentials;
    }

    private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Basic ${this.credentials}`,
                'Content-Type': 'application/json',
                ...options?.headers,
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
        limit = 500,
        offset = 0,
    ): Promise<PaginatedResponse<Liquidation>> {
        const params = new URLSearchParams({
            period,
            limit: String(limit),
            offset: String(offset),
        });
        return this.fetch(`/liquidations?${params}`);
    }

    async getFailedTransactions(
        period: Period = '7d',
        limit = 50,
        offset = 0,
        status?: string,
    ): Promise<FailedTransactionsResponse> {
        const params = new URLSearchParams({
            period,
            limit: String(limit),
            offset: String(offset),
        });
        if (status) params.set('status', status);
        return this.fetch(`/failed-transactions?${params}`);
    }

    async retryFailedTransaction(id: number): Promise<{ success: boolean; message: string; txHash?: string }> {
        return this.fetch(`/failed-transactions/${id}/retry`, { method: 'POST' });
    }

    async dismissFailedTransaction(id: number): Promise<{ success: boolean; message: string }> {
        return this.fetch(`/failed-transactions/${id}/dismiss`, { method: 'POST' });
    }

    async getOpportunitySyncStatus(): Promise<SyncStatus> {
        return this.fetch('/opportunities/status');
    }

    async triggerOpportunitySync(): Promise<{ message: string }> {
        return this.fetch('/opportunities/sync', { method: 'POST' });
    }

    async getOpportunityMarkets(): Promise<{ markets: MarketBreakdownItem[] }> {
        return this.fetch('/opportunities/markets');
    }

    async getThrottleStatus(): Promise<ThrottleStatus> {
        return this.fetch('/health/throttle');
    }

    async resumeThrottle(): Promise<{ success: boolean; message: string }> {
        return this.fetch('/health/throttle/resume', { method: 'POST' });
    }
}

export interface ThrottleStatus {
    paused: boolean;
    backoffStep: number;
    throttledAt: string | null;
    resumedAt: string | null;
    nextBackoffMs: number | null;
}

export interface MarketBreakdownItem {
    debtAsset: string;
    collateralAsset: string;
    debtAssetSymbol: string;
    collateralAssetSymbol: string;
    count: number;
    totalBorrowed: string;
    totalCollateral: string;
    avgHealthFactor: number;
    minHealthFactor: number;
    minBorrowedAmount: string;
    walletBalance: string | null;
    sufficientBalance: boolean;
}

export interface SyncStatus {
    dbCount: number;
    apiTotal: number | null;
    syncRequired: boolean;
    syncInProgress: boolean;
    lastSync: {
        syncedAt: string;
        inserted: number;
        updated: number;
        totalApi: number;
    } | null;
}

export const apiClient = new ApiClient();
