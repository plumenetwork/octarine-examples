/**
 * Database service singleton
 * Uses better-sqlite3 for synchronous, fast SQLite operations
 */

import Database from 'better-sqlite3';
import path from 'path';
import { SCHEMA } from './schema';
import { createLogger } from '../../utils/logger';

const logger = createLogger('database');

let db: Database.Database | null = null;

export interface DatabaseConfig {
    databasePath: string;
}

/**
 * Initialize the database connection and create tables
 */
export function initDatabase(config: DatabaseConfig): Database.Database {
    if (db) {
        return db;
    }

    const dbPath = path.resolve(config.databasePath);
    logger.info('Initializing database', { path: dbPath });

    try {
        db = new Database(dbPath);

        // Enable WAL mode for better concurrent read performance
        db.pragma('journal_mode = WAL');

        // Run schema creation
        db.exec(SCHEMA);

        // Migrations for existing databases
        runMigrations(db);

        logger.info('Database initialized successfully');
        return db;
    } catch (error) {
        logger.error('Failed to initialize database', error instanceof Error ? error : new Error(String(error)));
        throw error;
    }
}

/**
 * Get the database instance
 */
export function getDatabase(): Database.Database {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        logger.info('Database connection closed');
    }
}

/**
 * Get database file size in bytes
 */
export function getDatabaseSize(): number {
    if (!db) return 0;

    try {
        const stats = db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get() as { size: number };
        return stats?.size || 0;
    } catch {
        return 0;
    }
}

/**
 * Run schema migrations for existing databases
 */
function runMigrations(database: Database.Database): void {
    const hasColumn = (table: string, column: string): boolean => {
        const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        return cols.some(c => c.name === column);
    };

    // Add bid_id to liquidations
    if (!hasColumn('liquidations', 'bid_id')) {
        database.exec('ALTER TABLE liquidations ADD COLUMN bid_id TEXT');
        logger.info('Migration: added bid_id column to liquidations');
    }

    // Recreate opportunities table if borrower column has NOT NULL constraint
    // (old schema had NOT NULL on borrower/collateral_asset/debt_asset/chain_id but API data can have nulls)
    const opportunityCols = database.prepare(`PRAGMA table_info(opportunities)`).all() as { name: string; notnull: number }[];
    const borrowerCol = opportunityCols.find(c => c.name === 'borrower');
    if (borrowerCol && borrowerCol.notnull === 1) {
        database.exec('DROP TABLE IF EXISTS opportunities');
        // Recreate with nullable columns from SCHEMA
        database.exec(`
            CREATE TABLE IF NOT EXISTS opportunities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                liquidation_id TEXT UNIQUE NOT NULL,
                market_id TEXT,
                borrower TEXT,
                collateral_asset TEXT,
                debt_asset TEXT,
                collateral_asset_symbol TEXT,
                debt_asset_symbol TEXT,
                collateral_amount TEXT,
                borrowed_amount TEXT,
                collateral_amount_seizeable TEXT,
                health_factor REAL,
                chain_id INTEGER,
                base_feed_price REAL,
                status TEXT,
                synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        logger.info('Migration: recreated opportunities table with nullable columns');
    }
}

// Re-export sub-modules
export * from './redemptions';
export * from './liquidations';
export * from './opportunities';
export * from './stats';
export * from './failed-transactions';
