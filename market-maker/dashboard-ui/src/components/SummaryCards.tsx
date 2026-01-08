import type { StatsResponse, HealthResponse } from '../types';

interface SummaryCardsProps {
    stats: StatsResponse | undefined;
    health: HealthResponse | undefined;
    isLoading: boolean;
}

function formatNumber(value: string | number): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';
    if (num >= 1e18) return (num / 1e18).toFixed(4) + ' ETH';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

export function SummaryCards({ stats, health, isLoading }: SummaryCardsProps) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                        <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                    </div>
                ))}
            </div>
        );
    }

    const cards = [
        {
            title: 'Total Earnings',
            value: stats?.summary.totalEarningsFormatted || '0',
            subtitle: 'wei: ' + formatNumber(stats?.summary.totalEarnings || '0'),
            color: 'text-green-600',
        },
        {
            title: 'Redemptions',
            value: stats?.summary.totalRedemptions || 0,
            subtitle: `Volume: ${formatNumber(stats?.redemptions.volume || '0')}`,
            color: 'text-blue-600',
        },
        {
            title: 'Liquidations',
            value: stats?.summary.totalLiquidations || 0,
            subtitle: `Volume: ${formatNumber(stats?.liquidations.volume || '0')}`,
            color: 'text-purple-600',
        },
        {
            title: 'Bot Status',
            value: health?.status || 'Unknown',
            subtitle: health ? `Uptime: ${formatUptime(health.uptime)}` : '',
            color: health?.status === 'healthy' ? 'text-green-600' : 'text-red-600',
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => (
                <div key={card.title} className="bg-white rounded-lg shadow p-6">
                    <p className="text-sm text-gray-500 mb-1">{card.title}</p>
                    <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{card.subtitle}</p>
                </div>
            ))}
        </div>
    );
}
