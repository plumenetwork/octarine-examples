/**
 * Statistics endpoint for dashboard
 */

import { Router } from 'express';
import { getPeriodStats, getDailyTrends, StatsOptions } from '../../services/database';
import { ethers } from 'ethers';

const router = Router();

interface StatsResponse {
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
    trends: Array<{
        date: string;
        redemptionCount: number;
        liquidationCount: number;
        redemptionEarnings: string;
        liquidationEarnings: string;
        totalEarnings: string;
    }>;
}

router.get('/', (req, res) => {
    try {
        const period = (req.query.period as StatsOptions['period']) || '7d';
        const chainId = req.query.chainId ? parseInt(req.query.chainId as string, 10) : undefined;

        const options: StatsOptions = { period, chainId };

        const stats = getPeriodStats(options);
        const trends = getDailyTrends(options);

        // Format earnings to ETH
        const totalEarningsWei = stats.totalEarnings;
        let totalEarningsFormatted = '0';
        try {
            totalEarningsFormatted = ethers.utils.formatEther(totalEarningsWei);
        } catch {
            // If not a valid wei amount, just show raw
            totalEarningsFormatted = totalEarningsWei;
        }

        const response: StatsResponse = {
            summary: {
                totalRedemptions: stats.totalRedemptions,
                totalLiquidations: stats.totalLiquidations,
                totalEarnings: stats.totalEarnings,
                totalEarningsFormatted,
            },
            redemptions: {
                count: stats.totalRedemptions,
                volume: stats.redemptionVolume,
                earnings: stats.redemptionEarnings,
                avgSpread: stats.avgRedemptionSpread,
            },
            liquidations: {
                count: stats.totalLiquidations,
                volume: stats.liquidationVolume,
                earnings: stats.liquidationEarnings,
                avgHealthFactor: stats.avgLiquidationHealthFactor,
            },
            trends,
        };

        res.json(response);
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch stats',
        });
    }
});

export { router as statsRoutes };
