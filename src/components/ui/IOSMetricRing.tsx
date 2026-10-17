interface IOSMetricRingProps {
  label: string;
  value: number;
  max: number;
  display?: string;
}

export function IOSMetricRing({ label, value, max, display }: IOSMetricRingProps) {
  const clamped = Math.max(0, Math.min(max > 0 ? value : 0, max));
  const ratio = max > 0 ? clamped / max : 0;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
          <circle
            cx="42"
            cy="42"
            r={radius}
            fill="none"
            stroke="#27272a"
            strokeWidth="8"
          />
          <circle
            cx="42"
            cy="42"
            r={radius}
            fill="none"
            stroke="#a1a1aa"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold text-zinc-100">
          {display ?? `${Math.round(ratio * 100)}%`}
        </div>
      </div>
      <span className="text-xs font-medium text-zinc-500">{label}</span>
    </div>
  );
}
