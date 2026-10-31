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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_role: Database["public"]["Enums"]["user_role"] | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          id: string
          mime_type: string
          organization_id: string
          original_filename: string
          status: Database["public"]["Enums"]["document_status"]
          status_message: string | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type: string
          organization_id: string
          original_filename: string
          status?: Database["public"]["Enums"]["document_status"]
          status_message?: string | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string
          organization_id?: string
          original_filename?: string
          status?: Database["public"]["Enums"]["document_status"]
          status_message?: string | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      extractions: {
        Row: {
          checks_version: string | null
          created_at: string
          document_id: string
          fields: Json | null
          id: string
          model: string | null
          organization_id: string
          prompt_version: string | null
          raw_json: Json | null
          text_items: Json | null
        }
        Insert: {
          checks_version?: string | null
          created_at?: string
          document_id: string
          fields?: Json | null
          id?: string
          model?: string | null
          organization_id: string
          prompt_version?: string | null
          raw_json?: Json | null
          text_items?: Json | null
        }
        Update: {
          checks_version?: string | null
          created_at?: string
          document_id?: string
          fields?: Json | null
          id?: string
          model?: string | null
          organization_id?: string
          prompt_version?: string | null
          raw_json?: Json | null
          text_items?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extractions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_replies: {
        Row: {
          body: string
          created_at: string
          followup_id: string
          fraud_flag: boolean
          fraud_reasons: Json
          id: string
          organization_id: string
          pasted_by: string
          proposed_po_number: string | null
          proposed_po_valid: boolean | null
        }
        Insert: {
          body: string
          created_at?: string
          followup_id: string
          fraud_flag?: boolean
          fraud_reasons?: Json
          id?: string
          organization_id: string
          pasted_by: string
          proposed_po_number?: string | null
          proposed_po_valid?: boolean | null
        }
        Update: {
          body?: string
          created_at?: string
          followup_id?: string
          fraud_flag?: boolean
          fraud_reasons?: Json
          id?: string
          organization_id?: string
          pasted_by?: string
          proposed_po_number?: string | null
          proposed_po_valid?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "followup_replies_followup_id_fkey"
            columns: ["followup_id"]
            isOneToOne: false
            referencedRelation: "followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_replies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_replies_pasted_by_fkey"
            columns: ["pasted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          ai_generated_body: string
          body: string
          created_at: string
          created_by: string
          edited: boolean
          id: string
          match_id: string
          organization_id: string
          provider_message_id: string | null
          recipient: string | null
          sent_at: string | null
          sent_by: string | null
          status: Database["public"]["Enums"]["followup_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          ai_generated_body: string
          body: string
          created_at?: string
          created_by: string
          edited?: boolean
          id?: string
          match_id: string
          organization_id: string
          provider_message_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["followup_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          ai_generated_body?: string
          body?: string
          created_at?: string
          created_by?: string
          edited?: boolean
          id?: string
          match_id?: string
          organization_id?: string
          provider_message_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["followup_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "followups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investigation_notes: {
        Row: {
          author_id: string
          created_at: string
          id: string
          match_id: string
          note: string
          organization_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          match_id: string
          note: string
          organization_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          match_id?: string
          note?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investigation_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investigation_notes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investigation_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_name: string | null
          created_at: string
          currency: string
          document_id: string
          id: string
          imported_history: boolean
          invoice_date: string | null
          invoice_number: string | null
          invoice_number_normalized: string | null
          line_items: Json | null
          npwp: string | null
          organization_id: string
          po_id: string | null
          po_number: string | null
          subtotal: number | null
          tax_amount: number | null
          total_amount: number | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          document_id: string
          id?: string
          imported_history?: boolean
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_number_normalized?: string | null
          line_items?: Json | null
          npwp?: string | null
          organization_id: string
          po_id?: string | null
          po_number?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          document_id?: string
          id?: string
          imported_history?: boolean
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_number_normalized?: string | null
          line_items?: Json | null
          npwp?: string | null
          organization_id?: string
          po_id?: string | null
          po_number?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_calls: {
        Row: {
          cost_estimate_usd: number | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error_code: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          ok: boolean
          organization_id: string
          output_tokens: number | null
          prompt_version: string
          purpose: Database["public"]["Enums"]["llm_purpose"]
        }
        Insert: {
          cost_estimate_usd?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          ok: boolean
          organization_id: string
          output_tokens?: number | null
          prompt_version: string
          purpose: Database["public"]["Enums"]["llm_purpose"]
        }
        Update: {
          cost_estimate_usd?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          ok?: boolean
          organization_id?: string
          output_tokens?: number | null
          prompt_version?: string
          purpose?: Database["public"]["Enums"]["llm_purpose"]
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          anomaly_flag: boolean
          anomaly_reason: string | null
          created_at: string
          explanation: string | null
          id: string
          invoice_id: string
          organization_id: string
          paid_at: string | null
          paid_marked_by: string | null
          review_reason: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          score: number | null
          score_breakdown: Json | null
          status: Database["public"]["Enums"]["match_status"]
          veto_code: Database["public"]["Enums"]["veto_code"] | null
        }
        Insert: {
          anomaly_flag?: boolean
          anomaly_reason?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          invoice_id: string
          organization_id: string
          paid_at?: string | null
          paid_marked_by?: string | null
          review_reason?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          score_breakdown?: Json | null
          status: Database["public"]["Enums"]["match_status"]
          veto_code?: Database["public"]["Enums"]["veto_code"] | null
        }
        Update: {
          anomaly_flag?: boolean
          anomaly_reason?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          invoice_id?: string
          organization_id?: string
          paid_at?: string | null
          paid_marked_by?: string | null
          review_reason?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          score_breakdown?: Json | null
          status?: Database["public"]["Enums"]["match_status"]
          veto_code?: Database["public"]["Enums"]["veto_code"] | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_paid_marked_by_fkey"
            columns: ["paid_marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          deactivated_at: string | null
          full_name: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          full_name?: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          id: string
          item_description: string
          line_no: number
          organization_id: string
          po_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          item_description: string
          line_no: number
          organization_id: string
          po_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          id?: string
          item_description?: string
          line_no?: number
          organization_id?: string
          po_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          currency: string
          id: string
          organization_id: string
          po_date: string
          po_number: string
          total_amount: number
          vendor_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          organization_id: string
          po_date: string
          po_number: string
          total_amount?: number
          vendor_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          organization_id?: string
          po_date?: string
          po_number?: string
          total_amount?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      review_sessions: {
        Row: {
          decided_at: string | null
          decision: Database["public"]["Enums"]["review_status"] | null
          fields_corrected_count: number
          id: string
          items_ticked: Json
          match_id: string
          opened_at: string
          organization_id: string
          reason: string | null
          reviewer_id: string
        }
        Insert: {
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["review_status"] | null
          fields_corrected_count?: number
          id?: string
          items_ticked?: Json
          match_id: string
          opened_at?: string
          organization_id: string
          reason?: string | null
          reviewer_id: string
        }
        Update: {
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["review_status"] | null
          fields_corrected_count?: number
          id?: string
          items_ticked?: Json
          match_id?: string
          opened_at?: string
          organization_id?: string
          reason?: string | null
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_sessions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_sessions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_name: string | null
          contact_email: string | null
          created_at: string
          id: string
          last_verified_at: string | null
          npwp: string | null
          organization_id: string
          status: Database["public"]["Enums"]["vendor_status"]
          vendor_code: string
          vendor_name: string
        }
        Insert: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          last_verified_at?: string | null
          npwp?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["vendor_status"]
          vendor_code: string
          vendor_name: string
        }
        Update: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          last_verified_at?: string | null
          npwp?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["vendor_status"]
          vendor_code?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org_id: { Args: never; Returns: string }
    }
    Enums: {
      document_status:
        | "UPLOADED"
        | "EXTRACTING"
        | "EXTRACTED"
        | "NEEDS_CORRECTION"
        | "EXTRACTION_FAILED"
        | "UNSUPPORTED_FORMAT"
      field_confidence: "high" | "medium" | "low" | "manual"
      field_verification: "verified" | "unverified" | "manual"
      followup_status: "DRAFT" | "SENT" | "DISCARDED"
      llm_purpose:
        | "extract_invoice"
        | "extract_invoice_vision"
        | "explain_match"
        | "agent_followup"
        | "agent_reply"
        | "chatbot"
      match_status: "REJECTED" | "FULL_MATCH" | "PARTIAL_MATCH" | "NO_MATCH"
      review_status:
        | "PENDING_REVIEW"
        | "APPROVED"
        | "REJECTED_BY_REVIEWER"
        | "PAID"
      user_role: "admin" | "ap_staff" | "approver"
      vendor_status: "verified" | "unverified" | "suspended"
      veto_code:
        | "VETO_VENDOR_NOT_FOUND"
        | "VETO_VENDOR_NOT_VERIFIED"
        | "VETO_BANK_MISMATCH"
        | "VETO_DUPLICATE_INVOICE"
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
      document_status: [
        "UPLOADED",
        "EXTRACTING",
        "EXTRACTED",
        "NEEDS_CORRECTION",
        "EXTRACTION_FAILED",
        "UNSUPPORTED_FORMAT",
      ],
      field_confidence: ["high", "medium", "low", "manual"],
      field_verification: ["verified", "unverified", "manual"],
      followup_status: ["DRAFT", "SENT", "DISCARDED"],
      llm_purpose: [
        "extract_invoice",
        "extract_invoice_vision",
        "explain_match",
        "agent_followup",
        "agent_reply",
        "chatbot",
      ],
      match_status: ["REJECTED", "FULL_MATCH", "PARTIAL_MATCH", "NO_MATCH"],
      review_status: [
        "PENDING_REVIEW",
        "APPROVED",
        "REJECTED_BY_REVIEWER",
        "PAID",
      ],
      user_role: ["admin", "ap_staff", "approver"],
      vendor_status: ["verified", "unverified", "suspended"],
      veto_code: [
        "VETO_VENDOR_NOT_FOUND",
        "VETO_VENDOR_NOT_VERIFIED",
        "VETO_BANK_MISMATCH",
        "VETO_DUPLICATE_INVOICE",
      ],
    },
  },
} as const
