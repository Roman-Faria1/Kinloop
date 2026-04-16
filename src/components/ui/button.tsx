import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600",
        secondary:
          "bg-white/70 px-4 py-2 text-slate-900 ring-1 ring-slate-200 hover:bg-white",
        ghost: "px-3 py-2 text-slate-700 hover:bg-slate-100",
      },
      size: {
        default: "h-10",
        sm: "h-8 px-3",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
