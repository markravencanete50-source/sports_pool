import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import {
  ParlayCard,
  Comment,
  PoolType,
  GamePrediction,
  DateRange,
  type PoolsListStatusFilter,
} from "./types";
import { User, Game } from "./mock-data";

export interface CardSelectorProps {
  cards: ParlayCard[];
  selectedCardId: string | null;
  onSelectCard: (cardId: string) => void;
  onPurchaseNew: () => void;
  entryFee: number;
}

export interface CardPurchaseButtonProps {
  poolId: string;
  entryFee: number;
  onPurchaseSuccess?: () => void;
  disabled?: boolean;
}

export interface CommentSectionProps {
  comments: Comment[];
  onAddComment: (text: string) => void;
  isLoading?: boolean;
  requiresCard?: boolean;
  onPurchaseCard?: () => void;
  currentUserId?: string | null;
}

export type GameResultOutcome = "home_win" | "away_win" | "tie" | "disrupted";

export interface GameResult {
  actualOutcome: GameResultOutcome;
  pickCorrect: boolean;
  homeScore?: number | null;
  awayScore?: number | null;
}

export interface GameCardProps {
  game: Game;
  onPick?: (teamIdOrTie: string) => void;
  selectedTeamId?: string;
  selectedPrediction?: "home_win" | "away_win" | "tie";
  disabled?: boolean;
  gameResult?: GameResult | null;
}

export interface NavItemType {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface UserType {
  id: string;
  email?: string;
  name?: string;
  avatar?: string | null;
}

export interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  navItems: NavItemType[];
  activePath: string;
  onToggleCollapse: () => void;
  user?: UserType | null;
  isAuthenticated: boolean;
  isLoadingUser: boolean;
}

export interface PoolSummaryCardProps {
  poolName: string;
  poolType: PoolType;
  entryFee: number;
  maxParticipants: string;
  selectedGamesCount: number;
  invitedFriendsCount: number;
  grossPot: number;
  platformFee: number;
  netPot: number;
  isSubmitting: boolean;
  canSubmit: boolean;
  formatCurrency: (amount: number) => string;
}

export interface GameSelectionSectionProps {
  groupedGames: Record<string, any[]>;
  sortedDates: string[];
  selectedGames: string[];
  myPicks: Record<string, string | number>;
  onToggleGameSelection: (gameId: string) => void;
  onTogglePick: (gameId: string, teamId: string) => void;
  onTogglePrediction?: (
    gameId: string,
    prediction: GamePrediction,
    totalScore?: number
  ) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  isLoadingGames?: boolean;
  gamesError?: Error | null;
  pickEnabled?: boolean;
}

export interface GameSelectionItemProps {
  game: any;
  isSelected: boolean;
  selectedTeamId?: string;
  selectedPrediction?: GamePrediction;
  totalScorePrediction?: number;
  onToggleSelection: () => void;
  onPickTeam?: (teamId: string) => void;
  onPickPrediction?: (prediction: GamePrediction, totalScore?: number) => void;
  pickEnabled?: boolean;
}

export interface GameSelectionDateHeaderProps {
  date: Date;
  gameCount?: number;
}

export interface PoolSettingsFormProps {
  entryFee: string;
  maxParticipants: string;
  onEntryFeeChange: (value: string) => void;
  onMaxParticipantsChange: (value: string) => void;
}

export interface PoolTypeSelectorProps {
  poolType: PoolType;
  onTypeChange: (type: PoolType) => void;
}

export interface FriendInvitationSectionProps {
  friends: User[];
  invitedFriends: string[];
  onToggleFriend: (userId: string) => void;
}

export interface FriendInviteCardProps {
  friend: User;
  isInvited: boolean;
  onToggle: () => void;
}

export interface ScheduleGameCardProps {
  game: any;
}

export interface Card3DProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  intensity?: number;
}

export interface AuthFormProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footerText: string;
  footerLinkText: string;
  footerLinkHref: string;
  onSubmit: (e: React.FormEvent) => void;
}

export interface FormInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  rightElement?: ReactNode;
  error?: string;
}

export interface ProgressCardProps {
  picksMade: number;
  totalGames: number;
}

export interface PoolHeaderProps {
  pool: any;
}

export interface NFLScheduleSectionProps {
  groupedGames: Record<string, any[]>;
  sortedDates: string[];
}

export interface GameDateHeaderProps {
  date: Date;
}

export interface FeaturedPoolsSectionProps {
  pools: any[];
}

export interface YourActivePoolsSectionProps {
  pools: any[];
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionText: string;
  actionHref: string;
}

export interface PoolsPageHeaderProps {
  title: string;
  description: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  statusFilter?: PoolsListStatusFilter;
  onStatusFilterChange?: (value: PoolsListStatusFilter) => void;
  rightElement?: ReactNode;
}

export interface MyGamesPageHeaderProps {
  title: string;
  description: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  outcomeFilter?: import("./enums").MyGamesOutcomeFilter;
  onOutcomeFilterChange?: (
    value: import("./enums").MyGamesOutcomeFilter
  ) => void;
  rightElement?: ReactNode;
}

export interface FeatureListProps {
  title: string;
  features: string[];
  className?: string;
}

export interface SidebarHeaderProps {
  isCollapsed: boolean;
}

export interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  isCollapsed: boolean;
}

export interface MobileHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export interface UserProfileCardProps {
  isCollapsed: boolean;
  user?: UserType | null;
  isAuthenticated: boolean;
  isLoadingUser: boolean;
}
