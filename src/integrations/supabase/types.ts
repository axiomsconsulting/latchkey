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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          anonymised_at: string | null
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
          source: Database["public"]["Enums"]["booking_source"]
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          anonymised_at?: string | null
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
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          anonymised_at?: string | null
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
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
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
          booking_id: string
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
          booking_id: string
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
          booking_id?: string
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
          created_at: string
          currency: string
          description: string | null
          id: string
          is_demo: boolean
          name: string
          price_pence: number
          property_id: string
          requires_approval: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          name: string
          price_pence?: number
          property_id: string
          requires_approval?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          price_pence?: number
          property_id?: string
          requires_approval?: boolean
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
      host_members: {
        Row: {
          created_at: string
          host_id: string
          id: string
          role: Database["public"]["Enums"]["host_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          role?: Database["public"]["Enums"]["host_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          role?: Database["public"]["Enums"]["host_role"]
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
          business_name: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          id: string
          integration_modes: Json
          timezone: string
        }
        Insert: {
          business_name: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          id?: string
          integration_modes?: Json
          timezone?: string
        }
        Update: {
          business_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          id?: string
          integration_modes?: Json
          timezone?: string
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
          created_at: string
          default_check_in_time: string
          default_check_out_time: string
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
          wifi_name: string | null
          wifi_password: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          check_in_pin?: string | null
          checkin_methods?: Json
          created_at?: string
          default_check_in_time?: string
          default_check_out_time?: string
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
          wifi_name?: string | null
          wifi_password?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          check_in_pin?: string | null
          checkin_methods?: Json
          created_at?: string
          default_check_in_time?: string
          default_check_out_time?: string
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
          extra_id: string | null
          id: string
          kind: string
          message: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          extra_id?: string | null
          id?: string
          kind?: string
          message?: string | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          extra_id?: string | null
          id?: string
          kind?: string
          message?: string | null
          resolved_at?: string | null
          status?: string
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
          created_at: string
          description: string | null
          display_name: string
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
          created_at?: string
          description?: string | null
          display_name: string
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
          created_at?: string
          description?: string | null
          display_name?: string
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
      create_host_workspace: {
        Args: { _business_name: string; _contact_email: string }
        Returns: string
      }
      has_host_role: {
        Args: {
          _host_id: string
          _role: Database["public"]["Enums"]["host_role"]
        }
        Returns: boolean
      }
      is_host_member: { Args: { _host_id: string }; Returns: boolean }
      is_host_staff: { Args: { _host_id: string }; Returns: boolean }
      property_host_id: { Args: { _property_id: string }; Returns: string }
    }
    Enums: {
      booking_channel:
        | "airbnb"
        | "booking_com"
        | "homestay"
        | "direct"
        | "other"
      booking_source: "ical" | "manual" | "csv" | "api"
      booking_status:
        | "needs_details"
        | "upcoming"
        | "checked_in"
        | "checked_out"
        | "cancelled"
        | "flagged"
        | "blocked"
      host_role: "owner" | "co_host" | "cleaner"
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
      booking_channel: ["airbnb", "booking_com", "homestay", "direct", "other"],
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
      host_role: ["owner", "co_host", "cleaner"],
      presence_event: ["arrived", "left", "returned", "checked_out"],
      sync_status: ["never", "ok", "warning", "error"],
    },
  },
} as const
