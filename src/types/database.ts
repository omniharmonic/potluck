export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AccessLevel = "invite_only" | "link_shared" | "public";
export type PotluckStatus = "draft" | "active" | "completed" | "archived";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          total_points: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
          total_points?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          total_points?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      potlucks: {
        Row: {
          id: string;
          host_id: string;
          title: string;
          description: string;
          event_date: string;
          location: string;
          access_level: AccessLevel;
          open_offers: boolean;
          points_enabled: boolean;
          banner_url: string | null;
          slug: string;
          status: PotluckStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          host_id: string;
          title: string;
          description: string;
          event_date: string;
          location: string;
          access_level?: AccessLevel;
          open_offers?: boolean;
          points_enabled?: boolean;
          banner_url?: string | null;
          slug: string;
          status?: PotluckStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          host_id?: string;
          title?: string;
          description?: string;
          event_date?: string;
          location?: string;
          access_level?: AccessLevel;
          open_offers?: boolean;
          points_enabled?: boolean;
          banner_url?: string | null;
          slug?: string;
          status?: PotluckStatus;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "potlucks_host_id_fkey";
            columns: ["host_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      needs: {
        Row: {
          id: string;
          potluck_id: string;
          emoji: string;
          name: string;
          quantity: number;
          claimed_quantity: number;
          point_value: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          potluck_id: string;
          emoji: string;
          name: string;
          quantity?: number;
          claimed_quantity?: number;
          point_value?: number | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          potluck_id?: string;
          emoji?: string;
          name?: string;
          quantity?: number;
          claimed_quantity?: number;
          point_value?: number | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "needs_potluck_id_fkey";
            columns: ["potluck_id"];
            isOneToOne: false;
            referencedRelation: "potlucks";
            referencedColumns: ["id"];
          },
        ];
      };
      claims: {
        Row: {
          id: string;
          need_id: string;
          potluck_id: string;
          profile_id: string | null;
          guest_name: string | null;
          guest_email: string | null;
          quantity: number;
          verified: boolean;
          points_awarded: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          need_id: string;
          potluck_id: string;
          profile_id?: string | null;
          guest_name?: string | null;
          guest_email?: string | null;
          quantity?: number;
          verified?: boolean;
          points_awarded?: number;
          created_at?: string;
        };
        Update: {
          need_id?: string;
          potluck_id?: string;
          profile_id?: string | null;
          guest_name?: string | null;
          guest_email?: string | null;
          quantity?: number;
          verified?: boolean;
          points_awarded?: number;
        };
        Relationships: [
          {
            foreignKeyName: "claims_need_id_fkey";
            columns: ["need_id"];
            isOneToOne: false;
            referencedRelation: "needs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_potluck_id_fkey";
            columns: ["potluck_id"];
            isOneToOne: false;
            referencedRelation: "potlucks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      offers: {
        Row: {
          id: string;
          potluck_id: string;
          profile_id: string | null;
          guest_name: string | null;
          emoji: string;
          name: string;
          description: string | null;
          verified: boolean;
          points_awarded: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          potluck_id: string;
          profile_id?: string | null;
          guest_name?: string | null;
          emoji: string;
          name: string;
          description?: string | null;
          verified?: boolean;
          points_awarded?: number;
          created_at?: string;
        };
        Update: {
          potluck_id?: string;
          profile_id?: string | null;
          guest_name?: string | null;
          emoji?: string;
          name?: string;
          description?: string | null;
          verified?: boolean;
          points_awarded?: number;
        };
        Relationships: [
          {
            foreignKeyName: "offers_potluck_id_fkey";
            columns: ["potluck_id"];
            isOneToOne: false;
            referencedRelation: "potlucks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offers_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          id: string;
          potluck_id: string;
          email: string;
          code: string;
          accepted: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          potluck_id: string;
          email: string;
          code: string;
          accepted?: boolean;
          created_at?: string;
        };
        Update: {
          potluck_id?: string;
          email?: string;
          code?: string;
          accepted?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "invites_potluck_id_fkey";
            columns: ["potluck_id"];
            isOneToOne: false;
            referencedRelation: "potlucks";
            referencedColumns: ["id"];
          },
        ];
      };
      cohosts: {
        Row: {
          id: string;
          potluck_id: string;
          profile_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          potluck_id: string;
          profile_id: string;
          created_at?: string;
        };
        Update: {
          potluck_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cohosts_potluck_id_fkey";
            columns: ["potluck_id"];
            isOneToOne: false;
            referencedRelation: "potlucks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cohosts_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cohost_invites: {
        Row: {
          id: string;
          potluck_id: string;
          email: string;
          code: string;
          accepted: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          potluck_id: string;
          email: string;
          code: string;
          accepted?: boolean;
          created_at?: string;
        };
        Update: {
          potluck_id?: string;
          email?: string;
          code?: string;
          accepted?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "cohost_invites_potluck_id_fkey";
            columns: ["potluck_id"];
            isOneToOne: false;
            referencedRelation: "potlucks";
            referencedColumns: ["id"];
          },
        ];
      };
      rsvps: {
        Row: {
          id: string;
          potluck_id: string;
          profile_id: string | null;
          guest_name: string | null;
          guest_email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          potluck_id: string;
          profile_id?: string | null;
          guest_name?: string | null;
          guest_email?: string | null;
          created_at?: string;
        };
        Update: {
          potluck_id?: string;
          profile_id?: string | null;
          guest_name?: string | null;
          guest_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rsvps_potluck_id_fkey";
            columns: ["potluck_id"];
            isOneToOne: false;
            referencedRelation: "potlucks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rsvps_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {};
    Functions: {
      increment_points: {
        Args: { user_id: string; amount: number };
        Returns: undefined;
      };
      is_host_or_cohost: {
        Args: { p_potluck_id: string; p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      access_level: AccessLevel;
      potluck_status: PotluckStatus;
    };
    CompositeTypes: {};
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Profile = Tables<"profiles">;
export type Potluck = Tables<"potlucks">;
export type Need = Tables<"needs">;
export type Claim = Tables<"claims">;
export type Offer = Tables<"offers">;
export type Invite = Tables<"invites">;
export type Rsvp = Tables<"rsvps">;
export type Cohost = Tables<"cohosts">;
export type CohostInvite = Tables<"cohost_invites">;
export type CohostWithProfile = Cohost & {
  profile: Pick<Profile, "id" | "display_name" | "avatar_url">;
};

export type ClaimWithProfile = Claim & {
  profile?: Pick<Profile, "display_name" | "avatar_url"> | null;
};
export type NeedWithClaims = Need & { claims: ClaimWithProfile[] };
export type RsvpWithProfile = Rsvp & {
  profile?: Pick<Profile, "display_name" | "avatar_url"> | null;
};
export type OfferWithProfile = Offer & {
  profile?: Pick<Profile, "display_name" | "avatar_url"> | null;
};
export type PotluckWithDetails = Potluck & {
  needs: NeedWithClaims[];
  offers: Offer[];
  host: Profile;
};
