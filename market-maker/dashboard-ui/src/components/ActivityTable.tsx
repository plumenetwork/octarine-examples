import { format, parseISO } from 'date-fns';
import type { Redemption, Liquidation } from '../types';

interface ActivityTableProps {
    redemptions: Redemption[] | undefined;
    liquidations: Liquidation[] | undefined;
    isLoading: boolean;
}

type Activity = {
    type: 'redemption' | 'liquidation';
    id: string;
    amount: string;
    profit: string | null;
    status: string;
    txHash: string | null;
    createdAt: string;
    chainId: number;
};

function formatAmount(wei: string): string {
    const num = parseFloat(wei);
    if (isNaN(num)) return '0';
    if (num >= 1e18) return (num / 1e18).toFixed(4) + ' ETH';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    return num.toFixed(0);
}

function shortenAddress(addr: string | null): string {
    if (!addr) return '-';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

export function ActivityTable({ redemptions, liquidations, isLoading }: ActivityTableProps) {
    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-4 animate-pulse"></div>
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
                    ))}
                </div>
            </div>
        );
    }

    // Combine and sort activities
    const activities: Activity[] = [
        ...(redemptions || []).map((r) => ({
            type: 'redemption' as const,
            id: r.requestId,
            amount: r.makerAmount,
            profit: r.estimatedProfit,
            status: r.status,
            txHash: r.txHash,
            createdAt: r.createdAt,
            chainId: r.chainId,
        })),
        ...(liquidations || []).map((l) => ({
            type: 'liquidation' as const,
            id: l.liquidationId,
            amount: l.makerAmount,
            profit: l.estimatedProfit,
            status: l.status,
            txHash: l.txHash,
            createdAt: l.createdAt,
            chainId: l.chainId,
        })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
     .slice(0, 10);

    if (activities.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                <p className="text-gray-500 text-center py-8">No activity yet</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-gray-500 border-b">
                            <th className="pb-2">Type</th>
                            <th className="pb-2">ID</th>
                            <th className="pb-2">Amount</th>
                            <th className="pb-2">Status</th>
                            <th className="pb-2">Chain</th>
                            <th className="pb-2">Time</th>
                            <th className="pb-2">TX</th>
                        </tr>
                    </thead>
                    <tbody>
                        {activities.map((activity) => (
                            <tr key={`${activity.type}-${activity.id}`} className="border-b last:border-0">
                                <td className="py-3">
                                    <span
                                        className={`px-2 py-1 rounded text-xs font-medium ${
                                            activity.type === 'redemption'
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-purple-100 text-purple-700'
                                        }`}
                                    >
                                        {activity.type}
                                    </span>
                                </td>
                                <td className="py-3 font-mono text-xs">
                                    {shortenAddress(activity.id)}
                                </td>
                                <td className="py-3">{formatAmount(activity.amount)}</td>
                                <td className="py-3">
                                    <span
                                        className={`px-2 py-1 rounded text-xs ${
                                            activity.status === 'transformed' || activity.status === 'triggered'
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-yellow-100 text-yellow-700'
                                        }`}
                                    >
                                        {activity.status}
                                    </span>
                                </td>
                                <td className="py-3">{activity.chainId}</td>
                                <td className="py-3 text-gray-500">
                                    {format(parseISO(activity.createdAt), 'MMM d, HH:mm')}
                                </td>
                                <td className="py-3">
                                    {activity.txHash ? (
                                        <a
                                            href={`https://etherscan.io/tx/${activity.txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline font-mono text-xs"
                                        >
                                            {shortenAddress(activity.txHash)}
                                        </a>
                                    ) : (
                                        '-'
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
