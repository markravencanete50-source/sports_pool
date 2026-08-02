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
        onClick={() => setIsOpen(true)}
        className="w-full bg-primary hover:bg-primary/90"
        disabled={disabled}
      >
        <CreditCard className="w-4 h-4 mr-2" />
        Buy Card - ${entryFee}
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 ">
          <div className="bg-card text-card-foreground border border-border rounded-xl p-6 max-w-md w-full space-y-4 shadow-xl relative -top-20">
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
