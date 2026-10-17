import type { HTMLAttributes, ReactNode } from "react";

interface IOSGlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function IOSGlassCard({ children, className = "", ...rest }: IOSGlassCardProps) {
  return (
    <div
      className={`rounded-3xl border border-white/[0.08] bg-zinc-900/65 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-2xl ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
