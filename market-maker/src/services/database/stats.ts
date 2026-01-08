/**
 * Statistics and aggregation queries
 */

import { getDatabase } from './index';

export interface PeriodStats {
    totalRedemptions: number;
    totalLiquidations: number;
    redemptionVolume: string;
    liquidationVolume: string;
    redemptionEarnings: string;
    liquidationEarnings: string;
    totalEarnings: string;
    avgRedemptionSpread: number | null;
    avgLiquidationHealthFactor: number | null;
}

export interface DailyTrend {
    date: string;
    redemptionCount: number;
    liquidationCount: number;
    redemptionEarnings: string;
    liquidationEarnings: string;
    totalEarnings: string;
}

export interface StatsOptions {
    period?: '7d' | '30d' | 'all';
    chainId?: number;
}

/**
 * Get period statistics
 */
export function getPeriodStats(options: StatsOptions = {}): PeriodStats {
    const db = getDatabase();
    const { period = '7d', chainId } = options;

    let dateCondition = '';
    if (period !== 'all') {
        const days = period === '7d' ? 7 : 30;
        dateCondition = `AND created_at >= datetime('now', '-${days} days')`;
    }

    let chainCondition = '';
    const params: number[] = [];
    if (chainId !== undefined) {
        chainCondition = 'AND chain_id = ?';
        params.push(chainId);
    }

    // Redemption stats
    const redemptionStmt = db.prepare(`
        SELECT
            COUNT(*) as count,
            COALESCE(SUM(CAST(redeem_amount AS REAL)), 0) as volume,
            COALESCE(SUM(CAST(estimated_profit AS REAL)), 0) as earnings,
            AVG(spread) as avg_spread
        FROM redemptions
        WHERE 1=1 ${dateCondition} ${chainCondition}
    `);
    const redemptionStats = redemptionStmt.get(...params) as {
        count: number;
        volume: number;
        earnings: number;
        avg_spread: number | null;
    };

    // Liquidation stats
    const liquidationStmt = db.prepare(`
        SELECT
            COUNT(*) as count,
            COALESCE(SUM(CAST(debt_to_repay AS REAL)), 0) as volume,
            COALESCE(SUM(CAST(estimated_profit AS REAL)), 0) as earnings,
            AVG(health_factor) as avg_health_factor
        FROM liquidations
        WHERE 1=1 ${dateCondition} ${chainCondition}
    `);
    const liquidationStats = liquidationStmt.get(...params) as {
        count: number;
        volume: number;
        earnings: number;
        avg_health_factor: number | null;
    };

    const totalEarnings = (redemptionStats.earnings || 0) + (liquidationStats.earnings || 0);

    return {
        totalRedemptions: redemptionStats.count,
        totalLiquidations: liquidationStats.count,
        redemptionVolume: String(redemptionStats.volume || 0),
        liquidationVolume: String(liquidationStats.volume || 0),
        redemptionEarnings: String(redemptionStats.earnings || 0),
        liquidationEarnings: String(liquidationStats.earnings || 0),
        totalEarnings: String(totalEarnings),
        avgRedemptionSpread: redemptionStats.avg_spread,
        avgLiquidationHealthFactor: liquidationStats.avg_health_factor,
    };
}

/**
 * Get daily trends for charts
 */
export function getDailyTrends(options: StatsOptions = {}): DailyTrend[] {
    const db = getDatabase();
    const { period = '7d', chainId } = options;

    const days = period === 'all' ? 365 : period === '7d' ? 7 : 30;

    let chainCondition = '';
    const params: number[] = [];
    if (chainId !== undefined) {
        chainCondition = 'AND chain_id = ?';
        params.push(chainId);
    }

    // Get redemption trends
    const redemptionTrendsStmt = db.prepare(`
        SELECT
            DATE(created_at) as date,
            COUNT(*) as count,
            COALESCE(SUM(CAST(estimated_profit AS REAL)), 0) as earnings
        FROM redemptions
        WHERE created_at >= datetime('now', '-${days} days') ${chainCondition}
        GROUP BY DATE(created_at)
    `);
    const redemptionTrends = redemptionTrendsStmt.all(...params) as Array<{
        date: string;
        count: number;
        earnings: number;
    }>;

    // Get liquidation trends
    const liquidationTrendsStmt = db.prepare(`
        SELECT
            DATE(created_at) as date,
            COUNT(*) as count,
            COALESCE(SUM(CAST(estimated_profit AS REAL)), 0) as earnings
        FROM liquidations
        WHERE created_at >= datetime('now', '-${days} days') ${chainCondition}
        GROUP BY DATE(created_at)
    `);
    const liquidationTrends = liquidationTrendsStmt.all(...params) as Array<{
        date: string;
        count: number;
        earnings: number;
    }>;

    // Merge trends by date
    const trendMap = new Map<string, DailyTrend>();

    // Initialize with all dates in range
    for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        trendMap.set(dateStr, {
            date: dateStr,
            redemptionCount: 0,
            liquidationCount: 0,
            redemptionEarnings: '0',
            liquidationEarnings: '0',
            totalEarnings: '0',
        });
    }

    // Fill in redemption data
    for (const r of redemptionTrends) {
        const existing = trendMap.get(r.date);
        if (existing) {
            existing.redemptionCount = r.count;
            existing.redemptionEarnings = String(r.earnings);
        }
    }

    // Fill in liquidation data
    for (const l of liquidationTrends) {
        const existing = trendMap.get(l.date);
        if (existing) {
            existing.liquidationCount = l.count;
            existing.liquidationEarnings = String(l.earnings);
        }
    }

    // Calculate total earnings and sort
    const trends = Array.from(trendMap.values());
    for (const t of trends) {
        t.totalEarnings = String(
            parseFloat(t.redemptionEarnings) + parseFloat(t.liquidationEarnings)
        );
    }

    return trends.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Record bot status event
 */
export function recordBotStatus(eventType: string, message?: string): void {
    const db = getDatabase();
    const stmt = db.prepare('INSERT INTO bot_status (event_type, message) VALUES (?, ?)');
    stmt.run(eventType, message || null);
}

/**
 * Get bot uptime (time since last 'started' event)
 */
export function getBotUptime(): number {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT created_at FROM bot_status
        WHERE event_type = 'started'
        ORDER BY created_at DESC
        LIMIT 1
    `);
    const result = stmt.get() as { created_at: string } | undefined;

    if (!result) return 0;

    const startTime = new Date(result.created_at).getTime();
    return Math.floor((Date.now() - startTime) / 1000);
}
