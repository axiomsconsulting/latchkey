export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      analytics_identities: {
        Row: {
          created_at: string
          kind: string
          profile_id: string
          value_hash: string
        }
        Insert: {
          created_at?: string
          kind: string
          profile_id: string
          value_hash: string
        }
        Update: {
          created_at?: string
          kind?: string
          profile_id?: string
          value_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_identities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "analytics_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_profiles: {
        Row: {
          email: string | null
          first_seen: string
          host_id: string | null
          id: string
          known_at: string | null
          last_seen: string
          user_id: string | null
        }
        Insert: {
          email?: string | null
          first_seen?: string
          host_id?: string | null
          id?: string
          known_at?: string | null
          last_seen?: string
          user_id?: string | null
        }
        Update: {
          email?: string | null
          first_seen?: string
          host_id?: string | null
          id?: string
          known_at?: string | null
          last_seen?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_profiles_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_views: {
        Row: {
          at: string
          duration_ms: number
          id: string
          path: string
          title: string | null
          visit_id: string
          visitor_id: string
        }
        Insert: {
          at?: string
          duration_ms?: number
          id: string
          path: string
          title?: string | null
          visit_id: string
          visitor_id: string
        }
        Update: {
          at?: string
          duration_ms?: number
          id?: string
          path?: string
          title?: string | null
          visit_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_views_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "analytics_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_views_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "analytics_visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_visitors: {
        Row: {
          bot_reason: string | null
          browser: string | null
          device: string | null
          first_path: string | null
          first_referrer: string | null
          first_seen: string
          id: string
          is_bot: boolean
          language: string | null
          last_seen: string
          os: string | null
          profile_id: string | null
          timezone: string | null
          user_agent: string | null
        }
        Insert: {
          bot_reason?: string | null
          browser?: string | null
          device?: string | null
          first_path?: string | null
          first_referrer?: string | null
          first_seen?: string
          id: string
          is_bot?: boolean
          language?: string | null
          last_seen?: string
          os?: string | null
          profile_id?: string | null
          timezone?: string | null
          user_agent?: string | null
        }
        Update: {
          bot_reason?: string | null
          browser?: string | null
          device?: string | null
          first_path?: string | null
          first_referrer?: string | null
          first_seen?: string
          id?: string
          is_bot?: boolean
          language?: string | null
          last_seen?: string
          os?: string | null
          profile_id?: string | null
          timezone?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_visitors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "analytics_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_visits: {
        Row: {
          city: string | null
          country: string | null
          duration_ms: number
          entry_path: string | null
          exit_path: string | null
          id: string
          ip: string | null
          is_bot: boolean
          last_at: string
          pages: number
          referrer: string | null
          region: string | null
          started_at: string
          utm_source: string | null
          visitor_id: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          duration_ms?: number
          entry_path?: string | null
          exit_path?: string | null
          id?: string
          ip?: string | null
          is_bot?: boolean
          last_at?: string
          pages?: number
          referrer?: string | null
          region?: string | null
          started_at?: string
          utm_source?: string | null
          visitor_id: string
        }
        Update: {
          city?: string | null
          country?: string | null
          duration_ms?: number
          entry_path?: string | null
          exit_path?: string | null
          id?: string
          ip?: string | null
          is_bot?: boolean
          last_at?: string
          pages?: number
          referrer?: string | null
          region?: string | null
          started_at?: string
          utm_source?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_visits_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "analytics_visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          active: boolean
          body: string
          created_at: string
          expires_at: string | null
          host_id: string | null
          id: string
          title: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          expires_at?: string | null
          host_id?: string | null
          id?: string
          title: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          expires_at?: string | null
          host_id?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          host_id: string
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          host_id: string
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          host_id?: string
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          at: string
          changed: Json | null
          host_id: string | null
          id: number
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          at?: string
          changed?: Json | null
          host_id?: string | null
          id?: number
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          at?: string
          changed?: Json | null
          host_id?: string | null
          id?: number
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          anonymised_at: string | null
          archived_at: string | null
          arrived_adults: number | null
          arrived_children: number | null
          booking_url: string | null
          channel: Database["public"]["Enums"]["booking_channel"]
          check_in_date: string
          check_in_time: string | null
          check_out_date: string
          check_out_time: string | null
          checked_in_at: string | null
          connection_id: string | null
          created_at: string
          external_uid: string | null
          feed_status: string | null
          guest_count: number
          guest_email: string | null
          guest_full_name: string | null
          guest_surname_initial: string | null
          id: string
          id_check_status: string | null
          is_demo: boolean
          last_synced_at: string | null
          listing_id: string | null
          listing_title: string | null
          manual_fields: string[]
          mirror_of: string | null
          notes: string | null
          phone_last4: string | null
          property_id: string
          reservation_code: string | null
          room_id: string | null
          site_key: string | null
          source: Database["public"]["Enums"]["booking_source"]
          status: Database["public"]["Enums"]["booking_status"]
          stay_amount_includes_tax: boolean | null
          stay_amount_pence: number | null
          updated_at: string
        }
        Insert: {
          anonymised_at?: string | null
          archived_at?: string | null
          arrived_adults?: number | null
          arrived_children?: number | null
          booking_url?: string | null
          channel?: Database["public"]["Enums"]["booking_channel"]
          check_in_date: string
          check_in_time?: string | null
          check_out_date: string
          check_out_time?: string | null
          checked_in_at?: string | null
          connection_id?: string | null
          created_at?: string
          external_uid?: string | null
          feed_status?: string | null
          guest_count?: number
          guest_email?: string | null
          guest_full_name?: string | null
          guest_surname_initial?: string | null
          id?: string
          id_check_status?: string | null
          is_demo?: boolean
          last_synced_at?: string | null
          listing_id?: string | null
          listing_title?: string | null
          manual_fields?: string[]
          mirror_of?: string | null
          notes?: string | null
          phone_last4?: string | null
          property_id: string
          reservation_code?: string | null
          room_id?: string | null
          site_key?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          stay_amount_includes_tax?: boolean | null
          stay_amount_pence?: number | null
          updated_at?: string
        }
        Update: {
          anonymised_at?: string | null
          archived_at?: string | null
          arrived_adults?: number | null
          arrived_children?: number | null
          booking_url?: string | null
          channel?: Database["public"]["Enums"]["booking_channel"]
          check_in_date?: string
          check_in_time?: string | null
          check_out_date?: string
          check_out_time?: string | null
          checked_in_at?: string | null
          connection_id?: string | null
          created_at?: string
          external_uid?: string | null
          feed_status?: string | null
          guest_count?: number
          guest_email?: string | null
          guest_full_name?: string | null
          guest_surname_initial?: string | null
          id?: string
          id_check_status?: string | null
          is_demo?: boolean
          last_synced_at?: string | null
          listing_id?: string | null
          listing_title?: string | null
          manual_fields?: string[]
          mirror_of?: string | null
          notes?: string | null
          phone_last4?: string | null
          property_id?: string
          reservation_code?: string | null
          room_id?: string | null
          site_key?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          stay_amount_includes_tax?: boolean | null
          stay_amount_pence?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "room_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_mirror_of_fkey"
            columns: ["mirror_of"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_mirror_of_fkey"
            columns: ["mirror_of"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_connections: {
        Row: {
          channel: Database["public"]["Enums"]["booking_channel"]
          created_at: string
          id: string
          is_active: boolean
          is_demo: boolean
          last_error: string | null
          last_synced_at: string | null
          listing_name: string | null
          masked_url: string | null
          property_id: string
          room_id: string | null
          site_key: string | null
          sync_started_at: string | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          url_fingerprint: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["booking_channel"]
          created_at?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_error?: string | null
          last_synced_at?: string | null
          listing_name?: string | null
          masked_url?: string | null
          property_id: string
          room_id?: string | null
          site_key?: string | null
          sync_started_at?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          url_fingerprint?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["booking_channel"]
          created_at?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_error?: string | null
          last_synced_at?: string | null
          listing_name?: string | null
          masked_url?: string | null
          property_id?: string
          room_id?: string | null
          site_key?: string | null
          sync_started_at?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          url_fingerprint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_connections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      check_in_attempts: {
        Row: {
          booking_id: string | null
          code_last4: string | null
          created_at: string
          device_hash: string | null
          id: string
          ip_hash: string | null
          property_id: string
          succeeded: boolean
          surname_attempt: string | null
        }
        Insert: {
          booking_id?: string | null
          code_last4?: string | null
          created_at?: string
          device_hash?: string | null
          id?: string
          ip_hash?: string | null
          property_id: string
          succeeded?: boolean
          surname_attempt?: string | null
        }
        Update: {
          booking_id?: string | null
          code_last4?: string | null
          created_at?: string
          device_hash?: string | null
          id?: string
          ip_hash?: string | null
          property_id?: string
          succeeded?: boolean
          surname_attempt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_in_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "check_in_attempts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_sessions: {
        Row: {
          adults: number | null
          booking_id: string
          children: number | null
          companion_attempts: number
          completed_at: string | null
          confirmed: boolean
          created_at: string
          expires_at: string
          id: string
          last4_attempts: number
          photo_attempts: number
          property_id: string
          token_hash: string
          verified_method: string | null
        }
        Insert: {
          adults?: number | null
          booking_id: string
          children?: number | null
          companion_attempts?: number
          completed_at?: string | null
          confirmed?: boolean
          created_at?: string
          expires_at: string
          id?: string
          last4_attempts?: number
          photo_attempts?: number
          property_id: string
          token_hash: string
          verified_method?: string | null
        }
        Update: {
          adults?: number | null
          booking_id?: string
          children?: number | null
          companion_attempts?: number
          completed_at?: string | null
          confirmed?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          last4_attempts?: number
          photo_attempts?: number
          property_id?: string
          token_hash?: string
          verified_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkin_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "checkin_sessions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_secrets: {
        Row: {
          connection_id: string
          created_at: string
          ical_url: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          ical_url: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          ical_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      extras_catalogue: {
        Row: {
          active: boolean
          auto_approve: boolean
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          id: string
          is_demo: boolean
          is_free: boolean
          is_loan: boolean
          item_key: string | null
          max_qty: number
          name: string
          options: Json
          price_pence: number
          property_id: string
          requires_approval: boolean
          sort_order: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_synced_at: string | null
          unit: string
        }
        Insert: {
          active?: boolean
          auto_approve?: boolean
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_demo?: boolean
          is_free?: boolean
          is_loan?: boolean
          item_key?: string | null
          max_qty?: number
          name: string
          options?: Json
          price_pence?: number
          property_id: string
          requires_approval?: boolean
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_synced_at?: string | null
          unit?: string
        }
        Update: {
          active?: boolean
          auto_approve?: boolean
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_demo?: boolean
          is_free?: boolean
          is_loan?: boolean
          item_key?: string | null
          max_qty?: number
          name?: string
          options?: Json
          price_pence?: number
          property_id?: string
          requires_approval?: boolean
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_synced_at?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "extras_catalogue_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          booking_id: string | null
          created_at: string
          host_id: string | null
          id: string
          kind: string
          message: string | null
          page: string | null
          property_id: string | null
          rating: number | null
          status: string
          user_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          host_id?: string | null
          id?: string
          kind: string
          message?: string | null
          page?: string | null
          property_id?: string | null
          rating?: number | null
          status?: string
          user_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          host_id?: string | null
          id?: string
          kind?: string
          message?: string | null
          page?: string | null
          property_id?: string | null
          rating?: number | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "feedback_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_ids: {
        Row: {
          age: number | null
          booking_id: string
          created_at: string
          date_of_birth: string | null
          delete_after: string
          document_expiry: string | null
          document_last4: string | null
          document_type: string | null
          face_photo_path: string | null
          full_name: string | null
          id: string
          id_checked: boolean
          id_photo_path: string | null
          issuing_country: string | null
          kind: string
          name_match: string | null
          position: number
          property_id: string
          skipped: boolean
        }
        Insert: {
          age?: number | null
          booking_id: string
          created_at?: string
          date_of_birth?: string | null
          delete_after: string
          document_expiry?: string | null
          document_last4?: string | null
          document_type?: string | null
          face_photo_path?: string | null
          full_name?: string | null
          id?: string
          id_checked?: boolean
          id_photo_path?: string | null
          issuing_country?: string | null
          kind: string
          name_match?: string | null
          position: number
          property_id: string
          skipped?: boolean
        }
        Update: {
          age?: number | null
          booking_id?: string
          created_at?: string
          date_of_birth?: string | null
          delete_after?: string
          document_expiry?: string | null
          document_last4?: string | null
          document_type?: string | null
          face_photo_path?: string | null
          full_name?: string | null
          id?: string
          id_checked?: boolean
          id_photo_path?: string | null
          issuing_country?: string | null
          kind?: string
          name_match?: string | null
          position?: number
          property_id?: string
          skipped?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "guest_ids_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_ids_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "guest_ids_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_register: {
        Row: {
          arrival_date: string
          booking_id: string | null
          created_at: string
          document_number: string | null
          full_name: string
          host_id: string
          id: string
          is_alien: boolean
          is_demo: boolean
          keep_until: string
          nationality: string
          next_address: string | null
          next_destination: string | null
          place_of_issue: string | null
          position: number | null
          property_id: string | null
          property_name: string
          room_name: string | null
          source: string
          updated_at: string
        }
        Insert: {
          arrival_date: string
          booking_id?: string | null
          created_at?: string
          document_number?: string | null
          full_name: string
          host_id: string
          id?: string
          is_alien: boolean
          is_demo?: boolean
          keep_until: string
          nationality: string
          next_address?: string | null
          next_destination?: string | null
          place_of_issue?: string | null
          position?: number | null
          property_id?: string | null
          property_name: string
          room_name?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          arrival_date?: string
          booking_id?: string | null
          created_at?: string
          document_number?: string | null
          full_name?: string
          host_id?: string
          id?: string
          is_alien?: boolean
          is_demo?: boolean
          keep_until?: string
          nationality?: string
          next_address?: string | null
          next_destination?: string | null
          place_of_issue?: string | null
          position?: number | null
          property_id?: string | null
          property_name?: string
          room_name?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_register_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_register_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "guest_register_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_register_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_steps: {
        Row: {
          body: string | null
          created_at: string
          guide_id: string
          heading: string
          id: string
          image_url: string | null
          sort_order: number
        }
        Insert: {
          body?: string | null
          created_at?: string
          guide_id: string
          heading: string
          id?: string
          image_url?: string | null
          sort_order?: number
        }
        Update: {
          body?: string | null
          created_at?: string
          guide_id?: string
          heading?: string
          id?: string
          image_url?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "guide_steps_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          is_starter: boolean
          pinned: boolean
          property_id: string
          published: boolean
          room_id: string | null
          section_key: string | null
          sort_order: number
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          is_starter?: boolean
          pinned?: boolean
          property_id: string
          published?: boolean
          room_id?: string | null
          section_key?: string | null
          sort_order?: number
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          is_starter?: boolean
          pinned?: boolean
          property_id?: string
          published?: boolean
          room_id?: string | null
          section_key?: string | null
          sort_order?: number
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guides_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guides_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      host_alerts: {
        Row: {
          booking_id: string | null
          created_at: string
          emailed_at: string | null
          host_id: string
          id: string
          kind: string
          message: string
          property_id: string | null
          read_at: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          emailed_at?: string | null
          host_id: string
          id?: string
          kind: string
          message: string
          property_id?: string | null
          read_at?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          emailed_at?: string | null
          host_id?: string
          id?: string
          kind?: string
          message?: string
          property_id?: string | null
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "host_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "host_alerts_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_alerts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      host_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          host_id: string
          id: string
          invited_by: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["host_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          host_id: string
          id?: string
          invited_by: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["host_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          host_id?: string
          id?: string
          invited_by?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["host_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_invitations_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      host_members: {
        Row: {
          created_at: string
          host_id: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["host_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["host_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["host_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_members_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      hosts: {
        Row: {
          api_addon: boolean
          bank_details: string | null
          booking_sites: Json
          business_name: string
          canceled_at: string | null
          channel_labels: Json
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          current_period_end: string | null
          id: string
          integration_modes: Json
          invoice_counter: number
          invoice_prefix: string
          invoices_enabled: boolean
          offer_label: string | null
          offer_pence: number | null
          offer_used_at: string | null
          out_until: string | null
          plan_key: string
          prices_include_tax: boolean
          stripe_account_checked_at: string | null
          stripe_account_id: string | null
          stripe_account_label: string | null
          stripe_account_ready: boolean
          stripe_checked_at: string | null
          stripe_customer_id: string | null
          stripe_mode: string
          stripe_subscription_id: string | null
          subscription_status: string
          support_access_until: string | null
          tax_label: string
          tax_number: string | null
          tax_rate_bp: number
          tax_registered: boolean
          timezone: string
          trial_ends_at: string | null
          trial_started_at: string
          uses_platform_stripe: boolean
        }
        Insert: {
          api_addon?: boolean
          bank_details?: string | null
          booking_sites?: Json
          business_name: string
          canceled_at?: string | null
          channel_labels?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string | null
          id?: string
          integration_modes?: Json
          invoice_counter?: number
          invoice_prefix?: string
          invoices_enabled?: boolean
          offer_label?: string | null
          offer_pence?: number | null
          offer_used_at?: string | null
          out_until?: string | null
          plan_key?: string
          prices_include_tax?: boolean
          stripe_account_checked_at?: string | null
          stripe_account_id?: string | null
          stripe_account_label?: string | null
          stripe_account_ready?: boolean
          stripe_checked_at?: string | null
          stripe_customer_id?: string | null
          stripe_mode?: string
          stripe_subscription_id?: string | null
          subscription_status?: string
          support_access_until?: string | null
          tax_label?: string
          tax_number?: string | null
          tax_rate_bp?: number
          tax_registered?: boolean
          timezone?: string
          trial_ends_at?: string | null
          trial_started_at?: string
          uses_platform_stripe?: boolean
        }
        Update: {
          api_addon?: boolean
          bank_details?: string | null
          booking_sites?: Json
          business_name?: string
          canceled_at?: string | null
          channel_labels?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string | null
          id?: string
          integration_modes?: Json
          invoice_counter?: number
          invoice_prefix?: string
          invoices_enabled?: boolean
          offer_label?: string | null
          offer_pence?: number | null
          offer_used_at?: string | null
          out_until?: string | null
          plan_key?: string
          prices_include_tax?: boolean
          stripe_account_checked_at?: string | null
          stripe_account_id?: string | null
          stripe_account_label?: string | null
          stripe_account_ready?: boolean
          stripe_checked_at?: string | null
          stripe_customer_id?: string | null
          stripe_mode?: string
          stripe_subscription_id?: string | null
          subscription_status?: string
          support_access_until?: string | null
          tax_label?: string
          tax_number?: string | null
          tax_rate_bp?: number
          tax_registered?: boolean
          timezone?: string
          trial_ends_at?: string | null
          trial_started_at?: string
          uses_platform_stripe?: boolean
        }
        Relationships: []
      }
      invoices: {
        Row: {
          access_token: string
          amended_at: string | null
          booking_id: string | null
          buyer_address: string | null
          buyer_email: string | null
          buyer_name: string
          check_in_date: string | null
          check_out_date: string | null
          created_at: string
          created_by: string
          currency: string
          description: string
          guest_locked_at: string | null
          host_id: string
          id: string
          issued_on: string
          lines: Json | null
          net_pence: number
          number: string
          property_id: string | null
          seller_address: string | null
          seller_name: string
          seller_room: string | null
          seller_tax_label: string | null
          seller_tax_number: string | null
          tax_name: string | null
          tax_pence: number
          tax_rate_bp: number
          title: string
          total_pence: number
          updated_at: string
        }
        Insert: {
          access_token: string
          amended_at?: string | null
          booking_id?: string | null
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_name: string
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string
          created_by: string
          currency: string
          description: string
          guest_locked_at?: string | null
          host_id: string
          id?: string
          issued_on: string
          lines?: Json | null
          net_pence: number
          number: string
          property_id?: string | null
          seller_address?: string | null
          seller_name: string
          seller_room?: string | null
          seller_tax_label?: string | null
          seller_tax_number?: string | null
          tax_name?: string | null
          tax_pence: number
          tax_rate_bp?: number
          title?: string
          total_pence: number
          updated_at?: string
        }
        Update: {
          access_token?: string
          amended_at?: string | null
          booking_id?: string | null
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_name?: string
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          description?: string
          guest_locked_at?: string | null
          host_id?: string
          id?: string
          issued_on?: string
          lines?: Json | null
          net_pence?: number
          number?: string
          property_id?: string | null
          seller_address?: string | null
          seller_name?: string
          seller_room?: string | null
          seller_tax_label?: string | null
          seller_tax_number?: string | null
          tax_name?: string | null
          tax_pence?: number
          tax_rate_bp?: number
          title?: string
          total_pence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "invoices_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      job_settings: {
        Row: {
          enabled: boolean
          every_minutes: number | null
          key: string
          last_duration_ms: number | null
          last_run_at: string | null
          last_status: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          every_minutes?: number | null
          key: string
          last_duration_ms?: number | null
          last_run_at?: string | null
          last_status?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          every_minutes?: number | null
          key?: string
          last_duration_ms?: number | null
          last_run_at?: string | null
          last_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string | null
          booking_id: string
          channel: string
          created_at: string
          direction: string
          id: string
          job_id: string | null
          read_by_guest_at: string | null
          read_by_host_at: string | null
          sent_at: string | null
        }
        Insert: {
          body?: string | null
          booking_id: string
          channel?: string
          created_at?: string
          direction?: string
          id?: string
          job_id?: string | null
          read_by_guest_at?: string | null
          read_by_host_at?: string | null
          sent_at?: string | null
        }
        Update: {
          body?: string | null
          booking_id?: string
          channel?: string
          created_at?: string
          direction?: string
          id?: string
          job_id?: string | null
          read_by_guest_at?: string | null
          read_by_host_at?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "service_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_pence: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          provider: string
          provider_ref: string | null
          request_id: string | null
          status: string
        }
        Insert: {
          amount_pence?: number
          booking_id: string
          created_at?: string
          currency?: string
          id?: string
          provider?: string
          provider_ref?: string | null
          request_id?: string | null
          status?: string
        }
        Update: {
          amount_pence?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          provider?: string
          provider_ref?: string | null
          request_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_pricing: {
        Row: {
          base_pence: number
          currency: string
          extra_property_pence: number
          extra_room_pence: number
          id: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          base_pence?: number
          currency?: string
          extra_property_pence?: number
          extra_room_pence?: number
          id?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          base_pence?: number
          currency?: string
          extra_property_pence?: number
          extra_room_pence?: number
          id?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      presence_log: {
        Row: {
          at: string
          booking_id: string
          event: Database["public"]["Enums"]["presence_event"]
          id: string
          source: string
        }
        Insert: {
          at?: string
          booking_id: string
          event: Database["public"]["Enums"]["presence_event"]
          id?: string
          source?: string
        }
        Update: {
          at?: string
          booking_id?: string
          event?: Database["public"]["Enums"]["presence_event"]
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      properties: {
        Row: {
          active: boolean
          address: string | null
          check_in_pin: string | null
          checkin_methods: Json
          country_code: string
          created_at: string
          default_check_in_time: string
          default_check_out_time: string
          guest_records: Json
          host_contact_name: string | null
          host_contact_phone: string | null
          host_id: string
          id: string
          is_demo: boolean
          name: string
          parking_notes: string | null
          postcode: string | null
          quiet_hours_end: string
          quiet_hours_start: string
          short_code: string
          theme_config: Json
          timezone: string | null
          trades_ai_at: string | null
          wifi_name: string | null
          wifi_password: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          check_in_pin?: string | null
          checkin_methods?: Json
          country_code?: string
          created_at?: string
          default_check_in_time?: string
          default_check_out_time?: string
          guest_records?: Json
          host_contact_name?: string | null
          host_contact_phone?: string | null
          host_id: string
          id?: string
          is_demo?: boolean
          name: string
          parking_notes?: string | null
          postcode?: string | null
          quiet_hours_end?: string
          quiet_hours_start?: string
          short_code: string
          theme_config?: Json
          timezone?: string | null
          trades_ai_at?: string | null
          wifi_name?: string | null
          wifi_password?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          check_in_pin?: string | null
          checkin_methods?: Json
          country_code?: string
          created_at?: string
          default_check_in_time?: string
          default_check_out_time?: string
          guest_records?: Json
          host_contact_name?: string | null
          host_contact_phone?: string | null
          host_id?: string
          id?: string
          is_demo?: boolean
          name?: string
          parking_notes?: string | null
          postcode?: string | null
          quiet_hours_end?: string
          quiet_hours_start?: string
          short_code?: string
          theme_config?: Json
          timezone?: string | null
          trades_ai_at?: string | null
          wifi_name?: string | null
          wifi_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          booking_id: string
          created_at: string
          early_from: string | null
          extra_id: string | null
          host_note: string | null
          id: string
          items: Json
          kind: string
          late_until: string | null
          message: string | null
          paid_at: string | null
          pay_by: string | null
          payment_method: string | null
          receipt_emailed_at: string | null
          receipt_number: string | null
          resolved_at: string | null
          status: string
          stripe_account_id: string | null
          stripe_payment_intent: string | null
          stripe_session_id: string | null
          suggested_window: string | null
          suggestion_expires_at: string | null
          time_window: string | null
          total_pence: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          early_from?: string | null
          extra_id?: string | null
          host_note?: string | null
          id?: string
          items?: Json
          kind?: string
          late_until?: string | null
          message?: string | null
          paid_at?: string | null
          pay_by?: string | null
          payment_method?: string | null
          receipt_emailed_at?: string | null
          receipt_number?: string | null
          resolved_at?: string | null
          status?: string
          stripe_account_id?: string | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          suggested_window?: string | null
          suggestion_expires_at?: string | null
          time_window?: string | null
          total_pence?: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          early_from?: string | null
          extra_id?: string | null
          host_note?: string | null
          id?: string
          items?: Json
          kind?: string
          late_until?: string | null
          message?: string | null
          paid_at?: string | null
          pay_by?: string | null
          payment_method?: string | null
          receipt_emailed_at?: string | null
          receipt_number?: string | null
          resolved_at?: string | null
          status?: string
          stripe_account_id?: string | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          suggested_window?: string | null
          suggestion_expires_at?: string | null
          time_window?: string | null
          total_pence?: number
        }
        Relationships: [
          {
            foreignKeyName: "requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "requests_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "extras_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      room_listings: {
        Row: {
          channel: Database["public"]["Enums"]["booking_channel"]
          connection_id: string | null
          created_at: string
          external_listing_id: string | null
          external_listing_title: string | null
          id: string
          room_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["booking_channel"]
          connection_id?: string | null
          created_at?: string
          external_listing_id?: string | null
          external_listing_title?: string | null
          id?: string
          room_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["booking_channel"]
          connection_id?: string | null
          created_at?: string
          external_listing_id?: string | null
          external_listing_title?: string | null
          id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_listings_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_listings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          active: boolean
          amenities: Json
          children_allowed: boolean
          created_at: string
          description: string | null
          display_name: string
          export_feed_enabled: boolean
          feed_token: string | null
          guide_mode: string
          has_ensuite: boolean
          id: string
          is_demo: boolean
          max_guests: number
          photo_url: string | null
          property_id: string
          public_title: string | null
          room_number: string | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          amenities?: Json
          children_allowed?: boolean
          created_at?: string
          description?: string | null
          display_name: string
          export_feed_enabled?: boolean
          feed_token?: string | null
          guide_mode?: string
          has_ensuite?: boolean
          id?: string
          is_demo?: boolean
          max_guests?: number
          photo_url?: string | null
          property_id: string
          public_title?: string | null
          room_number?: string | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          amenities?: Json
          children_allowed?: boolean
          created_at?: string
          description?: string | null
          display_name?: string
          export_feed_enabled?: boolean
          feed_token?: string | null
          guide_mode?: string
          has_ensuite?: boolean
          id?: string
          is_demo?: boolean
          max_guests?: number
          photo_url?: string | null
          property_id?: string
          public_title?: string | null
          room_number?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      service_jobs: {
        Row: {
          acknowledged_at: string | null
          archived_at: string | null
          booking_id: string | null
          category: string
          completed_at: string | null
          created_at: string
          eta_at: string | null
          guest_price_pence: number | null
          host_id: string
          id: string
          is_demo: boolean
          note: string | null
          property_id: string
          provider: Json | null
          provider_mode: string | null
          provider_ref: string | null
          quoted_pence: number | null
          room_id: string | null
          scheduled_at: string | null
          source: string
          status: string
          title: string
          updated_at: string
          urgency: string
        }
        Insert: {
          acknowledged_at?: string | null
          archived_at?: string | null
          booking_id?: string | null
          category: string
          completed_at?: string | null
          created_at?: string
          eta_at?: string | null
          guest_price_pence?: number | null
          host_id: string
          id?: string
          is_demo?: boolean
          note?: string | null
          property_id: string
          provider?: Json | null
          provider_mode?: string | null
          provider_ref?: string | null
          quoted_pence?: number | null
          room_id?: string | null
          scheduled_at?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
          urgency?: string
        }
        Update: {
          acknowledged_at?: string | null
          archived_at?: string | null
          booking_id?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          eta_at?: string | null
          guest_price_pence?: number | null
          host_id?: string
          id?: string
          is_demo?: boolean
          note?: string | null
          property_id?: string
          provider?: Json | null
          provider_mode?: string | null
          provider_ref?: string | null
          quoted_pence?: number | null
          room_id?: string | null
          scheduled_at?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_jobs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_jobs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "service_jobs_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_jobs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          cost_model: Json | null
          id: number
          invoice_nightly_lines: boolean
          notice: string | null
          offer: Json | null
          pricing_model: Json | null
          projection: Json | null
          signups_open: boolean
          support_email: string | null
          updated_at: string
        }
        Insert: {
          cost_model?: Json | null
          id?: number
          invoice_nightly_lines?: boolean
          notice?: string | null
          offer?: Json | null
          pricing_model?: Json | null
          projection?: Json | null
          signups_open?: boolean
          support_email?: string | null
          updated_at?: string
        }
        Update: {
          cost_model?: Json | null
          id?: number
          invoice_nightly_lines?: boolean
          notice?: string | null
          offer?: Json | null
          pricing_model?: Json | null
          projection?: Json | null
          signups_open?: boolean
          support_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stay_tokens: {
        Row: {
          booking_id: string
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          valid_from: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          valid_from?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          valid_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stay_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stay_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      super_admins: {
        Row: {
          added_at: string
          added_by: string | null
          email: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          email: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          email?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          cancelled_count: number
          completed_at: string | null
          connection_id: string
          created_count: number
          error_message: string | null
          id: string
          skipped_count: number
          started_at: string
          status: Database["public"]["Enums"]["sync_status"]
          updated_count: number
          warnings: string[]
        }
        Insert: {
          cancelled_count?: number
          completed_at?: string | null
          connection_id: string
          created_count?: number
          error_message?: string | null
          id?: string
          skipped_count?: number
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          updated_count?: number
          warnings?: string[]
        }
        Update: {
          cancelled_count?: number
          completed_at?: string | null
          connection_id?: string
          created_count?: number
          error_message?: string | null
          id?: string
          skipped_count?: number
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          updated_count?: number
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          area: string | null
          category: string
          company_name: string | null
          created_at: string
          email: string | null
          host_id: string
          id: string
          is_demo: boolean
          is_preferred: boolean
          name: string
          notes: string | null
          phone: string | null
          property_id: string | null
          rating: number | null
          sort_order: number
          source: string
          updated_at: string
          website: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          area?: string | null
          category?: string
          company_name?: string | null
          created_at?: string
          email?: string | null
          host_id: string
          id?: string
          is_demo?: boolean
          is_preferred?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          rating?: number | null
          sort_order?: number
          source?: string
          updated_at?: string
          website?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          area?: string | null
          category?: string
          company_name?: string | null
          created_at?: string
          email?: string | null
          host_id?: string
          id?: string
          is_demo?: boolean
          is_preferred?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          rating?: number | null
          sort_order?: number
          source?: string
          updated_at?: string
          website?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_flags: {
        Row: {
          created_at: string
          detail: string
          host_id: string
          id: string
          matched_host_id: string | null
          reason: string
          resolution: string | null
          resolved_at: string | null
        }
        Insert: {
          created_at?: string
          detail: string
          host_id: string
          id?: string
          matched_host_id?: string | null
          reason: string
          resolution?: string | null
          resolved_at?: string | null
        }
        Update: {
          created_at?: string
          detail?: string
          host_id?: string
          id?: string
          matched_host_id?: string | null
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_flags_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_flags_matched_host_id_fkey"
            columns: ["matched_host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      unavailability_windows: {
        Row: {
          created_at: string
          day_of_week: number | null
          end_time: string | null
          ends_at: string | null
          id: string
          is_demo: boolean
          property_id: string
          reason: string | null
          room_id: string | null
          start_time: string | null
          starts_at: string | null
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          end_time?: string | null
          ends_at?: string | null
          id?: string
          is_demo?: boolean
          property_id: string
          reason?: string | null
          room_id?: string | null
          start_time?: string | null
          starts_at?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          end_time?: string | null
          ends_at?: string | null
          id?: string
          is_demo?: boolean
          property_id?: string
          reason?: string | null
          room_id?: string | null
          start_time?: string | null
          starts_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unavailability_windows_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unavailability_windows_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_daily: {
        Row: {
          count: number
          day: string
          host_id: string | null
          metric: string
        }
        Insert: {
          count?: number
          day?: string
          host_id?: string | null
          metric: string
        }
        Update: {
          count?: number
          day?: string
          host_id?: string | null
          metric?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_daily_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_prefs: {
        Row: {
          last_host_id: string | null
          support_host_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          last_host_id?: string | null
          support_host_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          last_host_id?: string | null
          support_host_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_prefs_last_host_id_fkey"
            columns: ["last_host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_prefs_support_host_id_fkey"
            columns: ["support_host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_path: string | null
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_results: {
        Row: {
          booking_id: string
          created_at: string
          delete_after: string | null
          detail: string | null
          id: string
          method: string
          passed: boolean
        }
        Insert: {
          booking_id: string
          created_at?: string
          delete_after?: string | null
          detail?: string | null
          id?: string
          method?: string
          passed?: boolean
        }
        Update: {
          booking_id?: string
          created_at?: string
          delete_after?: string | null
          detail?: string | null
          id?: string
          method?: string
          passed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "verification_results_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_results_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cleaner_schedule"
            referencedColumns: ["booking_id"]
          },
        ]
      }
    }
    Views: {
      cleaner_schedule: {
        Row: {
          booking_id: string | null
          check_in_date: string | null
          check_in_time: string | null
          check_out_date: string | null
          check_out_time: string | null
          guest_count: number | null
          property_id: string | null
          room_id: string | null
          room_name: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_host_invitation: { Args: { _token: string }; Returns: string }
      address_key: {
        Args: { _address: string; _postcode: string }
        Returns: string
      }
      admin_host_stats: {
        Args: never
        Returns: {
          bookings_30d: number
          bookings_total: number
          business_name: string
          channels: Json
          checkins_30d: number
          created_at: string
          current_period_end: string
          host_id: string
          is_demo: boolean
          last_sign_in_at: string
          owner_email: string
          properties: number
          rooms_per_property: number[]
          subscription_status: string
          support_access_until: string
          trial_ends_at: string
        }[]
      }
      analytics_identify: {
        Args: {
          _email: string
          _email_hash: string
          _host_id: string
          _user_hash: string
          _user_id: string
          _visitor: string
        }
        Returns: string
      }
      analytics_leave: {
        Args: { _ms: number; _view: string; _visitor: string }
        Returns: undefined
      }
      audit_noise: { Args: { _key: string }; Returns: boolean }
      audit_redacted: { Args: { _key: string }; Returns: boolean }
      bump_usage: {
        Args: { _host_id: string; _metric: string; _n?: number }
        Returns: undefined
      }
      can_read_host: { Args: { _host_id: string }; Returns: boolean }
      can_read_private: { Args: { _host_id: string }; Returns: boolean }
      can_write_host: { Args: { _host_id: string }; Returns: boolean }
      claim_invoice_number: { Args: { _host_id: string }; Returns: number }
      create_host_workspace: {
        Args: { _business_name: string; _contact_email: string }
        Returns: string
      }
      current_offer: { Args: never; Returns: Json }
      delete_bookings: { Args: { _ids: string[] }; Returns: number }
      has_host_role: {
        Args: {
          _host_id: string
          _role: Database["public"]["Enums"]["host_role"]
        }
        Returns: boolean
      }
      has_pending_invite: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      host_has_access: { Args: { _host_id: string }; Returns: boolean }
      host_team: {
        Args: { _host_id: string }
        Returns: {
          avatar_path: string
          created_at: string
          display_name: string
          email: string
          last_sign_in_at: string
          role: string
          user_id: string
        }[]
      }
      host_writer: { Args: { _host_id: string }; Returns: boolean }
      invitation_hash: { Args: { _token: string }; Returns: string }
      is_host_member: { Args: { _host_id: string }; Returns: boolean }
      is_host_owner: { Args: { _host_id: string }; Returns: boolean }
      is_host_staff: { Args: { _host_id: string }; Returns: boolean }
      is_shared_demo_user: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      member_role: { Args: { _host_id: string }; Returns: string }
      peek_invitation: {
        Args: { _token: string }
        Returns: {
          business_name: string
          email_masked: string
          role: string
          status: string
        }[]
      }
      platform_trial_days: { Args: never; Returns: number }
      property_host_id: { Args: { _property_id: string }; Returns: string }
      row_host_id: { Args: { _table: string; r: Json }; Returns: string }
      support_can_write: { Args: { _host_id: string }; Returns: boolean }
      update_host_ops: {
        Args: { _channel_labels: Json; _host_id: string }
        Returns: undefined
      }
      update_host_sites: {
        Args: { _booking_sites: Json; _channel_labels: Json; _host_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      booking_channel:
        | "airbnb"
        | "booking_com"
        | "homestay"
        | "direct"
        | "other"
        | "vrbo"
        | "agoda"
      booking_source: "ical" | "manual" | "csv" | "api"
      booking_status:
        | "needs_details"
        | "upcoming"
        | "checked_in"
        | "checked_out"
        | "cancelled"
        | "flagged"
        | "blocked"
      host_role: "owner" | "co_host" | "cleaner" | "manager" | "viewer"
      presence_event: "arrived" | "left" | "returned" | "checked_out"
      sync_status: "never" | "ok" | "warning" | "error"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      booking_channel: [
        "airbnb",
        "booking_com",
        "homestay",
        "direct",
        "other",
        "vrbo",
        "agoda",
      ],
      booking_source: ["ical", "manual", "csv", "api"],
      booking_status: [
        "needs_details",
        "upcoming",
        "checked_in",
        "checked_out",
        "cancelled",
        "flagged",
        "blocked",
      ],
      host_role: ["owner", "co_host", "cleaner", "manager", "viewer"],
      presence_event: ["arrived", "left", "returned", "checked_out"],
      sync_status: ["never", "ok", "warning", "error"],
    },
  },
} as const
