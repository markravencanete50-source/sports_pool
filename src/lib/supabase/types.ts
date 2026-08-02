export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string
          avatar: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          name: string
          avatar?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          avatar?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      teams: {
        Row: {
          id: string
          name: string
          city: string
          abbreviation: string
          logo: string
          primary_color: string
          secondary_color: string
          created_at: string
        }
        Insert: {
          id: string
          name: string
          city: string
          abbreviation: string
          logo: string
          primary_color: string
          secondary_color: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          city?: string
          abbreviation?: string
          logo?: string
          primary_color?: string
          secondary_color?: string
          created_at?: string
        }
      }
      games: {
        Row: {
          id: string
          home_team_id: string
          away_team_id: string
          date: string
          status: 'scheduled' | 'live' | 'finished'
          home_score: number | null
          away_score: number | null
          odds: string | null
          week: number
          season: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          home_team_id: string
          away_team_id: string
          date: string
          status?: 'scheduled' | 'live' | 'finished'
          home_score?: number | null
          away_score?: number | null
          odds?: string | null
          week: number
          season: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          home_team_id?: string
          away_team_id?: string
          date?: string
          status?: 'scheduled' | 'live' | 'finished'
          home_score?: number | null
          away_score?: number | null
          odds?: string | null
          week?: number
          season?: number
          created_at?: string
          updated_at?: string
        }
      }
      pools: {
        Row: {
          id: string
          name: string
          type: 'public' | 'private'
          entry_fee: number
          max_participants: number | null
          participants: number
          prize_pot: number
          week: number
          status: 'open' | 'active' | 'completed'
          created_by: string
          created_at: string
          updated_at: string
          is_system_weekly_pool: boolean | null
          week_id: number | null
        }
        Insert: {
          id?: string
          name: string
          type: 'public' | 'private'
          entry_fee: number
          max_participants?: number | null
          participants?: number
          prize_pot?: number
          week: number
          status?: 'open' | 'active' | 'completed'
          created_by: string
          created_at?: string
          updated_at?: string
          is_system_weekly_pool?: boolean | null
          week_id?: number | null
        }
        Update: {
          id?: string
          name?: string
          type?: 'public' | 'private'
          entry_fee?: number
          max_participants?: number | null
          participants?: number
          prize_pot?: number
          week?: number
          status?: 'open' | 'active' | 'completed'
          created_by?: string
          created_at?: string
          updated_at?: string
          is_system_weekly_pool?: boolean | null
          week_id?: number | null
        }
      }
      pool_games: {
        Row: {
          id: string
          pool_id: string
          game_id: string
          created_at: string
        }
        Insert: {
          id?: string
          pool_id: string
          game_id: string
          created_at?: string
        }
        Update: {
          id?: string
          pool_id?: string
          game_id?: string
          created_at?: string
        }
      }
      pool_participants: {
        Row: {
          id: string
          pool_id: string
          user_id: string
          joined_at: string
        }
        Insert: {
          id?: string
          pool_id: string
          user_id: string
          joined_at?: string
        }
        Update: {
          id?: string
          pool_id?: string
          user_id?: string
          joined_at?: string
        }
      }
      picks: {
        Row: {
          id: string
          pool_id: string
          user_id: string
          game_id: string
          team_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          pool_id: string
          user_id: string
          game_id: string
          team_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          pool_id?: string
          user_id?: string
          game_id?: string
          team_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      comments: {
        Row: {
          id: string
          pool_id: string
          user_id: string
          text: string
          created_at: string
        }
        Insert: {
          id?: string
          pool_id: string
          user_id: string
          text: string
          created_at?: string
        }
        Update: {
          id?: string
          pool_id?: string
          user_id?: string
          text?: string
          created_at?: string
        }
      }
      pool_invitations: {
        Row: {
          id: string
          pool_id: string
          invited_user_id: string
          invited_by: string
          status: 'pending' | 'accepted' | 'declined'
          created_at: string
        }
        Insert: {
          id?: string
          pool_id: string
          invited_user_id: string
          invited_by: string
          status?: 'pending' | 'accepted' | 'declined'
          created_at?: string
        }
        Update: {
          id?: string
          pool_id?: string
          invited_user_id?: string
          invited_by?: string
          status?: 'pending' | 'accepted' | 'declined'
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_pool_financials: {
        Args: { p_pool_id: string }
        Returns: { prize_pot: number; paid_participant_count: number }[]
      }
      get_pools_financials: {
        Args: { pool_ids: string[] }
        Returns: {
          pool_id: string
          prize_pot: number
          paid_participant_count: number
        }[]
      }
    }
    Enums: {
      pool_type: 'public' | 'private'
      pool_status: 'open' | 'active' | 'completed'
      game_status: 'scheduled' | 'live' | 'finished'
      invitation_status: 'pending' | 'accepted' | 'declined'
    }
  }
}
