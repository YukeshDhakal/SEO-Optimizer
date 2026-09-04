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
      api_keys: {
        Row: {
          created_at: string
          created_by: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          monthly_call_limit: number | null
          name: string
          organization_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          monthly_call_limit?: number | null
          name: string
          organization_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          monthly_call_limit?: number | null
          name?: string
          organization_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_credentials: {
        Row: {
          created_at: string
          id: string
          secret_ref: string
          site_connection_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          secret_ref: string
          site_connection_id: string
        }
        Update: {
          created_at?: string
          id?: string
          secret_ref?: string
          site_connection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_credentials_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: false
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      content_recommendations: {
        Row: {
          actioned_at: string | null
          created_at: string
          description: string
          dismissed_at: string | null
          id: string
          metrics: Json
          organization_id: string
          post_id: string | null
          priority: string
          recommendation_type: string
          site_connection_id: string
          status: string
          subject_key: string
          title: string
          updated_at: string
        }
        Insert: {
          actioned_at?: string | null
          created_at?: string
          description: string
          dismissed_at?: string | null
          id?: string
          metrics?: Json
          organization_id: string
          post_id?: string | null
          priority?: string
          recommendation_type: string
          site_connection_id: string
          status?: string
          subject_key: string
          title: string
          updated_at?: string
        }
        Update: {
          actioned_at?: string | null
          created_at?: string
          description?: string
          dismissed_at?: string | null
          id?: string
          metrics?: Json
          organization_id?: string
          post_id?: string | null
          priority?: string
          recommendation_type?: string
          site_connection_id?: string
          status?: string
          subject_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_recommendations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_recommendations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_recommendations_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: false
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      google_ads_credentials: {
        Row: {
          created_at: string
          error_message: string | null
          google_ads_customer_id: string | null
          id: string
          secret_ref: string | null
          site_connection_id: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          google_ads_customer_id?: string | null
          id?: string
          secret_ref?: string | null
          site_connection_id: string
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          google_ads_customer_id?: string | null
          id?: string
          secret_ref?: string | null
          site_connection_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_ads_credentials_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: true
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_research: {
        Row: {
          avg_monthly_searches: number | null
          competition: string | null
          competition_index: number | null
          id: string
          keyword: string
          site_connection_id: string
          synced_at: string
        }
        Insert: {
          avg_monthly_searches?: number | null
          competition?: string | null
          competition_index?: number | null
          id?: string
          keyword: string
          site_connection_id: string
          synced_at?: string
        }
        Update: {
          avg_monthly_searches?: number | null
          competition?: string | null
          competition_index?: number | null
          id?: string
          keyword?: string
          site_connection_id?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_research_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: false
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_usage_counters: {
        Row: {
          api_key_id: string
          calls_count: number
          created_at: string
          id: string
          organization_id: string
          period_end: string
          period_start: string
        }
        Insert: {
          api_key_id: string
          calls_count?: number
          created_at?: string
          id?: string
          organization_id: string
          period_end: string
          period_start: string
        }
        Update: {
          api_key_id?: string
          calls_count?: number
          created_at?: string
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_usage_counters_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_usage_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          plan_id: string | null
          slug: string
          status: string
          stripe_customer_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan_id?: string | null
          slug: string
          status?: string
          stripe_customer_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan_id?: string | null
          slug?: string
          status?: string
          stripe_customer_id?: string | null
        }
        Relationships: []
      }
      pipeline_run_steps: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          input: Json | null
          output: Json | null
          pipeline_run_id: string
          started_at: string
          status: string
          step_name: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          pipeline_run_id: string
          started_at?: string
          status: string
          step_name: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          pipeline_run_id?: string
          started_at?: string
          status?: string
          step_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_run_steps_pipeline_run_id_fkey"
            columns: ["pipeline_run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_runs: {
        Row: {
          created_by: string
          current_step: string | null
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          organization_id: string
          post_id: string | null
          schedule_id: string | null
          site_connection_id: string
          started_at: string
          status: string
          trigger_type: string
          workflow_run_id: string | null
        }
        Insert: {
          created_by: string
          current_step?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          organization_id: string
          post_id?: string | null
          schedule_id?: string | null
          site_connection_id: string
          started_at?: string
          status?: string
          trigger_type?: string
          workflow_run_id?: string | null
        }
        Update: {
          created_by?: string
          current_step?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          organization_id?: string
          post_id?: string | null
          schedule_id?: string | null
          site_connection_id?: string
          started_at?: string
          status?: string
          trigger_type?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: false
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          ai_token_soft_cap: number | null
          created_at: string
          features: Json
          id: string
          monthly_post_quota: number
          name: string
          seats: number
          stripe_price_id: string | null
        }
        Insert: {
          ai_token_soft_cap?: number | null
          created_at?: string
          features?: Json
          id?: string
          monthly_post_quota: number
          name: string
          seats?: number
          stripe_price_id?: string | null
        }
        Update: {
          ai_token_soft_cap?: number | null
          created_at?: string
          features?: Json
          id?: string
          monthly_post_quota?: number
          name?: string
          seats?: number
          stripe_price_id?: string | null
        }
        Relationships: []
      }
      posts: {
        Row: {
          content_embedding: string | null
          content_html: string
          content_markdown: string | null
          created_at: string
          created_by: string
          external_post_id: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          organization_id: string
          published_at: string | null
          published_url: string | null
          site_connection_id: string
          slug: string
          status: string
          title: string
        }
        Insert: {
          content_embedding?: string | null
          content_html: string
          content_markdown?: string | null
          created_at?: string
          created_by: string
          external_post_id?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          organization_id: string
          published_at?: string | null
          published_url?: string | null
          site_connection_id: string
          slug: string
          status?: string
          title: string
        }
        Update: {
          content_embedding?: string | null
          content_html?: string
          content_markdown?: string | null
          created_at?: string
          created_by?: string
          external_post_id?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          organization_id?: string
          published_at?: string | null
          published_url?: string | null
          site_connection_id?: string
          slug?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: false
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      research_chunks: {
        Row: {
          chunk_index: number
          chunk_text: string
          created_at: string
          embedding: string | null
          embedding_model: string
          id: string
          organization_id: string
          site_connection_id: string
          source_title: string | null
          source_url: string
        }
        Insert: {
          chunk_index?: number
          chunk_text: string
          created_at?: string
          embedding?: string | null
          embedding_model: string
          id?: string
          organization_id: string
          site_connection_id: string
          source_title?: string | null
          source_url: string
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string
          id?: string
          organization_id?: string
          site_connection_id?: string
          source_title?: string | null
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_chunks_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: false
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          cadence: string
          created_at: string
          created_by: string
          enabled: boolean
          id: string
          next_run_at: string | null
          organization_id: string
          site_connection_id: string
          timezone: string
          topic_hint: string
          topic_source: string
          updated_at: string
        }
        Insert: {
          cadence: string
          created_at?: string
          created_by: string
          enabled?: boolean
          id?: string
          next_run_at?: string | null
          organization_id: string
          site_connection_id: string
          timezone?: string
          topic_hint: string
          topic_source?: string
          updated_at?: string
        }
        Update: {
          cadence?: string
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          next_run_at?: string | null
          organization_id?: string
          site_connection_id?: string
          timezone?: string
          topic_hint?: string
          topic_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: false
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      search_console_credentials: {
        Row: {
          created_at: string
          gsc_site_url: string | null
          id: string
          secret_ref: string | null
          site_connection_id: string
          status: string
        }
        Insert: {
          created_at?: string
          gsc_site_url?: string | null
          id?: string
          secret_ref?: string | null
          site_connection_id: string
          status?: string
        }
        Update: {
          created_at?: string
          gsc_site_url?: string | null
          id?: string
          secret_ref?: string | null
          site_connection_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_console_credentials_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: true
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      search_console_queries: {
        Row: {
          clicks: number
          ctr: number
          fetched_at: string
          id: string
          impressions: number
          period_end: string
          period_start: string
          position: number
          query: string
          site_connection_id: string
        }
        Insert: {
          clicks?: number
          ctr?: number
          fetched_at?: string
          id?: string
          impressions?: number
          period_end: string
          period_start: string
          position?: number
          query: string
          site_connection_id: string
        }
        Update: {
          clicks?: number
          ctr?: number
          fetched_at?: string
          id?: string
          impressions?: number
          period_end?: string
          period_start?: string
          position?: number
          query?: string
          site_connection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_console_queries_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: false
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      site_connections: {
        Row: {
          base_url: string | null
          cms_type: string
          consecutive_publish_failures: number
          created_at: string
          display_name: string
          id: string
          organization_id: string
          paused: boolean
          status: string
        }
        Insert: {
          base_url?: string | null
          cms_type: string
          consecutive_publish_failures?: number
          created_at?: string
          display_name: string
          id?: string
          organization_id: string
          paused?: boolean
          status?: string
        }
        Update: {
          base_url?: string | null
          cms_type?: string
          consecutive_publish_failures?: number
          created_at?: string
          display_name?: string
          id?: string
          organization_id?: string
          paused?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          current_period_end: string | null
          organization_id: string
          plan_id: string | null
          status: string
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          current_period_end?: string | null
          organization_id: string
          plan_id?: string | null
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          current_period_end?: string | null
          organization_id?: string
          plan_id?: string | null
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          content_policy: Json
          max_posts_per_day: number | null
          max_posts_per_week: number | null
          organization_id: string
          paused: boolean
          require_approval: boolean
          updated_at: string
        }
        Insert: {
          content_policy?: Json
          max_posts_per_day?: number | null
          max_posts_per_week?: number | null
          organization_id: string
          paused?: boolean
          require_approval?: boolean
          updated_at?: string
        }
        Update: {
          content_policy?: Json
          max_posts_per_day?: number | null
          max_posts_per_week?: number | null
          organization_id?: string
          paused?: boolean
          require_approval?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      url_inspections: {
        Row: {
          coverage_state: string | null
          id: string
          index_verdict: string | null
          indexing_state: string | null
          inspected_at: string
          inspected_url: string
          inspection_result_link: string | null
          last_crawl_time: string | null
          page_fetch_state: string | null
          post_id: string
          robots_txt_state: string | null
          site_connection_id: string
        }
        Insert: {
          coverage_state?: string | null
          id?: string
          index_verdict?: string | null
          indexing_state?: string | null
          inspected_at?: string
          inspected_url: string
          inspection_result_link?: string | null
          last_crawl_time?: string | null
          page_fetch_state?: string | null
          post_id: string
          robots_txt_state?: string | null
          site_connection_id: string
        }
        Update: {
          coverage_state?: string | null
          id?: string
          index_verdict?: string | null
          indexing_state?: string | null
          inspected_at?: string
          inspected_url?: string
          inspection_result_link?: string | null
          last_crawl_time?: string | null
          page_fetch_state?: string | null
          post_id?: string
          robots_txt_state?: string | null
          site_connection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "url_inspections_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "url_inspections_site_connection_id_fkey"
            columns: ["site_connection_id"]
            isOneToOne: false
            referencedRelation: "site_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          ai_cost_usd: number
          ai_tokens_used: number
          created_at: string
          id: string
          organization_id: string
          period_end: string
          period_start: string
          posts_generated: number
        }
        Insert: {
          ai_cost_usd?: number
          ai_tokens_used?: number
          created_at?: string
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          posts_generated?: number
        }
        Update: {
          ai_cost_usd?: number
          ai_tokens_used?: number
          created_at?: string
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          posts_generated?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization_with_owner: {
        Args: { org_name: string; org_slug: string }
        Returns: {
          created_at: string
          id: string
          name: string
          plan_id: string | null
          slug: string
          status: string
          stripe_customer_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_google_ads_credentials: {
        Args: { p_site_connection_id: string }
        Returns: undefined
      }
      delete_search_console_credentials: {
        Args: { p_site_connection_id: string }
        Returns: undefined
      }
      find_similar_posts: {
        Args: {
          p_embedding: string
          p_limit?: number
          p_site_connection_id: string
          p_threshold?: number
        }
        Returns: {
          id: string
          similarity: number
          title: string
        }[]
      }
      find_similar_research_chunks: {
        Args: {
          p_embedding: string
          p_limit?: number
          p_min_similarity?: number
          p_site_connection_id: string
        }
        Returns: {
          chunk_text: string
          similarity: number
          source_title: string
          source_url: string
        }[]
      }
      get_google_ads_credentials: {
        Args: { p_site_connection_id: string }
        Returns: Json
      }
      get_google_ads_credentials_for_sync: {
        Args: { p_site_connection_id: string }
        Returns: Json
      }
      get_search_console_credentials: {
        Args: { p_site_connection_id: string }
        Returns: Json
      }
      get_search_console_credentials_for_sync: {
        Args: { p_site_connection_id: string }
        Returns: Json
      }
      get_site_credentials: {
        Args: { p_site_connection_id: string }
        Returns: Json
      }
      is_org_admin: { Args: { target_org_id: string }; Returns: boolean }
      is_org_admin_for_pipeline_run: {
        Args: { target_run_id: string }
        Returns: boolean
      }
      is_org_admin_for_site: {
        Args: { target_site_id: string }
        Returns: boolean
      }
      is_org_member: { Args: { target_org_id: string }; Returns: boolean }
      is_org_member_for_pipeline_run: {
        Args: { target_run_id: string }
        Returns: boolean
      }
      is_org_member_for_site: {
        Args: { target_site_id: string }
        Returns: boolean
      }
      is_org_owner: { Args: { target_org_id: string }; Returns: boolean }
      set_google_ads_credentials: {
        Args: { p_secret: Json; p_site_connection_id: string }
        Returns: string
      }
      set_google_ads_credentials_for_sync: {
        Args: { p_secret: Json; p_site_connection_id: string }
        Returns: string
      }
      set_search_console_credentials: {
        Args: { p_secret: Json; p_site_connection_id: string }
        Returns: string
      }
      set_search_console_credentials_for_sync: {
        Args: { p_secret: Json; p_site_connection_id: string }
        Returns: string
      }
      set_site_credentials: {
        Args: { p_secret: Json; p_site_connection_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
