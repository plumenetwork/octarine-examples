/**
 * API throttle manager
 * Tracks rate limit state and implements escalating backoff:
 *   1st throttle → wait 1 min
 *   2nd throttle → wait 5 min
 *   3rd throttle → wait 10 min
 *   Still throttled → pause until manually resumed from dashboard
 *
 * The throttle manager is SYNCHRONOUS — it just sets timers.
 * Both loops check shouldWait() and delay themselves.
 * The API client interceptor calls onThrottled() on any 429.
 */

import { createLogger } from '../../utils/logger';

const logger = createLogger('throttle');

const BACKOFF_STEPS_MS = [
    1 * 60_000,   // 1 minute
    5 * 60_000,   // 5 minutes
    10 * 60_000,  // 10 minutes
];

class ThrottleManager {
    private backoffIndex = 0;
    private _paused = false;
    private throttledAt: Date | null = null;
    private resumedAt: Date | null = null;
    private waitUntil = 0; // timestamp when backoff expires

    /**
     * Returns true if all backoff steps are exhausted and manual resume is needed
     */
    isPaused(): boolean {
        return this._paused;
    }

    /**
     * Returns true if the caller should wait (either backing off or paused)
     */
    shouldWait(): boolean {
        if (this._paused) return true;
        return Date.now() < this.waitUntil;
    }

    /**
     * Get ms remaining in current backoff (0 if not backing off)
     */
    getWaitRemaining(): number {
        if (this._paused) return Infinity;
        return Math.max(0, this.waitUntil - Date.now());
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
            paused: this._paused,
            backoffStep: this.backoffIndex,
            throttledAt: this.throttledAt?.toISOString() || null,
            resumedAt: this.resumedAt?.toISOString() || null,
            nextBackoffMs: this.backoffIndex < BACKOFF_STEPS_MS.length
                ? BACKOFF_STEPS_MS[this.backoffIndex]
                : null,
        };
    }

    /**
     * Called when a 429 is received (from API interceptor or loop catch).
     * Synchronous — sets the backoff timer but does NOT block.
     * If already in a backoff period, does nothing (prevents multi-429 escalation).
     */
    onThrottled(): void {
        // Already backing off or paused — don't re-escalate
        if (this._paused || Date.now() < this.waitUntil) {
            return;
        }

        this.throttledAt = new Date();

        if (this.backoffIndex >= BACKOFF_STEPS_MS.length) {
            // Exhausted all backoff steps — pause until manual resume
            this._paused = true;
            logger.error('API throttle: all backoff steps exhausted. Pausing ALL loops until manually resumed from dashboard.');
            return;
        }

        const waitMs = BACKOFF_STEPS_MS[this.backoffIndex];
        const waitMin = Math.round(waitMs / 60_000);
        logger.warn(`API throttled (429). All loops backing off for ${waitMin} minute(s) (step ${this.backoffIndex + 1}/${BACKOFF_STEPS_MS.length})`);

        this.waitUntil = Date.now() + waitMs;
        this.backoffIndex++;
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
        this.waitUntil = 0;
    }

    /**
     * Resume from paused state (called from dashboard)
     */
    resume(): void {
        this._paused = false;
        this.backoffIndex = 0;
        this.throttledAt = null;
        this.waitUntil = 0;
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
