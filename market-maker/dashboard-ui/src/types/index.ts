export interface HealthResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    database: {
        connected: boolean;
        size: number;
    };
    bot: {
        biddingEnabled: boolean;
        liquidationsEnabled: boolean;
        wsEnabled: boolean;
        supportedChains: number[];
    };
    timestamp: string;
}

export interface CapitalRequired {
    debtAssetSymbol: string;
    totalRequired: number;
    count: number;
}

export interface StatsResponse {
    summary: {
        totalRedemptions: number;
        totalLiquidations: number;
        totalEarnings: string;
        totalEarningsFormatted: string;
    };
    redemptions: {
        count: number;
        volume: string;
        earnings: string;
        avgSpread: number | null;
    };
    liquidations: {
        count: number;
        volume: string;
        earnings: string;
        avgHealthFactor: number | null;
    };
    capitalRequired: CapitalRequired[];
    trends: DailyTrend[];
}

export interface DailyTrend {
    date: string;
    redemptionCount: number;
    liquidationCount: number;
    redemptionEarnings: string;
    liquidationEarnings: string;
    totalEarnings: string;
}

export interface Redemption {
    id: number;
    requestId: string;
    bidId: string | null;
    maker: string;
    makerAmount: string;
    redeemAsset: string;
    redemptionAsset: string;
    redeemAmount: string;
    chainId: number;
    userAddress: string | null;
    spread: number | null;
    txHash: string | null;
    status: string;
    estimatedProfit: string | null;
    createdAt: string;
    transformedAt: string | null;
}

export interface Liquidation {
    id: number;
    liquidationId: string;
    bidId: string | null;
    borrower: string;
    marketId: string | null;
    debtAsset: string;
    collateralAsset: string;
    debtAssetSymbol: string | null;
    collateralAssetSymbol: string | null;
    borrowedAmount: string | null;
    collateralAmount: string | null;
    debtToRepay: string;
    collateralToSeize: string;
    makerAmount: string;
    healthFactor: number | null;
    chainId: number;
    txHash: string | null;
    status: string;
    estimatedProfit: string | null;
    createdAt: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
    };
}

export interface FailedTransaction {
    id: number;
    operation: string;
    errorType: string;
    errorMessage: string;
    requestId: string | null;
    liquidationId: string | null;
    chainId: number | null;
    txHash: string | null;
    context: Record<string, unknown> | null;
    status: string;
    retryCount: number;
    lastRetryAt: string | null;
    createdAt: string;
}

export interface FailedTransactionCounts {
    failed: number;
    retrying: number;
    resolved: number;
    dismissed: number;
}

export interface FailedTransactionsResponse {
    data: FailedTransaction[];
    counts: FailedTransactionCounts;
    pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
    };
}

export type Period = '7d' | '30d' | 'all';
