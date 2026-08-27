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
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          ip_hash: string | null
          metadata: Json
          workspace_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          ip_hash?: string | null
          metadata?: Json
          workspace_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          ip_hash?: string | null
          metadata?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_periods: {
        Row: {
          alias: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string
          end_date: string
          id: string
          start_date: string
          status: Database["public"]["Enums"]["period_status"]
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          alias: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by: string
          end_date: string
          id?: string
          start_date: string
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          alias?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string
          end_date?: string
          id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_periods_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "budget_periods_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          allocated_minor: number
          archived_at: string | null
          category_id: string
          created_at: string
          created_by: string
          id: string
          name: string | null
          notes: string | null
          period_id: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          allocated_minor: number
          archived_at?: string | null
          category_id: string
          created_at?: string
          created_by: string
          id?: string
          name?: string | null
          notes?: string | null
          period_id: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          allocated_minor?: number
          archived_at?: string | null
          category_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string | null
          notes?: string | null
          period_id?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_period_fk"
            columns: ["workspace_id", "period_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          depth: number
          flow: Database["public"]["Enums"]["flow_type"]
          id: string
          is_system: boolean
          name: string
          normalized_name: string | null
          parent_id: string | null
          sort_order: number
          workspace_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          depth?: number
          flow: Database["public"]["Enums"]["flow_type"]
          id?: string
          is_system?: boolean
          name: string
          normalized_name?: string | null
          parent_id?: string | null
          sort_order?: number
          workspace_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          depth?: number
          flow?: Database["public"]["Enums"]["flow_type"]
          id?: string
          is_system?: boolean
          name?: string
          normalized_name?: string | null
          parent_id?: string | null
          sort_order?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      command_receipts: {
        Row: {
          command_name: string
          created_at: string
          created_by: string
          idempotency_key: string
          request_hash: string
          result_entity_id: string | null
          workspace_id: string
        }
        Insert: {
          command_name: string
          created_at?: string
          created_by: string
          idempotency_key: string
          request_hash: string
          result_entity_id?: string | null
          workspace_id: string
        }
        Update: {
          command_name?: string
          created_at?: string
          created_by?: string
          idempotency_key?: string
          request_hash?: string
          result_entity_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "command_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "command_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          base_currency: string
          created_at: string
          quote_currency: string
          rate: number
          rate_date: string
          source: string
        }
        Insert: {
          base_currency: string
          created_at?: string
          quote_currency: string
          rate: number
          rate_date: string
          source: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          quote_currency?: string
          rate?: number
          rate_date?: string
          source?: string
        }
        Relationships: []
      }
      financial_plans: {
        Row: {
          created_at: string
          created_by: string
          id: string
          inputs: Json
          status: Database["public"]["Enums"]["plan_status"]
          target_date: string | null
          title: string
          type: Database["public"]["Enums"]["plan_type"]
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          inputs?: Json
          status?: Database["public"]["Enums"]["plan_status"]
          target_date?: string | null
          title: string
          type?: Database["public"]["Enums"]["plan_type"]
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          inputs?: Json
          status?: Database["public"]["Enums"]["plan_status"]
          target_date?: string | null
          title?: string
          type?: Database["public"]["Enums"]["plan_type"]
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "financial_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          account_class: Database["public"]["Enums"]["ledger_account_class"]
          archived_at: string | null
          code: string
          created_at: string
          id: string
          name: string
          normal_side: Database["public"]["Enums"]["ledger_side"]
          system_key: string | null
          wallet_id: string | null
          workspace_id: string
        }
        Insert: {
          account_class: Database["public"]["Enums"]["ledger_account_class"]
          archived_at?: string | null
          code: string
          created_at?: string
          id?: string
          name: string
          normal_side: Database["public"]["Enums"]["ledger_side"]
          system_key?: string | null
          wallet_id?: string | null
          workspace_id: string
        }
        Update: {
          account_class?: Database["public"]["Enums"]["ledger_account_class"]
          archived_at?: string | null
          code?: string
          created_at?: string
          id?: string
          name?: string
          normal_side?: Database["public"]["Enums"]["ledger_side"]
          system_key?: string | null
          wallet_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_wallet_fk"
            columns: ["workspace_id", "wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "ledger_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "ledger_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          id: string
          read_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key: string
          id?: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type: string
          user_id: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      period_budget_snapshots: {
        Row: {
          allocated_minor: number
          budget_id: string
          period_id: string
          remaining_minor: number
          spent_minor: number
        }
        Insert: {
          allocated_minor: number
          budget_id: string
          period_id: string
          remaining_minor: number
          spent_minor: number
        }
        Update: {
          allocated_minor?: number
          budget_id?: string
          period_id?: string
          remaining_minor?: number
          spent_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "period_budget_snapshots_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_budget_snapshots_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "v_budget_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_budget_snapshots_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_budget_snapshots_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["period_id"]
          },
        ]
      }
      period_closing_snapshots: {
        Row: {
          generated_at: string
          generated_by: string
          net_cashflow_minor: number
          period_id: string
          safe_to_spend_minor: number
          total_assets_minor: number
          total_budget_minor: number
          total_expense_minor: number
          total_income_minor: number
          total_liabilities_minor: number
          total_reserved_minor: number
          workspace_id: string
        }
        Insert: {
          generated_at?: string
          generated_by: string
          net_cashflow_minor: number
          period_id: string
          safe_to_spend_minor: number
          total_assets_minor: number
          total_budget_minor: number
          total_expense_minor: number
          total_income_minor: number
          total_liabilities_minor: number
          total_reserved_minor: number
          workspace_id: string
        }
        Update: {
          generated_at?: string
          generated_by?: string
          net_cashflow_minor?: number
          period_id?: string
          safe_to_spend_minor?: number
          total_assets_minor?: number
          total_budget_minor?: number
          total_expense_minor?: number
          total_income_minor?: number
          total_liabilities_minor?: number
          total_reserved_minor?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_closing_snapshots_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: true
            referencedRelation: "budget_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_closing_snapshots_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: true
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["period_id"]
          },
          {
            foreignKeyName: "period_closing_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "period_closing_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      receivable_payments: {
        Row: {
          amount_minor: number
          created_at: string
          id: string
          paid_at: string
          receivable_id: string
          reversed_at: string | null
          transaction_id: string
          workspace_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          id?: string
          paid_at: string
          receivable_id: string
          reversed_at?: string | null
          transaction_id: string
          workspace_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          id?: string
          paid_at?: string
          receivable_id?: string
          reversed_at?: string | null
          transaction_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivable_payments_receivable_fk"
            columns: ["workspace_id", "receivable_id"]
            isOneToOne: false
            referencedRelation: "receivables"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "receivable_payments_receivable_fk"
            columns: ["workspace_id", "receivable_id"]
            isOneToOne: false
            referencedRelation: "v_receivable_balances"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "receivable_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "receivable_payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      receivables: {
        Row: {
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          original_amount_minor: number
          person_snapshot: string
          settled_at: string | null
          source_note: string | null
          source_transaction_id: string | null
          source_type: Database["public"]["Enums"]["receivable_source_type"]
          status: Database["public"]["Enums"]["receivable_status"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          original_amount_minor: number
          person_snapshot: string
          settled_at?: string | null
          source_note?: string | null
          source_transaction_id?: string | null
          source_type: Database["public"]["Enums"]["receivable_source_type"]
          status?: Database["public"]["Enums"]["receivable_status"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          original_amount_minor?: number
          person_snapshot?: string
          settled_at?: string | null
          source_note?: string | null
          source_transaction_id?: string | null
          source_type?: Database["public"]["Enums"]["receivable_source_type"]
          status?: Database["public"]["Enums"]["receivable_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "receivables_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          amount_minor: number | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          due_at: string
          id: string
          note: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          title: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          amount_minor?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          due_at: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          title: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          amount_minor?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          due_at?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_movements: {
        Row: {
          amount_minor: number
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          occurred_at: string
          saving_id: string
          transaction_id: string | null
          type: Database["public"]["Enums"]["saving_movement_type"]
          workspace_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          occurred_at?: string
          saving_id: string
          transaction_id?: string | null
          type: Database["public"]["Enums"]["saving_movement_type"]
          workspace_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          occurred_at?: string
          saving_id?: string
          transaction_id?: string | null
          type?: Database["public"]["Enums"]["saving_movement_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saving_movements_goal_fk"
            columns: ["workspace_id", "saving_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "saving_movements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saving_movements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saving_movements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "saving_movements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          current_balance_minor: number
          emoji: string | null
          id: string
          name: string
          ownership: string
          target_date: string | null
          target_minor: number | null
          updated_at: string
          version: number
          wallet_id: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          current_balance_minor?: number
          emoji?: string | null
          id?: string
          name: string
          ownership?: string
          target_date?: string | null
          target_minor?: number | null
          updated_at?: string
          version?: number
          wallet_id: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          current_balance_minor?: number
          emoji?: string | null
          id?: string
          name?: string
          ownership?: string
          target_date?: string | null
          target_minor?: number | null
          updated_at?: string
          version?: number
          wallet_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "savings_goals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_wallet_fk"
            columns: ["workspace_id", "wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      split_bills: {
        Row: {
          created_at: string
          created_by: string
          finalized_at: string | null
          id: string
          status: Database["public"]["Enums"]["split_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          finalized_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["split_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          finalized_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["split_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_bills_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "split_bills_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      split_item_shares: {
        Row: {
          item_id: string
          participant_id: string
          share_weight: number
        }
        Insert: {
          item_id: string
          participant_id: string
          share_weight?: number
        }
        Update: {
          item_id?: string
          participant_id?: string
          share_weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "split_item_shares_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "split_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_item_shares_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "split_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      split_items: {
        Row: {
          created_at: string
          id: string
          name: string
          price_minor: number
          receipt_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          price_minor: number
          receipt_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          price_minor?: number
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "split_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      split_participants: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_current_user: boolean
          name_snapshot: string
          split_bill_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_current_user?: boolean
          name_snapshot: string
          split_bill_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_current_user?: boolean
          name_snapshot?: string
          split_bill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_participants_split_bill_id_fkey"
            columns: ["split_bill_id"]
            isOneToOne: false
            referencedRelation: "split_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      split_receipts: {
        Row: {
          created_at: string
          id: string
          name: string
          payer_participant_id: string
          split_bill_id: string
          tax_percent: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          payer_participant_id: string
          split_bill_id: string
          tax_percent?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          payer_participant_id?: string
          split_bill_id?: string
          tax_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "split_receipts_payer_participant_id_fkey"
            columns: ["payer_participant_id"]
            isOneToOne: false
            referencedRelation: "split_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_receipts_split_bill_id_fkey"
            columns: ["split_bill_id"]
            isOneToOne: false
            referencedRelation: "split_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      split_settlements: {
        Row: {
          amount_minor: number
          created_at: string
          from_participant_id: string
          id: string
          receivable_id: string | null
          split_bill_id: string
          to_participant_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          from_participant_id: string
          id?: string
          receivable_id?: string | null
          split_bill_id: string
          to_participant_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          from_participant_id?: string
          id?: string
          receivable_id?: string | null
          split_bill_id?: string
          to_participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_settlements_from_participant_id_fkey"
            columns: ["from_participant_id"]
            isOneToOne: false
            referencedRelation: "split_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_settlements_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "receivables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_settlements_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "v_receivable_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_settlements_split_bill_id_fkey"
            columns: ["split_bill_id"]
            isOneToOne: false
            referencedRelation: "split_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_settlements_to_participant_id_fkey"
            columns: ["to_participant_id"]
            isOneToOne: false
            referencedRelation: "split_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_occurrences: {
        Row: {
          amount_minor: number
          billing_date: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["occurrence_status"]
          subscription_id: string
          transaction_id: string | null
          workspace_id: string
        }
        Insert: {
          amount_minor: number
          billing_date: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["occurrence_status"]
          subscription_id: string
          transaction_id?: string | null
          workspace_id: string
        }
        Update: {
          amount_minor?: number
          billing_date?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["occurrence_status"]
          subscription_id?: string
          transaction_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_subscription_fk"
            columns: ["workspace_id", "subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "subscription_occurrences_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_occurrences_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_occurrences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "subscription_occurrences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_minor: number
          category_id: string
          created_at: string
          created_by: string
          custom_interval_days: number | null
          cycle: Database["public"]["Enums"]["billing_cycle"]
          end_date: string | null
          id: string
          name: string
          next_billing_date: string
          reminder_days_before: number
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          version: number
          wallet_id: string
          workspace_id: string
        }
        Insert: {
          amount_minor: number
          category_id: string
          created_at?: string
          created_by: string
          custom_interval_days?: number | null
          cycle: Database["public"]["Enums"]["billing_cycle"]
          end_date?: string | null
          id?: string
          name: string
          next_billing_date: string
          reminder_days_before?: number
          start_date: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          version?: number
          wallet_id: string
          workspace_id: string
        }
        Update: {
          amount_minor?: number
          category_id?: string
          created_at?: string
          created_by?: string
          custom_interval_days?: number | null
          cycle?: Database["public"]["Enums"]["billing_cycle"]
          end_date?: string | null
          id?: string
          name?: string
          next_billing_date?: string
          reminder_days_before?: number
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          version?: number
          wallet_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_wallet_fk"
            columns: ["workspace_id", "wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_attachments: {
        Row: {
          content_type: string
          created_at: string
          id: string
          size_bytes: number
          storage_path: string
          transaction_id: string
          uploaded_by: string
          workspace_id: string
        }
        Insert: {
          content_type: string
          created_at?: string
          id?: string
          size_bytes: number
          storage_path: string
          transaction_id: string
          uploaded_by: string
          workspace_id: string
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          size_bytes?: number
          storage_path?: string
          transaction_id?: string
          uploaded_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "transaction_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_budget_allocations: {
        Row: {
          amount_minor: number
          budget_id: string
          created_at: string
          transaction_id: string
        }
        Insert: {
          amount_minor: number
          budget_id: string
          created_at?: string
          transaction_id: string
        }
        Update: {
          amount_minor?: number
          budget_id?: string
          created_at?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_budget_allocations_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_budget_allocations_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "v_budget_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_budget_allocations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_budget_allocations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_installments: {
        Row: {
          completed_installments: number
          created_at: string
          tenor_months: number
          transaction_id: string
          workspace_id: string
        }
        Insert: {
          completed_installments?: number
          created_at?: string
          tenor_months: number
          transaction_id: string
          workspace_id: string
        }
        Update: {
          completed_installments?: number
          created_at?: string
          tenor_months?: number
          transaction_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_installments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_installments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_installments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "transaction_installments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_lines: {
        Row: {
          amount_minor: number
          category_id: string | null
          created_at: string
          id: string
          ledger_account_id: string
          memo: string | null
          side: Database["public"]["Enums"]["ledger_side"]
          transaction_id: string
          workspace_id: string
        }
        Insert: {
          amount_minor: number
          category_id?: string | null
          created_at?: string
          id?: string
          ledger_account_id: string
          memo?: string | null
          side: Database["public"]["Enums"]["ledger_side"]
          transaction_id: string
          workspace_id: string
        }
        Update: {
          amount_minor?: number
          category_id?: string | null
          created_at?: string
          id?: string
          ledger_account_id?: string
          memo?: string | null
          side?: Database["public"]["Enums"]["ledger_side"]
          transaction_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_lines_account_fk"
            columns: ["workspace_id", "ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "transaction_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_lines_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_lines_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "transaction_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_minor: number
          benefit_scope: string | null
          category_id: string | null
          category_name_snapshot: string | null
          created_at: string
          created_by: string
          currency_code: string
          id: string
          idempotency_key: string
          merchant: string | null
          nature: Database["public"]["Enums"]["transaction_nature"]
          note: string | null
          occurred_at: string
          owed_amount_minor: number | null
          period_id: string
          recipient: string | null
          replaced_by_id: string | null
          reversal_of_id: string | null
          split_bill_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          subscription_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          visible_in_feed: boolean
          workspace_id: string
        }
        Insert: {
          amount_minor: number
          benefit_scope?: string | null
          category_id?: string | null
          category_name_snapshot?: string | null
          created_at?: string
          created_by: string
          currency_code?: string
          id?: string
          idempotency_key: string
          merchant?: string | null
          nature: Database["public"]["Enums"]["transaction_nature"]
          note?: string | null
          occurred_at: string
          owed_amount_minor?: number | null
          period_id: string
          recipient?: string | null
          replaced_by_id?: string | null
          reversal_of_id?: string | null
          split_bill_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          subscription_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          visible_in_feed?: boolean
          workspace_id: string
        }
        Update: {
          amount_minor?: number
          benefit_scope?: string | null
          category_id?: string | null
          category_name_snapshot?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string
          id?: string
          idempotency_key?: string
          merchant?: string | null
          nature?: Database["public"]["Enums"]["transaction_nature"]
          note?: string | null
          occurred_at?: string
          owed_amount_minor?: number | null
          period_id?: string
          recipient?: string | null
          replaced_by_id?: string | null
          reversal_of_id?: string | null
          split_bill_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          subscription_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          visible_in_feed?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_period_fk"
            columns: ["workspace_id", "period_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "transactions_replacement_fk"
            columns: ["replaced_by_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_replacement_fk"
            columns: ["replaced_by_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reversal_fk"
            columns: ["reversal_of_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reversal_fk"
            columns: ["reversal_of_id"]
            isOneToOne: true
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_split_bill_fk"
            columns: ["workspace_id", "split_bill_id"]
            isOneToOne: false
            referencedRelation: "split_bills"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "transactions_subscription_fk"
            columns: ["workspace_id", "subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_workspace_preferences: {
        Row: {
          default_wallet_id: string | null
          display_currency: string
          hide_home_amounts: boolean
          home_tools: string[]
          language: string
          notification_preferences: Json
          notifications_enabled: boolean
          theme: string
          updated_at: string
          user_id: string
          wallet_order: string[]
          workspace_id: string
        }
        Insert: {
          default_wallet_id?: string | null
          display_currency?: string
          hide_home_amounts?: boolean
          home_tools?: string[]
          language?: string
          notification_preferences?: Json
          notifications_enabled?: boolean
          theme?: string
          updated_at?: string
          user_id: string
          wallet_order?: string[]
          workspace_id: string
        }
        Update: {
          default_wallet_id?: string | null
          display_currency?: string
          hide_home_amounts?: boolean
          home_tools?: string[]
          language?: string
          notification_preferences?: Json
          notifications_enabled?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
          wallet_order?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preferences_default_wallet_fk"
            columns: ["workspace_id", "default_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "user_workspace_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "user_workspace_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          archived_at: string | null
          card_network: string | null
          created_at: string
          created_by: string
          credit_limit_minor: number | null
          currency_code: string
          current_balance_minor: number
          id: string
          institution_name: string | null
          last4: string | null
          medium: Database["public"]["Enums"]["wallet_medium"]
          name: string
          phone_masked: string | null
          updated_at: string
          version: number
          wallet_class: Database["public"]["Enums"]["wallet_class"]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          card_network?: string | null
          created_at?: string
          created_by: string
          credit_limit_minor?: number | null
          currency_code?: string
          current_balance_minor?: number
          id?: string
          institution_name?: string | null
          last4?: string | null
          medium: Database["public"]["Enums"]["wallet_medium"]
          name: string
          phone_masked?: string | null
          updated_at?: string
          version?: number
          wallet_class: Database["public"]["Enums"]["wallet_class"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          card_network?: string | null
          created_at?: string
          created_by?: string
          credit_limit_minor?: number | null
          currency_code?: string
          current_balance_minor?: number
          id?: string
          institution_name?: string | null
          last4?: string | null
          medium?: Database["public"]["Enums"]["wallet_medium"]
          name?: string
          phone_masked?: string | null
          updated_at?: string
          version?: number
          wallet_class?: Database["public"]["Enums"]["wallet_class"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "wallets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      web_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_push_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "web_push_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email_normalized: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          token_hash: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email_normalized: string
          expires_at: string
          id?: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          token_hash: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email_normalized?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          joined_at?: string
          role: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
          workspace_id: string
        }
        Update: {
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          base_currency: string
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["workspace_kind"]
          name: string
          status: Database["public"]["Enums"]["workspace_status"]
          timezone: string
          updated_at: string
          version: number
        }
        Insert: {
          base_currency?: string
          created_at?: string
          created_by: string
          id?: string
          kind?: Database["public"]["Enums"]["workspace_kind"]
          name: string
          status?: Database["public"]["Enums"]["workspace_status"]
          timezone?: string
          updated_at?: string
          version?: number
        }
        Update: {
          base_currency?: string
          created_at?: string
          created_by?: string
          id?: string
          kind?: Database["public"]["Enums"]["workspace_kind"]
          name?: string
          status?: Database["public"]["Enums"]["workspace_status"]
          timezone?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      v_budget_progress: {
        Row: {
          allocated_minor: number | null
          archived_at: string | null
          category_id: string | null
          category_name: string | null
          created_at: string | null
          id: string | null
          notes: string | null
          over_budget: boolean | null
          period_id: string | null
          remaining_minor: number | null
          spent_minor: number | null
          updated_at: string | null
          version: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_period_fk"
            columns: ["workspace_id", "period_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_dashboard_summary: {
        Row: {
          allocated_minor: number | null
          net_liquidity_minor: number | null
          period_id: string | null
          remaining_budget_minor: number | null
          reserved_minor: number | null
          safe_to_spend_minor: number | null
          spent_minor: number | null
          total_assets_minor: number | null
          total_liabilities_minor: number | null
          workspace_id: string | null
        }
        Relationships: []
      }
      v_receivable_balances: {
        Row: {
          created_at: string | null
          created_by: string | null
          due_date: string | null
          id: string | null
          original_amount_minor: number | null
          paid_minor: number | null
          person_snapshot: string | null
          remaining_minor: number | null
          settled_at: string | null
          settled_by_tx_id: string | null
          source_note: string | null
          source_transaction_id: string | null
          source_type:
            | Database["public"]["Enums"]["receivable_source_type"]
            | null
          status: Database["public"]["Enums"]["receivable_status"] | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receivables_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "receivables_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_transactions: {
        Row: {
          adjustment_effect: string | null
          amount_minor: number | null
          benefit_scope: string | null
          budget_id: string | null
          category_id: string | null
          category_name: string | null
          created_at: string | null
          created_by: string | null
          currency_code: string | null
          id: string | null
          installment_paid_months: number | null
          installment_tenor_months: number | null
          merchant: string | null
          nature: Database["public"]["Enums"]["transaction_nature"] | null
          note: string | null
          occurred_at: string | null
          owed_amount_minor: number | null
          period_id: string | null
          recipient: string | null
          replaced_by_id: string | null
          reversal_of_id: string | null
          saving_id: string | null
          settles_receivable_id: string | null
          split_bill_id: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          subscription_id: string | null
          to_wallet_id: string | null
          type: Database["public"]["Enums"]["transaction_type"] | null
          wallet_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_period_fk"
            columns: ["workspace_id", "period_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "transactions_replacement_fk"
            columns: ["replaced_by_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_replacement_fk"
            columns: ["replaced_by_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reversal_fk"
            columns: ["reversal_of_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reversal_fk"
            columns: ["reversal_of_id"]
            isOneToOne: true
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_split_bill_fk"
            columns: ["workspace_id", "split_bill_id"]
            isOneToOne: false
            referencedRelation: "split_bills"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "transactions_subscription_fk"
            columns: ["workspace_id", "subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_workspace_invitation: {
        Args: { p_token: string }
        Returns: string
      }
      adjust_saving: { Args: { p_payload: Json }; Returns: string }
      adjust_wallet_balance: { Args: { p_payload: Json }; Returns: string }
      archive_saving_goal: { Args: { p_payload: Json }; Returns: string }
      archive_wallet: { Args: { p_payload: Json }; Returns: string }
      change_workspace_member_role: {
        Args: {
          p_role: Database["public"]["Enums"]["workspace_role"]
          p_user_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      close_budget_period: { Args: { p_payload: Json }; Returns: string }
      close_budget_period_to_draft: { Args: { p_payload: Json }; Returns: string }
      open_budget_period: { Args: { p_payload: Json }; Returns: string }
      create_budget_period_with_budgets: {
        Args: { p_payload: Json }
        Returns: string
      }
      create_manual_receivable: { Args: { p_payload: Json }; Returns: string }
      create_saving_goal: { Args: { p_payload: Json }; Returns: string }
      create_wallet: { Args: { p_payload: Json }; Returns: string }
      create_wallet_with_network: { Args: { p_payload: Json }; Returns: string }
      create_workspace: { Args: { p_payload: Json }; Returns: string }
      delete_draft_budget_period: { Args: { p_payload: Json }; Returns: string }
      ensure_user_bootstrap: { Args: never; Returns: string }
      finalize_split_bill: { Args: { p_payload: Json }; Returns: string }
      invite_workspace_member: { Args: { p_payload: Json }; Returns: string }
      mark_all_notifications_read: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      mark_reminder_done: {
        Args: { p_done?: boolean; p_reminder_id: string }
        Returns: undefined
      }
      post_transaction: { Args: { p_payload: Json }; Returns: string }
      post_transaction_with_benefit_scope: {
        Args: { p_payload: Json }
        Returns: string
      }
      remove_workspace_member: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: undefined
      }
      replace_transaction: { Args: { p_payload: Json }; Returns: string }
      replace_transaction_with_benefit_scope: {
        Args: { p_payload: Json }
        Returns: string
      }
      reverse_transaction: { Args: { p_payload: Json }; Returns: string }
      set_transaction_benefit_scope: {
        Args: { p_payload: Json }
        Returns: string
      }
      sync_budget_allocations: {
        Args: { p_period_id: string; p_workspace_id: string }
        Returns: undefined
      }
      transfer_workspace_ownership: {
        Args: { p_new_owner_id: string; p_workspace_id: string }
        Returns: undefined
      }
      update_saving_goal: { Args: { p_payload: Json }; Returns: string }
      update_wallet: { Args: { p_payload: Json }; Returns: string }
      update_wallet_with_network: { Args: { p_payload: Json }; Returns: string }
      update_workspace_settings: { Args: { p_payload: Json }; Returns: string }
      upsert_web_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
          p_workspace_id: string
        }
        Returns: string
      }
      verify_push_dispatch_secret: {
        Args: { p_secret: string }
        Returns: boolean
      }
      write_off_receivable: { Args: { p_payload: Json }; Returns: string }
    }
    Enums: {
      billing_cycle: "weekly" | "monthly" | "quarterly" | "yearly" | "custom"
      flow_type: "expense" | "income"
      ledger_account_class:
        | "asset"
        | "liability"
        | "equity"
        | "income"
        | "expense"
        | "receivable"
      ledger_side: "debit" | "credit"
      member_status: "active" | "revoked"
      occurrence_status: "upcoming" | "reminded" | "paid" | "skipped"
      period_status: "draft" | "open" | "closed"
      plan_status: "draft" | "active" | "done"
      plan_type:
        | "target_fund"
        | "affordability"
        | "unexpected_spend"
        | "target_leftover"
      receivable_source_type: "manual" | "lent" | "shared" | "split_bill"
      receivable_status: "open" | "partial" | "settled" | "written_off"
      reminder_status: "open" | "done" | "cancelled"
      saving_movement_type:
        | "reserve"
        | "release"
        | "transfer_in"
        | "transfer_out"
        | "adjustment"
      split_status: "draft" | "finalized" | "cancelled"
      subscription_status: "active" | "paused" | "cancelled" | "ended"
      transaction_nature:
        | "planned"
        | "unexpected"
        | "recurring"
        | "non_recurring"
      transaction_status: "posted" | "reversed"
      transaction_type:
        | "expense"
        | "income"
        | "transfer"
        | "credit_payment"
        | "adjustment"
      wallet_class: "asset" | "liability"
      wallet_medium: "bank" | "credit" | "ewallet" | "cash"
      workspace_kind: "personal" | "family"
      workspace_role: "owner" | "editor" | "viewer"
      workspace_status: "active" | "suspended" | "closing" | "deleted"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      billing_cycle: ["weekly", "monthly", "quarterly", "yearly", "custom"],
      flow_type: ["expense", "income"],
      ledger_account_class: [
        "asset",
        "liability",
        "equity",
        "income",
        "expense",
        "receivable",
      ],
      ledger_side: ["debit", "credit"],
      member_status: ["active", "revoked"],
      occurrence_status: ["upcoming", "reminded", "paid", "skipped"],
      period_status: ["draft", "open", "closed"],
      plan_status: ["draft", "active", "done"],
      plan_type: [
        "target_fund",
        "affordability",
        "unexpected_spend",
        "target_leftover",
      ],
      receivable_source_type: ["manual", "lent", "shared", "split_bill"],
      receivable_status: ["open", "partial", "settled", "written_off"],
      reminder_status: ["open", "done", "cancelled"],
      saving_movement_type: [
        "reserve",
        "release",
        "transfer_in",
        "transfer_out",
        "adjustment",
      ],
      split_status: ["draft", "finalized", "cancelled"],
      subscription_status: ["active", "paused", "cancelled", "ended"],
      transaction_nature: [
        "planned",
        "unexpected",
        "recurring",
        "non_recurring",
      ],
      transaction_status: ["posted", "reversed"],
      transaction_type: [
        "expense",
        "income",
        "transfer",
        "credit_payment",
        "adjustment",
      ],
      wallet_class: ["asset", "liability"],
      wallet_medium: ["bank", "credit", "ewallet", "cash"],
      workspace_kind: ["personal", "family"],
      workspace_role: ["owner", "editor", "viewer"],
      workspace_status: ["active", "suspended", "closing", "deleted"],
    },
  },
} as const
