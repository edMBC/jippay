"use client";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface IOSSegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function IOSSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: IOSSegmentedControlProps<T>) {
  return (
    <div className="inline-flex rounded-2xl border border-white/[0.08] bg-zinc-900/70 p-1 backdrop-blur-2xl">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`relative rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
              active
                ? "bg-zinc-800 text-zinc-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
                : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
