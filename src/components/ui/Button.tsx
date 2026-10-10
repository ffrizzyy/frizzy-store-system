"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "xl" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent border border-transparent hover:bg-accent-hover active:translate-y-[1px] disabled:hover:bg-accent",
  secondary:
    "bg-surface text-text border border-border-strong hover:bg-surface-2 active:translate-y-[1px]",
  ghost: "bg-transparent text-text-muted border border-transparent hover:bg-surface-2 hover:text-text",
  danger: "bg-danger text-white border border-transparent hover:brightness-110 active:translate-y-[1px]",
  success: "bg-accent-soft text-accent border border-accent/30 hover:border-accent/60",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
  xl: "h-14 px-7 text-base",
  icon: "h-10 w-10 justify-center",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", icon, trailing, block, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center gap-2 rounded-[10px] font-medium transition-all duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        block && "w-full justify-center",
        className
      )}
      {...rest}
    >
      {icon}
      {children}
      {trailing}
    </button>
  );
});
