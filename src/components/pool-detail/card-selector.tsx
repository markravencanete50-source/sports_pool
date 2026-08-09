"use client";

import { CreditCard, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CardSelectorProps } from "@/lib/interfaces";
import { ParlayCard } from "@/lib/types";

export function CardSelector({
  cards,
  selectedCardId,
  onSelectCard,
  onPurchaseNew,
  entryFee,
}: CardSelectorProps) {
  const getCardStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "border-green-500/50 bg-green-500/10";
      case "completed":
        return "border-blue-500/50 bg-blue-500/10";
      case "pending":
        return "border-yellow-500/50 bg-yellow-500/10";
      default:
        return "border-white/10 bg-white/5";
    }
  };

  const getPicksCount = (card: ParlayCard) => {
    return card.card_picks?.length || 0;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Your Cards</h3>
        {cards.length < 3 && (
          <button
            onClick={onPurchaseNew}
            className="text-xs text-primary hover:text-primary/80 hover:bg-primary/10 active:scale-95 font-medium px-3 py-2 min-h-9 rounded-lg transition-all"
          >
            + Buy Card ${entryFee}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {cards.map((card) => {
          const picksCount = getPicksCount(card);
          const isSelected = selectedCardId === card.id;

          return (
            <button
              key={card.id}
              onClick={() => onSelectCard(card.id)}
              className={cn(
                "w-full p-3 rounded-lg border-2 transition-all text-left",
                getCardStatusColor(card.status),
                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  <span className="font-bold">Card {card.card_number}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-black/20 uppercase">
                    {card.status}
                  </span>
                </div>
                {isSelected && <Check className="w-4 h-4 text-primary" />}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {picksCount} picks made
              </div>
            </button>
          );
        })}

        {cards.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <p className="mb-2">No cards purchased yet</p>
            <p className="text-xs">Purchase a card to start making picks</p>
          </div>
        )}
      </div>
    </div>
  );
}
