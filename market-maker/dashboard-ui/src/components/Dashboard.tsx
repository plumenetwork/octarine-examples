import { useState } from 'react';
import { SummaryCards } from './SummaryCards';
import { EarningsChart } from './EarningsChart';
import { ActivityTable } from './ActivityTable';
import { TimePeriodSelector } from './TimePeriodSelector';
import { useStats } from '../hooks/useStats';
import { useHealth } from '../hooks/useHealth';
import { useRedemptions } from '../hooks/useRedemptions';
import { useLiquidations } from '../hooks/useLiquidations';
import { apiClient } from '../api/client';
import type { Period } from '../types';

interface DashboardProps {
    onLogout: () => void;
}

export function Dashboard({ onLogout }: DashboardProps) {
    const [period, setPeriod] = useState<Period>('7d');

    const { data: stats, isLoading: statsLoading } = useStats(period);
    const { data: health, isLoading: healthLoading } = useHealth();
    const { data: redemptionsData, isLoading: redemptionsLoading } = useRedemptions(period);
    const { data: liquidationsData, isLoading: liquidationsLoading } = useLiquidations(period);

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

                {/* Activity table */}
                <ActivityTable
                    redemptions={redemptionsData?.data}
                    liquidations={liquidationsData?.data}
                    isLoading={redemptionsLoading || liquidationsLoading}
                />

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
