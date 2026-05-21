"use client";

import { useEffect, useState } from "react";

type Props = {
  end: number;
  suffix?: string;
  durationMs?: number;
  decimals?: number;
  className?: string;
};

export function CountUp({
  end,
  suffix = "",
  durationMs = 1400,
  decimals = 0,
  className = "",
}: Props) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(end * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [end, durationMs]);

  const shown =
    decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();

  return (
    <span className={className}>
      {shown}
      {suffix}
    </span>
  );
}
