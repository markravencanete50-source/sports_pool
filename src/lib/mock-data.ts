import { addDays, format } from "date-fns";

export type Team = {
  id: string;
  name: string;
  city: string;
  abbreviation: string;
  logo: string; // Using generic placeholders or lucide icons mapping
  primaryColor: string;
  secondaryColor: string;
};

export type Game = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  date: string; // ISO date string
  status: "scheduled" | "live" | "finished";
  homeScore?: number;
  awayScore?: number;
  odds?: string; // e.g., "KC -3.5"
};

export type User = {
  id: string;
  name: string;
  avatar: string;
  email?: string;
};

export type Comment = {
  id: string;
  userId: string;
  text: string;
  timestamp: string;
};

export type Pool = {
  id: string;
  name: string;
  type: "public" | "private";
  entryFee: number;
  participants: number;
  prizePot: number;
  week: number;
  comments: Comment[];
  status: "open" | "active" | "completed";
  selectedGames?: string[]; // Array of game IDs included in the pool
  invitedFriends?: string[]; // Array of user IDs invited to the pool
};

export const TEAMS: Record<string, Team> = {
  KC: { id: "KC", name: "Chiefs", city: "Kansas City", abbreviation: "KC", logo: "🛡️", primaryColor: "#E31837", secondaryColor: "#FFB81C" },
  SF: { id: "SF", name: "49ers", city: "San Francisco", abbreviation: "SF", logo: "⛏️", primaryColor: "#AA0000", secondaryColor: "#B3995D" },
  BAL: { id: "BAL", name: "Ravens", city: "Baltimore", abbreviation: "BAL", logo: "🐦", primaryColor: "#241773", secondaryColor: "#9E7C0C" },
  DET: { id: "DET", name: "Lions", city: "Detroit", abbreviation: "DET", logo: "🦁", primaryColor: "#0076B6", secondaryColor: "#B0B7BC" },
  BUF: { id: "BUF", name: "Bills", city: "Buffalo", abbreviation: "BUF", logo: "🦬", primaryColor: "#00338D", secondaryColor: "#C60C30" },
  PHI: { id: "PHI", name: "Eagles", city: "Philadelphia", abbreviation: "PHI", logo: "🦅", primaryColor: "#004C54", secondaryColor: "#A5ACAF" },
  CIN: { id: "CIN", name: "Bengals", city: "Cincinnati", abbreviation: "CIN", logo: "🐯", primaryColor: "#FB4F14", secondaryColor: "#000000" },
  MIA: { id: "MIA", name: "Dolphins", city: "Miami", abbreviation: "MIA", logo: "🐬", primaryColor: "#008E97", secondaryColor: "#FC4C02" },
  GB: { id: "GB", name: "Packers", city: "Green Bay", abbreviation: "GB", logo: "🧀", primaryColor: "#203731", secondaryColor: "#FFB612" },
  LAR: { id: "LAR", name: "Rams", city: "Los Angeles", abbreviation: "LAR", logo: "🐏", primaryColor: "#003594", secondaryColor: "#FFA300" },
  NYJ: { id: "NYJ", name: "Jets", city: "New York", abbreviation: "NYJ", logo: "✈️", primaryColor: "#125740", secondaryColor: "#000000" },
  CLE: { id: "CLE", name: "Browns", city: "Cleveland", abbreviation: "CLE", logo: "🐶", primaryColor: "#311D00", secondaryColor: "#FF3C00" },
};

export const UPCOMING_GAMES: Game[] = [
  { id: "g1", homeTeamId: "KC", awayTeamId: "BAL", date: new Date().toISOString(), status: "scheduled", odds: "KC -3.5" },
  { id: "g2", homeTeamId: "PHI", awayTeamId: "GB", date: addDays(new Date(), 1).toISOString(), status: "scheduled", odds: "PHI -2.0" },
  { id: "g3", homeTeamId: "DET", awayTeamId: "LAR", date: addDays(new Date(), 2).toISOString(), status: "scheduled", odds: "DET -4.5" },
  { id: "g4", homeTeamId: "SF", awayTeamId: "NYJ", date: addDays(new Date(), 2).toISOString(), status: "scheduled", odds: "SF -6.0" },
  { id: "g5", homeTeamId: "BUF", awayTeamId: "MIA", date: addDays(new Date(), 3).toISOString(), status: "scheduled", odds: "BUF -1.5" },
  { id: "g6", homeTeamId: "CIN", awayTeamId: "CLE", date: addDays(new Date(), 3).toISOString(), status: "scheduled", odds: "CIN -5.5" },
  { id: "g7", homeTeamId: "GB", awayTeamId: "CHI", date: addDays(new Date(), 3).toISOString(), status: "scheduled", odds: "GB -3.0" }, // Added for same day test
];

export const MOCK_POOLS: Pool[] = [
  {
    id: "p1",
    name: "Week 1 Mega Public",
    type: "public",
    entryFee: 25,
    participants: 1450,
    prizePot: 36250,
    week: 1,
    status: "open",
    comments: [
      { id: "c1", userId: "u1", text: "Chiefs all the way this year!", timestamp: new Date().toISOString() },
      { id: "c2", userId: "u2", text: "Don't sleep on the Lions.", timestamp: new Date().toISOString() },
    ]
  },
  {
    id: "p2",
    name: "High Rollers Club",
    type: "public",
    entryFee: 500,
    participants: 42,
    prizePot: 21000,
    week: 1,
    status: "open",
    comments: []
  },
  {
    id: "p3",
    name: "Office Friends League",
    type: "private",
    entryFee: 10,
    participants: 12,
    prizePot: 120,
    week: 1,
    status: "active",
    comments: [
      { id: "c3", userId: "u3", text: "Did you see that injury report?", timestamp: new Date().toISOString() }
    ]
  },
];

export const USERS: Record<string, User> = {
  u1: { id: "u1", name: "GridironKing", avatar: "👑", email: "king@example.com" },
  u2: { id: "u2", name: "TouchdownTom", avatar: "🏈", email: "tom@example.com" },
  u3: { id: "u3", name: "SarahStats", avatar: "📊", email: "sarah@example.com" },
  u4: { id: "u4", name: "CoachMike", avatar: "🧢", email: "mike@example.com" },
  u5: { id: "u5", name: "BettingBetty", avatar: "💰", email: "betty@example.com" },
  u6: { id: "u6", name: "RookieRick", avatar: "👶", email: "rick@example.com" },
};
