"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStripeCheckout } from "@/lib/hooks/use-stripe-checkout";
import { toast } from "sonner";
import { useAuth } from "@/lib/hooks/use-auth";
import { CardPurchaseButtonProps } from "@/lib/interfaces";

export function CardPurchaseButton({
  poolId,
  entryFee,
  onPurchaseSuccess,
  disabled: disabledProp = false,
}: CardPurchaseButtonProps) {
  const { user } = useAuth();
  const { createCheckoutSession, isPending } = useStripeCheckout();
  const [isOpen, setIsOpen] = useState(false);
  const disabled = disabledProp || isPending;

  if (!user) {
    return (
      <Button disabled className="w-full">
        Sign in to purchase card
      </Button>
    );
  }

  const handlePurchase = async () => {
    try {
      await createCheckoutSession({ poolId, entryFee });
      setIsOpen(false);
      onPurchaseSuccess?.();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to start checkout";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        id="purchase-card-trigger"
        onClick={() => setIsOpen(true)}
        className="w-full bg-primary hover:bg-primary/90"
        disabled={disabled}
      >
        <CreditCard className="w-4 h-4 mr-2" />
        Buy Card - ${entryFee}
      </Button>

      {isOpen && (
        <div
          /*
           * Backdrop click-to-close is a pointer convenience; the keyboard
           * path is the Cancel button inside the dialog. presentation opts
           * this wrapper out of the a11y tree rather than faking a button.
           */
          role="presentation"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div className="bg-card text-card-foreground border border-border rounded-xl p-6 max-w-md w-full max-h-[85dvh] overflow-y-auto space-y-4 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300">
            <h3 className="text-xl font-bold">Purchase Parlay Card</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Entry Fee:</span>
                <span className="font-bold">${entryFee}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-white/10">
                <span className="text-muted-foreground">To Prize Pot:</span>
                <span className="font-bold text-primary">
                  ${entryFee.toFixed(2)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              You will be redirected to Stripe to pay securely. You can purchase
              up to 3 cards per pool.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="flex-1"
                disabled={disabled}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePurchase}
                className="flex-1 bg-primary"
                disabled={disabled}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  "Pay with Stripe"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
