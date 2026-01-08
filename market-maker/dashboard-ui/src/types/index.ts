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
    borrower: string;
    marketId: string | null;
    debtAsset: string;
    collateralAsset: string;
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

export type Period = '7d' | '30d' | 'all';
