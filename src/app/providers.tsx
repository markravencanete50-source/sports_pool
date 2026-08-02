"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as SonnerToaster } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { FontLoader } from "./font-loader";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FontLoader />
        <SonnerToaster
          position="bottom-right"
          closeButton
          duration={5000}
          toastOptions={{
            classNames: {
              toast: "sonner-toast",
              success: "sonner-success",
              error: "sonner-error",
              title: "sonner-title",
              description: "sonner-description",
            },
          }}
        />
        {children}
      </TooltipProvider>
    </QueryClientProvider>
  );
}
