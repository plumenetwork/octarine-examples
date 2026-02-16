/**
 * API throttle manager
 * Tracks rate limit state and implements escalating backoff:
 *   1st throttle → wait 1 min
 *   2nd throttle → wait 5 min
 *   3rd throttle → wait 10 min
 *   Still throttled → pause until manually resumed from dashboard
 */

import { createLogger } from '../../utils/logger';
import { delay } from '../../utils/delay';

const logger = createLogger('throttle');

const BACKOFF_STEPS_MS = [
    1 * 60_000,   // 1 minute
    5 * 60_000,   // 5 minutes
    10 * 60_000,  // 10 minutes
];

class ThrottleManager {
    private backoffIndex = 0;
    private paused = false;
    private throttledAt: Date | null = null;
    private resumedAt: Date | null = null;

    /**
     * Returns true if the loop should be paused (throttle exhausted backoff)
     */
    isPaused(): boolean {
        return this.paused;
    }

    /**
     * Get current throttle status for dashboard
     */
    getStatus(): {
        paused: boolean;
        backoffStep: number;
        throttledAt: string | null;
        resumedAt: string | null;
        nextBackoffMs: number | null;
    } {
        return {
            paused: this.paused,
            backoffStep: this.backoffIndex,
            throttledAt: this.throttledAt?.toISOString() || null,
            resumedAt: this.resumedAt?.toISOString() || null,
            nextBackoffMs: this.backoffIndex < BACKOFF_STEPS_MS.length
                ? BACKOFF_STEPS_MS[this.backoffIndex]
                : null,
        };
    }

    /**
     * Called when a 429 is received. Waits with escalating backoff.
     * Returns true if we should retry, false if paused (exhausted all backoffs).
     */
    async onThrottled(): Promise<boolean> {
        this.throttledAt = new Date();

        if (this.backoffIndex >= BACKOFF_STEPS_MS.length) {
            // Exhausted all backoff steps — pause until manual resume
            this.paused = true;
            logger.error('API throttle: all backoff steps exhausted, pausing until manually resumed from dashboard');
            return false;
        }

        const waitMs = BACKOFF_STEPS_MS[this.backoffIndex];
        const waitMin = Math.round(waitMs / 60_000);
        logger.warn(`API throttled (429). Waiting ${waitMin} minute(s) before retry (step ${this.backoffIndex + 1}/${BACKOFF_STEPS_MS.length})`, {
            backoffStep: this.backoffIndex + 1,
            waitMs,
        });

        this.backoffIndex++;
        await delay(waitMs);

        return true;
    }

    /**
     * Called after a successful API call — resets backoff counter
     */
    onSuccess(): void {
        if (this.backoffIndex > 0) {
            logger.info('API responding normally, throttle backoff reset');
        }
        this.backoffIndex = 0;
        this.throttledAt = null;
    }

    /**
     * Resume from paused state (called from dashboard)
     */
    resume(): void {
        this.paused = false;
        this.backoffIndex = 0;
        this.throttledAt = null;
        this.resumedAt = new Date();
        logger.info('Throttle manager resumed from dashboard');
    }
}

// Singleton
export const throttleManager = new ThrottleManager();

/**
 * Check if an error is a 429 rate limit
 */
export function isThrottleError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
        const err = error as { response?: { status?: number }; message?: string };
        if (err.response?.status === 429) return true;
        if (err.message?.includes('429')) return true;
    }
    return false;
}
