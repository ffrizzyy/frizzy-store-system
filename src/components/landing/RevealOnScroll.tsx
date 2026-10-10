"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Kemunculan bertahap saat masuk viewport. Memakai IntersectionObserver
 * (bukan event scroll) dan menghormati prefers-reduced-motion lewat CSS.
 */
export function RevealOnScroll({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // @ts-expect-error - elemen dinamis dengan ref generik
      ref={ref}
      className={cn("transition-none", className)}
      style={
        visible
          ? { animation: `fz-rise 0.6s var(--ease-out) ${delay}ms both` }
          : { opacity: 0, transform: "translateY(14px)" }
      }
    >
      {children}
    </Tag>
  );
}
