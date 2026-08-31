"use client";

import * as React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils/cn";

export const Tabs = RadixTabs.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof RadixTabs.List>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.List>
>(({ className, ...props }, ref) => (
  <RadixTabs.List
    ref={ref}
    className={cn(
      "surface-glass doodee-tabs-list flex min-h-[52px] max-w-full touch-pan-x touch-manipulation flex-nowrap items-center gap-2 overflow-x-auto rounded-xl p-1 no-scrollbar",
      className
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger>
>(({ className, ...props }, ref) => (
  <RadixTabs.Trigger
    ref={ref}
    className={cn(
      "doodee-tabs-trigger inline-flex min-h-[44px] shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold text-[#f8fafc]/72 transition-colors duration-200 hover:bg-[#f8fafc]/[0.07] hover:text-[#f8fafc] data-[state=active]:border data-[state=active]:border-white/[0.18] data-[state=active]:bg-[#f8fafc] data-[state=active]:text-[#0d0b1f] data-[state=active]:shadow-[0_10px_26px_-20px_rgba(168,85,247,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/45",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(({ className, ...props }, ref) => (
  <RadixTabs.Content
    ref={ref}
    className={cn(
      "mt-6 focus-visible:outline-none",
      "data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-1 data-[state=active]:duration-200",
      "motion-reduce:data-[state=active]:animate-none",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
