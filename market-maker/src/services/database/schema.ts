/**
 * Database schema definitions
 */

export const SCHEMA = `
-- Redemptions table (bid wins + transforms)
CREATE TABLE IF NOT EXISTS redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT UNIQUE NOT NULL,
    bid_id TEXT,
    maker TEXT NOT NULL,
    maker_amount TEXT NOT NULL,
    redeem_asset TEXT NOT NULL,
    redemption_asset TEXT NOT NULL,
    redeem_amount TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    user_address TEXT,
    spread REAL,
    tx_hash TEXT,
    status TEXT DEFAULT 'won',
    estimated_profit TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    transformed_at DATETIME
);

-- Liquidations table
CREATE TABLE IF NOT EXISTS liquidations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    liquidation_id TEXT UNIQUE NOT NULL,
    borrower TEXT NOT NULL,
    market_id TEXT,
    debt_asset TEXT NOT NULL,
    collateral_asset TEXT NOT NULL,
    debt_to_repay TEXT NOT NULL,
    collateral_to_seize TEXT NOT NULL,
    maker_amount TEXT NOT NULL,
    health_factor REAL,
    chain_id INTEGER NOT NULL,
    tx_hash TEXT,
    status TEXT DEFAULT 'triggered',
    estimated_profit TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bot status table
CREATE TABLE IF NOT EXISTS bot_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for time-based queries
CREATE INDEX IF NOT EXISTS idx_redemptions_created_at ON redemptions(created_at);
CREATE INDEX IF NOT EXISTS idx_redemptions_chain_id ON redemptions(chain_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions(status);
CREATE INDEX IF NOT EXISTS idx_liquidations_created_at ON liquidations(created_at);
CREATE INDEX IF NOT EXISTS idx_liquidations_chain_id ON liquidations(chain_id);
CREATE INDEX IF NOT EXISTS idx_liquidations_status ON liquidations(status);
`;

export interface RedemptionRow {
    id: number;
    request_id: string;
    bid_id: string | null;
    maker: string;
    maker_amount: string;
    redeem_asset: string;
    redemption_asset: string;
    redeem_amount: string;
    chain_id: number;
    user_address: string | null;
    spread: number | null;
    tx_hash: string | null;
    status: string;
    estimated_profit: string | null;
    created_at: string;
    transformed_at: string | null;
}

export interface LiquidationRow {
    id: number;
    liquidation_id: string;
    borrower: string;
    market_id: string | null;
    debt_asset: string;
    collateral_asset: string;
    debt_to_repay: string;
    collateral_to_seize: string;
    maker_amount: string;
    health_factor: number | null;
    chain_id: number;
    tx_hash: string | null;
    status: string;
    estimated_profit: string | null;
    created_at: string;
}

export interface BotStatusRow {
    id: number;
    event_type: string;
    message: string | null;
    created_at: string;
}
