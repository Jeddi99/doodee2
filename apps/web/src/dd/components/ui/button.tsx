import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/45 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[#f8fafc] text-[#0d0b1f] shadow-[0_0_38px_rgba(168,85,247,0.24)] hover:bg-white active:bg-[#dbeafe]",
        primary:
          "bg-[#f8fafc] text-[#0d0b1f] shadow-[0_0_38px_rgba(168,85,247,0.24)] hover:bg-white active:bg-[#dbeafe]",
        outline:
          "border border-[#241f1a]/15 bg-white/70 text-[#241f1a] shadow-[0_14px_30px_-24px_rgba(36,31,26,0.34)] backdrop-blur-md hover:border-[#241f1a]/25 hover:bg-white/90 dark:border-white/[0.14] dark:bg-[#f8fafc]/[0.06] dark:text-[#f8fafc] dark:shadow-[0_16px_34px_-28px_rgba(0,0,0,0.7)] dark:hover:border-white/[0.22] dark:hover:bg-[#f8fafc]/[0.10]",
        ghost:
          "text-[#f8fafc]/65 hover:bg-[#f8fafc]/[0.07] hover:text-[#f8fafc]",
        google:
          "border border-white/[0.14] bg-[#f8fafc]/[0.08] text-[#f8fafc] shadow-[0_12px_30px_-24px_rgba(0,0,0,0.7)] backdrop-blur-md hover:bg-[#f8fafc]/[0.12]",
        hud: "border border-cyan/[0.22] bg-cyan/[0.08] text-cyan shadow-[0_12px_30px_-26px_rgba(6,182,212,0.42)] backdrop-blur-md hover:bg-cyan/[0.12]",
        panel:
          "border border-white/[0.14] bg-[#f8fafc]/[0.07] text-[#f8fafc] shadow-[0_12px_32px_-26px_rgba(0,0,0,0.7)] backdrop-blur-md hover:bg-[#f8fafc]/[0.11]",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-10 px-4",
        lg: "h-12 px-7 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
