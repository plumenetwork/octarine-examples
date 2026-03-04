/**
 * Liquidation database operations
 */

import { getDatabase } from './index';
import { LiquidationRow } from './schema';

export interface InsertLiquidationData {
    liquidationId: string;
    bidId?: string;
    borrower: string;
    marketId?: string;
    debtAsset: string;
    collateralAsset: string;
    debtAssetSymbol?: string;
    collateralAssetSymbol?: string;
    borrowedAmount?: string;
    collateralAmount?: string;
    debtToRepay: string;
    collateralToSeize: string;
    makerAmount: string;
    healthFactor?: number;
    chainId: number;
    txHash?: string;
    estimatedProfit?: string;
}

export interface UpdateLiquidationData {
    status?: string;
    txHash?: string;
    bidId?: string;
    estimatedProfit?: string;
}

/**
 * Insert a new liquidation record (upsert: update if already exists)
 */
export function insertLiquidation(data: InsertLiquidationData): number {
    const db = getDatabase();

    // Check if already exists to avoid UNIQUE constraint violation
    const existing = getLiquidationById(data.liquidationId);
    if (existing) {
        // Update with latest data
        const updateStmt = db.prepare(`
            UPDATE liquidations SET
                bid_id = COALESCE(?, bid_id),
                tx_hash = COALESCE(?, tx_hash),
                estimated_profit = COALESCE(?, estimated_profit),
                status = COALESCE(?, status)
            WHERE liquidation_id = ?
        `);
        updateStmt.run(
            data.bidId || null,
            data.txHash || null,
            data.estimatedProfit || null,
            'pending',
            data.liquidationId,
        );
        return existing.id;
    }

    const stmt = db.prepare(`
        INSERT INTO liquidations (
            liquidation_id, bid_id, borrower, market_id, debt_asset, collateral_asset,
            debt_asset_symbol, collateral_asset_symbol, borrowed_amount, collateral_amount,
            debt_to_repay, collateral_to_seize, maker_amount, health_factor,
            chain_id, tx_hash, status, estimated_profit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        data.liquidationId,
        data.bidId || null,
        data.borrower,
        data.marketId || null,
        data.debtAsset,
        data.collateralAsset,
        data.debtAssetSymbol || null,
        data.collateralAssetSymbol || null,
        data.borrowedAmount || null,
        data.collateralAmount || null,
        data.debtToRepay,
        data.collateralToSeize,
        data.makerAmount,
        data.healthFactor || null,
        data.chainId,
        data.txHash || null,
        'pending',
        data.estimatedProfit || null,
    );

    return result.lastInsertRowid as number;
}

/**
 * Update a liquidation record by liquidation ID
 */
export function updateLiquidation(liquidationId: string, data: UpdateLiquidationData): boolean {
    const db = getDatabase();

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.status !== undefined) {
        updates.push('status = ?');
        values.push(data.status);
    }
    if (data.txHash !== undefined) {
        updates.push('tx_hash = ?');
        values.push(data.txHash);
    }
    if (data.bidId !== undefined) {
        updates.push('bid_id = ?');
        values.push(data.bidId);
    }
    if (data.estimatedProfit !== undefined) {
        updates.push('estimated_profit = ?');
        values.push(data.estimatedProfit);
    }

    if (updates.length === 0) return false;

    values.push(liquidationId);

    const stmt = db.prepare(`
        UPDATE liquidations SET ${updates.join(', ')} WHERE liquidation_id = ?
    `);

    const result = stmt.run(...values);
    return result.changes > 0;
}

/**
 * Get a liquidation by liquidation ID
 */
export function getLiquidationById(liquidationId: string): LiquidationRow | undefined {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM liquidations WHERE liquidation_id = ?');
    return stmt.get(liquidationId) as LiquidationRow | undefined;
}

/**
 * Get liquidations that are still pending (no txHash yet)
 * Used by the status poller to check for execution results
 */
export function getPendingLiquidations(limit = 50): LiquidationRow[] {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT * FROM liquidations
        WHERE status = 'pending' AND (tx_hash IS NULL OR tx_hash = '')
        ORDER BY created_at DESC
        LIMIT ?
    `);
    return stmt.all(limit) as LiquidationRow[];
}

export interface GetLiquidationsOptions {
    period?: '7d' | '30d' | 'all';
    chainId?: number;
    status?: string;
    limit?: number;
    offset?: number;
}

/**
 * Get liquidations with filtering and pagination
 */
export function getLiquidations(options: GetLiquidationsOptions = {}): { data: LiquidationRow[]; total: number } {
    const db = getDatabase();
    const { period = '7d', chainId, status, limit = 2000, offset = 0 } = options;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // Period filter
    if (period !== 'all') {
        const days = period === '7d' ? 7 : 30;
        conditions.push(`l.created_at >= datetime('now', '-${days} days')`);
    }

    // Chain filter
    if (chainId !== undefined) {
        conditions.push('l.chain_id = ?');
        params.push(chainId);
    }

    // Status filter
    if (status) {
        conditions.push('l.status = ?');
        params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM liquidations l ${whereClause}`);
    const { count } = countStmt.get(...params) as { count: number };

    // Get paginated data, LEFT JOIN with opportunities to fill in missing borrower
    const dataStmt = db.prepare(`
        SELECT l.*, COALESCE(NULLIF(l.borrower, ''), o.borrower) AS borrower
        FROM liquidations l
        LEFT JOIN opportunities o ON l.liquidation_id = o.liquidation_id
        ${whereClause}
        ORDER BY l.created_at DESC
        LIMIT ? OFFSET ?
    `);

    const data = dataStmt.all(...params, limit, offset) as LiquidationRow[];

    return { data, total: count };
}
