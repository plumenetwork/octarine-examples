/**
 * Structured logging utility with configurable levels
 */

import { EventEmitter } from 'events';
import { LogLevel } from '../types';

export interface LogContext {
    module?: string;
    requestId?: string;
    liquidationId?: string;
    txHash?: string;
    chainId?: number;
    amount?: string;
    token?: string;
    error?: string;
    [key: string]: unknown;
}

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: LogContext;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const LOG_LEVEL_EMOJI: Record<LogLevel, string> = {
    debug: '🔍',
    info: '📋',
    warn: '⚠️',
    error: '❌',
};

export class Logger {
    private level: LogLevel;
    private module: string;

    constructor(module: string, level: LogLevel = 'info') {
        this.module = module;
        this.level = level;
    }

    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
    }

    private formatOutput(entry: LogEntry): string {
        const emoji = LOG_LEVEL_EMOJI[entry.level];
        const contextStr = entry.context
            ? ` | ${JSON.stringify(entry.context)}`
            : '';
        const errorStr = entry.error
            ? ` | Error: ${entry.error.message}`
            : '';

        return `${emoji} [${entry.timestamp}] [${entry.level.toUpperCase()}] [${this.module}] ${entry.message}${contextStr}${errorStr}`;
    }

    private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
        if (!this.shouldLog(level)) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            context: context ? { ...context, module: this.module } : { module: this.module },
        };

        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
        }

        const output = this.formatOutput(entry);

        // Broadcast to SSE clients
        logBroadcaster.push({
            timestamp: entry.timestamp,
            level: entry.level,
            module: this.module,
            message: entry.message,
            context: entry.context,
            error: entry.error ? { name: entry.error.name, message: entry.error.message } : undefined,
        });

        if (level === 'error') {
            console.error(output);
            if (error?.stack && this.level === 'debug') {
                console.error(error.stack);
            }
        } else if (level === 'warn') {
            console.warn(output);
        } else {
            console.log(output);
        }
    }

    debug(message: string, context?: LogContext): void {
        this.log('debug', message, context);
    }

    info(message: string, context?: LogContext): void {
        this.log('info', message, context);
    }

    warn(message: string, context?: LogContext): void {
        this.log('warn', message, context);
    }

    error(message: string, error?: Error, context?: LogContext): void {
        this.log('error', message, context, error);
    }

    child(subModule: string): Logger {
        return new Logger(`${this.module}:${subModule}`, this.level);
    }

    setLevel(level: LogLevel): void {
        this.level = level;
    }
}

/**
 * LogBroadcaster — singleton EventEmitter that streams log entries to SSE clients.
 * Keeps a circular buffer of the last N entries so new clients get recent history.
 */
const LOG_BUFFER_SIZE = 200;

export interface BroadcastLogEntry {
    timestamp: string;
    level: LogLevel;
    module: string;
    message: string;
    context?: LogContext;
    error?: { name: string; message: string };
}

class LogBroadcaster extends EventEmitter {
    private buffer: BroadcastLogEntry[] = [];

    push(entry: BroadcastLogEntry) {
        this.buffer.push(entry);
        if (this.buffer.length > LOG_BUFFER_SIZE) {
            this.buffer.shift();
        }
        this.emit('log', entry);
    }

    getBuffer(): BroadcastLogEntry[] {
        return [...this.buffer];
    }
}

export const logBroadcaster = new LogBroadcaster();

// Factory function to create loggers
let globalLogLevel: LogLevel = 'info';

export function setGlobalLogLevel(level: LogLevel): void {
    globalLogLevel = level;
}

export function createLogger(module: string): Logger {
    return new Logger(module, globalLogLevel);
}

// Pre-configured loggers for common modules
export const loggers = {
    main: createLogger('main'),
    bidding: createLogger('bidding'),
    liquidation: createLogger('liquidation'),
    api: createLogger('api'),
    wallet: createLogger('wallet'),
    notifications: createLogger('notifications'),
    health: createLogger('health'),
};
