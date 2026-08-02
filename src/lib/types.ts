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

export interface CardPick {
  id: string;
  card_id: string;
  game_id: string;
  prediction: GamePrediction;
  total_score_prediction?: number;
  created_at: string;
  updated_at: string;
  games?: any;
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
      type: {
        completed: boolean;
        description: string;
      };
    };
    competitors: Array<{
      id: string;
      homeAway: "home" | "away";
      team: ESPNTeam;
      score?: string;
    }>;
    odds?: Array<{
      details: string;
      overUnder?: number;
    }>;
  }>;
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
  page?: number;
  limit?: number;
}

export interface PoolsListResult {
  pools: any[];
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
