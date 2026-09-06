export const PoolType = {
  PUBLIC: "public",
  PRIVATE: "private",
} as const;

export const PoolStatus = {
  OPEN: "open",
  ACTIVE: "active",
  COMPLETED: "completed",
  /** Admin hold: no purchases, no settlement, picks frozen. Resumable. */
  PAUSED: "paused",
  /** Terminal admin decision. Paid entries are marked for refund. */
  CANCELLED: "cancelled",
} as const;

/** Statuses in which a pool accepts card purchases. */
export const PURCHASABLE_POOL_STATUSES: readonly string[] = [
  PoolStatus.OPEN,
  PoolStatus.ACTIVE,
];

export const AccountStatus = {
  ACTIVE: "active",
  BLOCKED: "blocked",
  SUSPENDED: "suspended",
} as const;

export const CommentModerationStatus = {
  VISIBLE: "visible",
  HIDDEN: "hidden",
  FLAGGED: "flagged",
  DELETED: "deleted",
} as const;

export const PromotionStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  ACTIVE: "active",
  PAUSED: "paused",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
} as const;

export const PayoutRequestStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  ON_HOLD: "on_hold",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export const CardStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export const GamePrediction = {
  HOME_WIN: "home_win",
  AWAY_WIN: "away_win",
  TIE: "tie",
} as const;

export const GameStatus = {
  SCHEDULED: "scheduled",
  LIVE: "live",
  FINISHED: "finished",
} as const;

export const DateRange = {
  UPCOMING: "upcoming",
  ALL: "all",
} as const;

export const FilterType = {
  ALL: "all",
  UPCOMING: "upcoming",
  LIVE: "live",
  FINISHED: "finished",
} as const;

/** Status filter for pools listing (All / Open / Completed) */
export const PoolsListStatusFilter = {
  ALL: "all",
  OPEN: "open",
  COMPLETED: "completed",
} as const;

export const POOLS_LIST_STATUS_OPTIONS: {
  value: (typeof PoolsListStatusFilter)[keyof typeof PoolsListStatusFilter];
  label: string;
}[] = [
  { value: PoolsListStatusFilter.ALL, label: "All" },
  { value: PoolsListStatusFilter.OPEN, label: "Open" },
  { value: PoolsListStatusFilter.COMPLETED, label: "Completed" },
];

/** Outcome filter for My Games (All / Won / Lost / Pending) */
export const MyGamesOutcomeFilter = {
  ALL: "all",
  WON: "won",
  LOST: "lost",
  PENDING: "pending",
} as const;

export const MY_GAMES_OUTCOME_OPTIONS: {
  value: (typeof MyGamesOutcomeFilter)[keyof typeof MyGamesOutcomeFilter];
  label: string;
}[] = [
  { value: MyGamesOutcomeFilter.ALL, label: "All" },
  { value: MyGamesOutcomeFilter.WON, label: "Won" },
  { value: MyGamesOutcomeFilter.LOST, label: "Lost" },
  { value: MyGamesOutcomeFilter.PENDING, label: "Pending" },
];

export const ViewType = {
  WEEK: "week",
  MONTH: "month",
} as const;

export const InvitationStatus = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined",
} as const;

export type PoolType = (typeof PoolType)[keyof typeof PoolType];
export type PoolStatus = (typeof PoolStatus)[keyof typeof PoolStatus];
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];
export type CommentModerationStatus =
  (typeof CommentModerationStatus)[keyof typeof CommentModerationStatus];
export type PromotionStatus = (typeof PromotionStatus)[keyof typeof PromotionStatus];
export type PayoutRequestStatus =
  (typeof PayoutRequestStatus)[keyof typeof PayoutRequestStatus];
export type CardStatus = (typeof CardStatus)[keyof typeof CardStatus];
export type GamePrediction =
  (typeof GamePrediction)[keyof typeof GamePrediction];
export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];
export type DateRange = (typeof DateRange)[keyof typeof DateRange];
export type FilterType = (typeof FilterType)[keyof typeof FilterType];
export type PoolsListStatusFilter =
  (typeof PoolsListStatusFilter)[keyof typeof PoolsListStatusFilter];
export type MyGamesOutcomeFilter =
  (typeof MyGamesOutcomeFilter)[keyof typeof MyGamesOutcomeFilter];
export type ViewType = (typeof ViewType)[keyof typeof ViewType];
export type InvitationStatus =
  (typeof InvitationStatus)[keyof typeof InvitationStatus];
