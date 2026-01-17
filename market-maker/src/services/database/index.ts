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

// Re-export sub-modules
export * from './redemptions';
export * from './liquidations';
export * from './stats';
