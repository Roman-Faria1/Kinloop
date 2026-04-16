import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
  {
    variants: {
      variant: {
        neutral: "bg-slate-100 text-slate-700",
        accent: "bg-amber-100 text-amber-900",
        success: "bg-emerald-100 text-emerald-900",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export function Badge({
  className,
  variant,
  children,
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)}>{children}</span>
  );
}
