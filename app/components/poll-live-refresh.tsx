"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PollLiveRefresh({ isRunning }: { isRunning: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      router.refresh();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [isRunning, router]);

  return null;
}
