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
