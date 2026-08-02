"use client";

import Layout from "@/components/layout";
import { Card3D } from "@/components/ui/3d-card";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { PoolTypeSelector } from "@/components/create-pool/pool-type-selector";
import { PoolSettingsForm } from "@/components/create-pool/pool-settings-form";
import { GameSelectionSection } from "@/components/create-pool/game-selection-section";
import { InviteByEmailSection } from "@/components/create-pool/invite-by-email-section";
import { PoolSummaryCard } from "@/components/create-pool/pool-summary-card";
import { useCreatePool } from "@/lib/hooks/use-pools";
import { useGames } from "@/lib/hooks/use-games";
import { useAuth } from "@/lib/hooks/use-auth";
import { toast } from "sonner";
import { PoolFormData, DateRange } from "@/lib/types";
import { poolConfig } from "@/lib/config";
import { PoolType, DateRange as DateRangeEnum } from "@/lib/enums";

export default function CreatePool() {
  const router = useRouter();
  const { user } = useAuth();
  const createPoolMutation = useCreatePool();
  const [dateRange, setDateRange] = useState<DateRange>(DateRangeEnum.UPCOMING);

  const {
    data: gamesData,
    isLoading: isLoadingGames,
    error: gamesError,
  } = useGames(undefined, undefined);

  const allGames = gamesData?.games || [];
  const currentWeek = gamesData?.week;

  const [formData, setFormData] = useState<PoolFormData>({
    name: "",
    type: PoolType.PUBLIC,
    entryFee: "20",
    maxParticipants: "unlimited",
    selectedGames: [],
    invitedFriends: [],
    invitedEmails: [],
  });

  const groupedGames = useMemo(() => {
    const now = new Date();
    let filteredGames = allGames;

    if (dateRange === DateRangeEnum.UPCOMING) {
      filteredGames = allGames.filter((game: any) => {
        const status = game.status || "scheduled";
        const gameDate = new Date(game.date);
        const notPlayed = status !== "finished";
        return notPlayed && (gameDate >= now || status === "live");
      });
    } else {
      filteredGames = allGames.filter((game: any) => {
        const gameDate = new Date(game.date);
        return gameDate >= now;
      });
    }

    return filteredGames.reduce((acc: any, game: any) => {
      const dateKey = format(new Date(game.date), "yyyy-MM-dd");
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(game);
      return acc;
    }, {} as Record<string, any[]>);
  }, [allGames, dateRange]);

  const selectedGamesWeeks = useMemo(() => {
    const weeks = new Set<number>();
    formData.selectedGames.forEach((gameId) => {
      const game = allGames.find((g: any) => g.id === gameId);
      if (game?.week) {
        weeks.add(game.week);
      }
    });
    return Array.from(weeks);
  }, [formData.selectedGames, allGames]);

  const weekValidationError = useMemo(() => {
    if (selectedGamesWeeks.length === 0) return null;
    if (selectedGamesWeeks.length > 1) {
      return `All games must be from the same week. You have selected games from weeks: ${selectedGamesWeeks.join(
        ", "
      )}`;
    }
    return null;
  }, [selectedGamesWeeks]);

  const sortedDates = Object.keys(groupedGames).sort();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("Please sign in to create a pool");
      router.push("/login");
      return;
    }

    if (weekValidationError) {
      toast.error(weekValidationError);
      return;
    }

    if (formData.selectedGames.length < poolConfig.minGames) {
      toast.error(
        `Please select at least ${poolConfig.minGames} games (maximum ${poolConfig.maxGames})`
      );
      return;
    }
    if (formData.selectedGames.length > poolConfig.maxGames) {
      toast.error(`Maximum ${poolConfig.maxGames} games per pool`);
      return;
    }

    if (selectedGamesWeeks.length !== 1) {
      toast.error("All selected games must be from the same week");
      return;
    }

    try {
      const maxParticipants =
        formData.maxParticipants === "unlimited"
          ? null
          : parseInt(formData.maxParticipants);

      await createPoolMutation.mutateAsync({
        name: formData.name,
        type: formData.type,
        entryFee: parseFloat(formData.entryFee) || 0,
        maxParticipants: maxParticipants,
        week: selectedGamesWeeks[0] || currentWeek || undefined,
        selectedGames: formData.selectedGames,
        invitedEmails:
          formData.type === "private" ? formData.invitedEmails : undefined,
      });

      toast.success("Pool created successfully!");
      router.push(
        formData.type === PoolType.PUBLIC ? "/public-pools" : "/private-pools"
      );
    } catch (error: any) {
      toast.error(error?.message || "Failed to create pool");
    }
  };

  const toggleGameSelection = (gameId: string) => {
    setFormData((prev) => {
      const isSelected = prev.selectedGames.includes(gameId);
      if (isSelected) {
        return {
          ...prev,
          selectedGames: prev.selectedGames.filter((id) => id !== gameId),
        };
      } else {
        const game = allGames.find((g: any) => g.id === gameId);
        const gameWeek = game?.week;

        if (prev.selectedGames.length === 0) {
          return { ...prev, selectedGames: [...prev.selectedGames, gameId] };
        }

        const existingGameWeeks = prev.selectedGames
          .map((id) => allGames.find((g: any) => g.id === id)?.week)
          .filter((w): w is number => w !== undefined);

        if (
          existingGameWeeks.length > 0 &&
          gameWeek &&
          !existingGameWeeks.includes(gameWeek)
        ) {
          toast.error(
            `This game is from week ${gameWeek}, but you've selected games from week ${existingGameWeeks[0]}. All games must be from the same week.`
          );
          return prev;
        }

        return { ...prev, selectedGames: [...prev.selectedGames, gameId] };
      }
    });
  };

  const addInviteEmail = (email: string) => {
    setFormData((prev) => ({
      ...prev,
      invitedEmails: [...(prev.invitedEmails ?? []), email].filter(
        (e, i, arr) => arr.indexOf(e) === i
      ),
    }));
  };

  const removeInviteEmail = (email: string) => {
    setFormData((prev) => ({
      ...prev,
      invitedEmails: (prev.invitedEmails ?? []).filter((e) => e !== email),
    }));
  };

  const entryFee = parseFloat(formData.entryFee) || 0;
  const participants =
    formData.maxParticipants === "unlimited"
      ? 100
      : parseInt(formData.maxParticipants);
  const grossPot = entryFee * participants;
  const platformFeePercentage = 10.0;
  const platformFee = (grossPot * platformFeePercentage) / 100;
  const netPot = grossPot - platformFee;

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto pb-20">
        <div className="mb-8">
          <h1 className="text-4xl font-black font-display italic uppercase mb-2">
            Create New Pool
          </h1>
          <p className="text-muted-foreground">
            Set up your league and invite friends to dominate the gridiron.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card3D intensity={5}>
              <form
                id="create-pool-form"
                onSubmit={handleSubmit}
                className="glass-panel p-8 rounded-2xl space-y-8"
              >
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-muted-foreground">
                    Pool Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g. Sunday Night Showdown"
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-4 text-lg font-bold focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                  />
                </div>

                <PoolTypeSelector
                  poolType={formData.type}
                  onTypeChange={(type) => setFormData({ ...formData, type })}
                />

                <PoolSettingsForm
                  entryFee={formData.entryFee}
                  maxParticipants={formData.maxParticipants}
                  onEntryFeeChange={(value) =>
                    setFormData({ ...formData, entryFee: value })
                  }
                  onMaxParticipantsChange={(value) =>
                    setFormData({ ...formData, maxParticipants: value })
                  }
                />

                <GameSelectionSection
                  groupedGames={groupedGames}
                  sortedDates={sortedDates}
                  selectedGames={formData.selectedGames}
                  myPicks={{}}
                  onToggleGameSelection={toggleGameSelection}
                  onTogglePick={() => {}}
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  isLoadingGames={isLoadingGames}
                  gamesError={gamesError}
                  pickEnabled={false}
                />

                {formData.type === PoolType.PRIVATE && (
                  <InviteByEmailSection
                    emails={formData.invitedEmails ?? []}
                    onAddEmail={addInviteEmail}
                    onRemoveEmail={removeInviteEmail}
                  />
                )}
              </form>
            </Card3D>
          </div>

          <PoolSummaryCard
            poolName={formData.name}
            poolType={formData.type}
            entryFee={entryFee}
            maxParticipants={formData.maxParticipants}
            selectedGamesCount={formData.selectedGames.length}
            invitedFriendsCount={(formData.invitedEmails ?? []).length}
            grossPot={grossPot}
            platformFee={platformFee}
            netPot={netPot}
            isSubmitting={createPoolMutation.isPending}
            canSubmit={formData.selectedGames.length > 0}
            formatCurrency={formatCurrency}
          />
        </div>
      </div>
    </Layout>
  );
}
