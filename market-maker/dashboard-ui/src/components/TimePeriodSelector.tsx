import type { Period } from '../types';

interface TimePeriodSelectorProps {
    value: Period;
    onChange: (period: Period) => void;
}

const periods: { value: Period; label: string }[] = [
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: 'all', label: 'All Time' },
];

export function TimePeriodSelector({ value, onChange }: TimePeriodSelectorProps) {
    return (
        <div className="flex gap-2">
            {periods.map((period) => (
                <button
                    key={period.value}
                    onClick={() => onChange(period.value)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        value === period.value
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                >
                    {period.label}
                </button>
            ))}
        </div>
    );
}
