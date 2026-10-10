"use client";

import * as Phosphor from "@phosphor-icons/react/dist/ssr";
import type { IconProps } from "@phosphor-icons/react";

type IconName = keyof typeof Phosphor;

/** Ikon Phosphor dengan berat seragam, 20px default, currentColor. */
export function Icon({
  name,
  size = 20,
  weight = "regular",
  className,
}: {
  name: string;
  size?: number;
  weight?: IconProps["weight"];
  className?: string;
}) {
  const Cmp = (Phosphor as unknown as Record<string, React.ComponentType<IconProps>>)[name];
  if (!Cmp) return null;
  return <Cmp size={size} weight={weight} className={className} aria-hidden="true" />;
}
