import { useState, useEffect, useCallback } from 'react';
import { SummaryCards } from './SummaryCards';
import { EarningsChart } from './EarningsChart';
import { ActivityTable } from './ActivityTable';
import { FailedTransactionsTable } from './FailedTransactionsTable';
import { LogViewer } from './LogViewer';
import { OpportunitySync } from './OpportunitySync';
import { TimePeriodSelector } from './TimePeriodSelector';
import { useStats } from '../hooks/useStats';
import { useHealth } from '../hooks/useHealth';
import { useRedemptions } from '../hooks/useRedemptions';
import { useLiquidations } from '../hooks/useLiquidations';
import { useFailedTransactions } from '../hooks/useFailedTransactions';
import { apiClient, ThrottleStatus } from '../api/client';
import type { Period } from '../types';

interface DashboardProps {
    onLogout: () => void;
}

export function Dashboard({ onLogout }: DashboardProps) {
    const [period, setPeriod] = useState<Period>('7d');
    const [throttle, setThrottle] = useState<ThrottleStatus | null>(null);
    const [resuming, setResuming] = useState(false);

    const fetchThrottle = useCallback(async () => {
        try {
            const s = await apiClient.getThrottleStatus();
            setThrottle(s);
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        fetchThrottle();
        const interval = setInterval(fetchThrottle, 10_000);
        return () => clearInterval(interval);
    }, [fetchThrottle]);

    const handleResume = async () => {
        setResuming(true);
        try {
            await apiClient.resumeThrottle();
            await fetchThrottle();
        } catch {
            // ignore
        }
        setResuming(false);
    };

    const { data: stats, isLoading: statsLoading } = useStats(period);
    const { data: health, isLoading: healthLoading } = useHealth();
    const { data: redemptionsData, isLoading: redemptionsLoading } = useRedemptions(period);
    const { data: liquidationsData, isLoading: liquidationsLoading } = useLiquidations(period);
    const { data: failedTxData, isLoading: failedTxLoading } = useFailedTransactions(period);

    const handleLogout = () => {
        apiClient.clearCredentials();
        onLogout();
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-gray-900">
                        Market Maker Dashboard
                    </h1>
                    <div className="flex items-center gap-4">
                        <TimePeriodSelector value={period} onChange={setPeriod} />
                        <button
                            onClick={handleLogout}
                            className="text-gray-500 hover:text-gray-700 text-sm"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Throttle banner */}
            {throttle?.paused && (
                <div className="bg-red-600 text-white">
                    <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-lg">&#9888;</span>
                            <div>
                                <p className="font-semibold">Liquidation loop paused — API rate limited (429)</p>
                                <p className="text-sm text-red-200">
                                    All backoff steps exhausted. The bot will not process liquidations until resumed.
                                    {throttle.throttledAt && ` Throttled at ${new Date(throttle.throttledAt).toLocaleTimeString()}.`}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleResume}
                            disabled={resuming}
                            className="px-4 py-2 bg-white text-red-600 font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                            {resuming ? 'Resuming...' : 'Resume'}
                        </button>
                    </div>
                </div>
            )}

            {/* Throttle warning (backing off but not yet paused) */}
            {throttle && !throttle.paused && throttle.backoffStep > 0 && (
                <div className="bg-yellow-500 text-white">
                    <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
                        <span>&#9888;</span>
                        <p className="text-sm">
                            API throttled — backing off (step {throttle.backoffStep}/3).
                            {throttle.nextBackoffMs && ` Next wait: ${Math.round(throttle.nextBackoffMs / 60000)} min.`}
                        </p>
                    </div>
                </div>
            )}

            {/* Main content */}
            <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
                {/* Summary cards */}
                <SummaryCards
                    stats={stats}
                    health={health}
                    isLoading={statsLoading || healthLoading}
                />

                {/* Charts */}
                <EarningsChart
                    data={stats?.trends}
                    isLoading={statsLoading}
                />

                {/* Bot logs */}
                <LogViewer />

                {/* Failed transactions */}
                <FailedTransactionsTable
                    transactions={failedTxData?.data}
                    counts={failedTxData?.counts}
                    isLoading={failedTxLoading}
                />

                {/* Activity table */}
                <ActivityTable
                    redemptions={redemptionsData?.data}
                    liquidations={liquidationsData?.data}
                    isLoading={redemptionsLoading || liquidationsLoading}
                />

                {/* Opportunity sync */}
                <OpportunitySync />

                {/* Bot info */}
                {health && (
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold mb-4">Bot Configuration</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <p className="text-gray-500">Bidding</p>
                                <p className={health.bot.biddingEnabled ? 'text-green-600' : 'text-red-600'}>
                                    {health.bot.biddingEnabled ? 'Enabled' : 'Disabled'}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-500">Liquidations</p>
                                <p className={health.bot.liquidationsEnabled ? 'text-green-600' : 'text-red-600'}>
                                    {health.bot.liquidationsEnabled ? 'Enabled' : 'Disabled'}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-500">WebSocket</p>
                                <p className={health.bot.wsEnabled ? 'text-green-600' : 'text-gray-600'}>
                                    {health.bot.wsEnabled ? 'Connected' : 'Disabled'}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-500">Supported Chains</p>
                                <p>{health.bot.supportedChains.join(', ')}</p>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
