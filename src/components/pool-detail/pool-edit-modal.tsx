"use client";

import { useState, useMemo } from "react";
import { useGames } from "@/lib/hooks/use-games";
import { GameSelectionSection } from "@/components/create-pool/game-selection-section";
import { format } from "date-fns";
import { Loader2, X } from "lucide-react";

type PoolEditModalProps = {
  pool: {
    id: string;
    name: string;
    week: number;
    pool_games?: Array<{
      games?: { id: string } | null;
      game_id?: string;
    } | null>;
  };
  onClose: () => void;
  onSave: (data: { name: string; selectedGames: string[] }) => Promise<void>;
  isSaving: boolean;
};

// Minimal shape of the API game rows this modal filters and groups.
type EditableGame = {
  id: string;
  date: string;
  status?: string;
};

export function PoolEditModal({
  pool,
  onClose,
  onSave,
  isSaving,
}: PoolEditModalProps) {
  const [name, setName] = useState(pool.name);
  const [selectedGames, setSelectedGames] = useState<string[]>(() => {
    const games = pool.pool_games ?? [];
    return games
      .map((pg) => pg?.games?.id ?? pg?.game_id)
      .filter((id): id is string => !!id);
  });
  const [dateRange, setDateRange] = useState<"upcoming" | "all">("upcoming");

  const { data: gamesData } = useGames(
    pool.week,
    dateRange === "upcoming" ? "scheduled" : undefined
  );

  const groupedGames = useMemo(() => {
    const allGames = (gamesData?.games ?? []) as EditableGame[];
    const filtered =
      dateRange === "upcoming"
        ? allGames.filter((g) => {
            const status = g.status ?? "scheduled";
            const gameDate = new Date(g.date);
            const now = new Date();
            return (
              (status === "scheduled" || status === "upcoming") &&
              gameDate > now
            );
          })
        : allGames.filter((g) => new Date(g.date) > new Date());

    return filtered.reduce<Record<string, EditableGame[]>>((acc, game) => {
      const dateKey = format(new Date(game.date), "yyyy-MM-dd");
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(game);
      return acc;
    }, {});
  }, [gamesData, dateRange]);

  const sortedDates = useMemo(
    () => Object.keys(groupedGames).sort(),
    [groupedGames]
  );

  const toggleGame = (gameId: string) => {
    setSelectedGames((prev) =>
      prev.includes(gameId)
        ? prev.filter((id) => id !== gameId)
        : [...prev, gameId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({ name: name.trim(), selectedGames });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div
        className="absolute inset-0"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close modal"
      />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto pr-2 custom-scrollbar glass-panel rounded-2xl p-6 border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold font-display uppercase italic">
            Edit Pool
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="pool-name"
              className="block text-sm font-medium mb-2"
            >
              Pool Name
            </label>
            <input
              id="pool-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={3}
              required
              className="w-full px-4 py-3 rounded-lg border border-white/10 bg-black/30 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Enter pool name"
            />
          </div>

          <GameSelectionSection
            groupedGames={groupedGames}
            sortedDates={sortedDates}
            selectedGames={selectedGames}
            myPicks={{}}
            onToggleGameSelection={toggleGame}
            onTogglePick={() => {}}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            pickEnabled={false}
          />

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSaving || name.trim().length < 3 || selectedGames.length === 0
              }
              className="btn-3d-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
