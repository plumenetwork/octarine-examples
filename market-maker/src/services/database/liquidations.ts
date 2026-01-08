/**
 * Liquidation database operations
 */

import { getDatabase } from './index';
import { LiquidationRow } from './schema';

export interface InsertLiquidationData {
    liquidationId: string;
    borrower: string;
    marketId?: string;
    debtAsset: string;
    collateralAsset: string;
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
    estimatedProfit?: string;
}

/**
 * Insert a new liquidation record
 */
export function insertLiquidation(data: InsertLiquidationData): number {
    const db = getDatabase();

    const stmt = db.prepare(`
        INSERT INTO liquidations (
            liquidation_id, borrower, market_id, debt_asset, collateral_asset,
            debt_to_repay, collateral_to_seize, maker_amount, health_factor,
            chain_id, tx_hash, estimated_profit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        data.liquidationId,
        data.borrower,
        data.marketId || null,
        data.debtAsset,
        data.collateralAsset,
        data.debtToRepay,
        data.collateralToSeize,
        data.makerAmount,
        data.healthFactor || null,
        data.chainId,
        data.txHash || null,
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
    const { period = '7d', chainId, status, limit = 50, offset = 0 } = options;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // Period filter
    if (period !== 'all') {
        const days = period === '7d' ? 7 : 30;
        conditions.push(`created_at >= datetime('now', '-${days} days')`);
    }

    // Chain filter
    if (chainId !== undefined) {
        conditions.push('chain_id = ?');
        params.push(chainId);
    }

    // Status filter
    if (status) {
        conditions.push('status = ?');
        params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM liquidations ${whereClause}`);
    const { count } = countStmt.get(...params) as { count: number };

    // Get paginated data
    const dataStmt = db.prepare(`
        SELECT * FROM liquidations
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `);

    const data = dataStmt.all(...params, limit, offset) as LiquidationRow[];

    return { data, total: count };
}
