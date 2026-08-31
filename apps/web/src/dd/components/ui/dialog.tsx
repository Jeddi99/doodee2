"use client";

import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

type DialogContentProps = React.ComponentPropsWithoutRef<
  typeof RadixDialog.Content
> & {
  overlayClassName?: string;
};

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  DialogContentProps
>(({ className, children, overlayClassName, ...props }, ref) => (
  <RadixDialog.Portal>
    <RadixDialog.Overlay
      className={cn(
        "doodee-dialog-overlay fixed inset-0 z-50 overscroll-contain bg-[#02040c]",
        overlayClassName
      )}
    />
    <RadixDialog.Content
      ref={ref}
      className={cn(
        "surface-glass doodee-dialog-content fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-max(env(safe-area-inset-top),0.5rem)-max(env(safe-area-inset-bottom),0.5rem)-1rem)] w-[calc(100%_-_1rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-6 overflow-y-auto overscroll-contain rounded-2xl p-5 text-[#f8fafc] sm:w-full sm:p-6",
        className
      )}
      {...props}
    >
      {children}
      <RadixDialog.Close
        aria-label="Close"
        className="doodee-press absolute right-3 top-3 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[#f8fafc]/65 transition-colors duration-200 hover:bg-white/[0.08] hover:text-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/45 sm:right-4 sm:top-4"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </RadixDialog.Close>
    </RadixDialog.Content>
  </RadixDialog.Portal>
));
DialogContent.displayName = "DialogContent";

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Title>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(({ className, ...props }, ref) => (
  <RadixDialog.Title
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-tight text-[#f8fafc] sm:text-3xl",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Description>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(({ className, ...props }, ref) => (
  <RadixDialog.Description
    ref={ref}
    className={cn("text-sm leading-relaxed text-[#f8fafc]/65", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";
