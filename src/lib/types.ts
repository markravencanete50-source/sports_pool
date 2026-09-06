import {
  type PoolType,
  type PoolStatus,
  type CardStatus,
  type GamePrediction,
  type GameStatus,
  type DateRange,
  type FilterType,
  type PoolsListStatusFilter,
  type MyGamesOutcomeFilter,
  type ViewType,
  type InvitationStatus,
} from "./enums";

export type {
  PoolType,
  PoolStatus,
  CardStatus,
  GamePrediction,
  GameStatus,
  DateRange,
  FilterType,
  PoolsListStatusFilter,
  MyGamesOutcomeFilter,
  ViewType,
  InvitationStatus,
};

export type UnauthorizedBehavior = "returnNull" | "throw";

export interface PoolFormData {
  name: string;
  type: PoolType;
  entryFee: string;
  maxParticipants: string;
  selectedGames: string[];
  invitedFriends: string[];
  invitedEmails?: string[];
  /** datetime-local values; converted to ISO at submit. Empty = unset. */
  startsAt: string;
  endsAt: string;
  /** Private pools only. Empty = no password. */
  password: string;
}

export interface Pool {
  id: string;
  name: string;
  type: PoolType;
  entryFee?: number;
  entry_fee?: number;
  participants: number;
  prizePot?: number;
  prize_pot?: number;
  week: number;
  status: PoolStatus;
  sport?: string;
  share_slug?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  /** Set by the list endpoint when an active paid placement covers the pool. */
  is_promoted?: boolean;
}

export interface ParlayCard {
  id: string;
  pool_id: string;
  user_id: string;
  card_number: number;
  entry_fee_paid: number;
  status: CardStatus;
  created_at: string;
  updated_at: string;
  card_picks?: CardPick[];
}

/**
 * Game row embedded on a card pick by the cards API
 * (`card_picks ( ..., games (id, home_team_id, away_team_id, date, status) )`).
 * Supabase joins are handled defensively as object-or-array elsewhere, so both
 * shapes are allowed here.
 */
export interface CardPickGame {
  id: string;
  home_team_id?: string | null;
  away_team_id?: string | null;
  date?: string;
  status?: string;
  home_score?: number | null;
  away_score?: number | null;
}

export interface CardPick {
  id: string;
  card_id: string;
  game_id: string;
  prediction: GamePrediction;
  total_score_prediction?: number;
  created_at: string;
  updated_at: string;
  games?: CardPickGame | CardPickGame[] | null;
}

export interface Comment {
  id: string;
  userId: string;
  user_id?: string;
  text: string;
  timestamp: string;
  created_at?: string;
  user?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
  users?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
}

export interface ESPNTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  logo: string;
  color?: string;
  alternateColor?: string;
}

export interface ESPNGame {
  id: string;
  date: string;
  week: {
    number: number;
  };
  season: {
    year: number;
    type: number;
  };
  competitions: Array<{
    id: string;
    date: string;
    status: {
      /** Quarter (1-4), 5+ for overtime. 0 before kickoff. */
      period?: number;
      /** "12:34" — the game clock as ESPN displays it. */
      displayClock?: string;
      type: {
        completed: boolean;
        description: string;
        state?: "pre" | "in" | "post";
        detail?: string;
        shortDetail?: string;
      };
    };
    competitors: Array<{
      id: string;
      homeAway: "home" | "away";
      team: ESPNTeam;
      score?: string;
    }>;
    /**
     * Present only while a game is in progress. `possession` is the ESPN team
     * id of the side with the ball (matches competitors[].id / team.id).
     */
    situation?: {
      possession?: string;
      downDistanceText?: string;
      shortDownDistanceText?: string;
      possessionText?: string;
      yardLine?: number;
      isRedZone?: boolean;
      homeTimeouts?: number;
      awayTimeouts?: number;
    };
    odds?: Array<{
      details: string;
      overUnder?: number;
    }>;
  }>;
}

/** Live-state columns on public.games, filled from the ESPN situation block. */
export interface GameLiveState {
  period: number | null;
  display_clock: string | null;
  /** Our team id (abbreviation) of the side in possession, or null. */
  possession: string | null;
  down_distance: string | null;
  yard_line: number | null;
  is_red_zone: boolean;
  last_synced_at: string | null;
}

export interface ESPNScoreboardResponse {
  week: {
    number: number;
  };
  season: {
    year: number;
    type: number;
  };
  events: ESPNGame[];
}

// ——— Winners / pool completion ———
export interface WinningEntry {
  poolId: string;
  poolName: string;
  amount: number;
  correct: number;
  total: number;
}

// ——— My Games (pools user has staked on, with outcome) ———
export interface MyGameEntry {
  poolId: string;
  poolName: string;
  type: string;
  status: string;
  entryFee: number;
  participants: number;
  prizePot: number;
  week?: number;
  outcome: "won" | "lost" | "pending";
  amount: number | null;
  correct: number | null;
  total: number | null;
  winningCardId?: string | null;
  pendingApproval: boolean;
}

export interface UseMeGamesParams {
  search?: string;
  outcome?: string;
  page?: number;
  limit?: number;
}

export interface MeGamesResult {
  games: MyGameEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ComputePoolWinnersInput {
  pool: { id: string; name: string; prize_pot: number };
  poolCards: { id: string; user_id: string }[];
  picks: Array<{
    card_id: string;
    game_id: string;
    prediction: string;
    total_score_prediction?: number | null;
    parlay_cards?: { user_id: string } | { user_id: string }[];
  }>;
  poolGames: Array<{
    game_id: string;
    games?:
      | {
          status: string;
          home_score: number | null;
          away_score: number | null;
        }
      | Array<{
          status: string;
          home_score: number | null;
          away_score: number | null;
        }>;
  }>;
  platformFeePercentage?: number;
}

export interface PoolWinnerResult {
  userId: string;
  cardId: string;
  correct: number;
  total: number;
  totalScoreDiff: number;
  amount: number;
}

// ——— Pool access (DB row shape) ———
export interface PoolRow {
  id: string;
  status: string;
  max_participants: number | null;
  entry_fee?: number;
  prize_pot?: number;
  participants?: number;
}

// ——— Admin users ———
export type UserRole = "user" | "admin";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UseAdminUsersParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface AdminUsersResult {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ——— Pools list hook ———
export interface UsePoolsParams {
  type?: "public" | "private";
  status?: PoolsListStatusFilter;
  search?: string;
  sport?: string;
  page?: number;
  limit?: number;
}

export interface PoolsListResult {
  pools: Pool[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ——— Stripe checkout ———
export interface CreateCheckoutSessionParams {
  poolId: string;
  entryFee: number;
}

// ——— Teams seed (DB row shape for teams table) ———
export interface TeamRow {
  id: string;
  name: string;
  city: string;
  abbreviation: string;
  logo: string;
  primary_color: string;
  secondary_color: string;
}
