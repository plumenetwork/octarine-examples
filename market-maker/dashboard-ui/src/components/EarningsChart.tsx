import {
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Bar,
    ComposedChart,
} from 'recharts';
import type { DailyTrend } from '../types';
import { format, parseISO } from 'date-fns';

interface EarningsChartProps {
    data: DailyTrend[] | undefined;
    isLoading: boolean;
}

export function EarningsChart({ data, isLoading }: EarningsChartProps) {
    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow p-6 h-80 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                <div className="h-full bg-gray-100 rounded"></div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow p-6 h-80 flex items-center justify-center">
                <p className="text-gray-500">No data available</p>
            </div>
        );
    }

    const chartData = data.map((d) => ({
        ...d,
        date: format(parseISO(d.date), 'MMM d'),
        redemptions: d.redemptionCount,
        liquidations: d.liquidationCount,
        earnings: parseFloat(d.totalEarnings) / 1e18, // Convert to ETH
    }));

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Activity Trends</h3>

            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Bar
                            yAxisId="left"
                            dataKey="redemptions"
                            fill="#3B82F6"
                            name="Redemptions"
                        />
                        <Bar
                            yAxisId="left"
                            dataKey="liquidations"
                            fill="#8B5CF6"
                            name="Liquidations"
                        />
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="earnings"
                            stroke="#10B981"
                            name="Earnings (ETH)"
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
