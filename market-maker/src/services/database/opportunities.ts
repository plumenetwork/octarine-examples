/**
 * Opportunity database operations (synced from API)
 */

import { getDatabase } from './index';
import { OpportunityRow } from './schema';
import { Liquidation } from '../../types';

/**
 * Upsert a batch of opportunities from the API
 * Uses _id as the unique key
 */
export function upsertOpportunities(liquidations: Liquidation[]): { inserted: number; updated: number } {
    const db = getDatabase();
    let inserted = 0;
    let updated = 0;

    const upsertStmt = db.prepare(`
        INSERT INTO opportunities (
            liquidation_id, market_id, borrower, collateral_asset, debt_asset,
            collateral_asset_symbol, debt_asset_symbol, collateral_amount, borrowed_amount,
            collateral_amount_seizeable, health_factor, chain_id, base_feed_price, status, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(liquidation_id) DO UPDATE SET
            health_factor = excluded.health_factor,
            collateral_amount = excluded.collateral_amount,
            borrowed_amount = excluded.borrowed_amount,
            collateral_amount_seizeable = excluded.collateral_amount_seizeable,
            base_feed_price = excluded.base_feed_price,
            status = excluded.status,
            synced_at = datetime('now')
    `);

    const transaction = db.transaction(() => {
        for (const liq of liquidations) {
            const existing = db.prepare('SELECT id FROM opportunities WHERE liquidation_id = ?')
                .get(liq._id) as { id: number } | undefined;

            upsertStmt.run(
                liq._id,
                liq.marketId || null,
                liq.borrowedPosition?.account?.id || liq.borrower || null,
                liq.collateralAsset || null,
                liq.borrowedPosition?.asset?.id || liq.debtAsset || null,
                liq.collateralPosition?.asset?.symbol || null,
                liq.borrowedPosition?.asset?.symbol || null,
                liq.collateralAmount || null,
                liq.borrowedAmount || null,
                liq.collateralAmountThatCanBeSeized || null,
                liq.healthFactor || null,
                liq.chainId ? Number(liq.chainId) : null,
                liq.baseFeedPrice || null,
                liq.status || null,
            );

            if (existing) {
                updated++;
            } else {
                inserted++;
            }
        }
    });

    transaction();

    return { inserted, updated };
}

/**
 * Get total count of opportunities in DB
 */
export function getOpportunityCount(): number {
    const db = getDatabase();
    const row = db.prepare('SELECT COUNT(*) as count FROM opportunities').get() as { count: number };
    return row.count;
}

export interface MarketBreakdown {
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
}

/**
 * Get opportunity breakdown grouped by market (debt/collateral pair)
 */
export function getOpportunityMarketBreakdown(): MarketBreakdown[] {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT
            debt_asset,
            collateral_asset,
            COALESCE(debt_asset_symbol, 'Unknown') as debt_asset_symbol,
            COALESCE(collateral_asset_symbol, 'Unknown') as collateral_asset_symbol,
            COUNT(*) as count,
            COALESCE(SUM(CAST(borrowed_amount AS REAL)), 0) as total_borrowed,
            COALESCE(SUM(CAST(collateral_amount AS REAL)), 0) as total_collateral,
            COALESCE(AVG(health_factor), 0) as avg_health_factor,
            COALESCE(MIN(health_factor), 0) as min_health_factor,
            COALESCE(MIN(CAST(borrowed_amount AS REAL)), 0) as min_borrowed_amount
        FROM opportunities
        WHERE debt_asset IS NOT NULL AND collateral_asset IS NOT NULL
        GROUP BY debt_asset, collateral_asset
        ORDER BY count DESC
    `);

    const rows = stmt.all() as Array<{
        debt_asset: string;
        collateral_asset: string;
        debt_asset_symbol: string;
        collateral_asset_symbol: string;
        count: number;
        total_borrowed: number;
        total_collateral: number;
        avg_health_factor: number;
        min_health_factor: number;
        min_borrowed_amount: number;
    }>;

    return rows.map(row => ({
        debtAsset: row.debt_asset,
        collateralAsset: row.collateral_asset,
        debtAssetSymbol: row.debt_asset_symbol,
        collateralAssetSymbol: row.collateral_asset_symbol,
        count: row.count,
        totalBorrowed: String(row.total_borrowed),
        totalCollateral: String(row.total_collateral),
        avgHealthFactor: row.avg_health_factor,
        minHealthFactor: row.min_health_factor,
        minBorrowedAmount: String(row.min_borrowed_amount),
    }));
}

export interface GetOpportunitiesOptions {
    chainId?: number;
    limit?: number;
    offset?: number;
}

/**
 * Get opportunities with filtering and pagination
 */
export function getOpportunities(options: GetOpportunitiesOptions = {}): { data: OpportunityRow[]; total: number } {
    const db = getDatabase();
    const { chainId, limit = 50, offset = 0 } = options;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (chainId !== undefined) {
        conditions.push('chain_id = ?');
        params.push(chainId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM opportunities ${whereClause}`);
    const { count } = countStmt.get(...params) as { count: number };

    const dataStmt = db.prepare(`
        SELECT * FROM opportunities
        ${whereClause}
        ORDER BY health_factor ASC
        LIMIT ? OFFSET ?
    `);

    const data = dataStmt.all(...params, limit, offset) as OpportunityRow[];

    return { data, total: count };
}
