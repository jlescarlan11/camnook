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
    PostgrestVersion: "14.15"
  }
  api: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_booking: { Args: { p_booking_id: string }; Returns: undefined }
      complete_issue_review: {
        Args: { p_booking_id: string; p_note: string }
        Returns: undefined
      }
      complete_pickup: {
        Args: {
          p_accessories: Json
          p_actual_at: string
          p_booking_id: string
          p_condition_summary: string
          p_notes: string
        }
        Returns: string
      }
      create_manual_block: {
        Args: {
          p_camera_id: string
          p_ends_at: string
          p_kind: Database["public"]["Enums"]["availability_block_kind"]
          p_reason: string
          p_starts_at: string
        }
        Returns: string
      }
      create_payment_proof_upload: {
        Args: {
          p_byte_size: number
          p_media_type: string
          p_sha256: string
          p_transaction_id: string
        }
        Returns: {
          object_path: string
          proof_id: string
        }[]
      }
      create_verification_document_upload: {
        Args: {
          p_byte_size: number
          p_media_type: string
          p_sha256: string
          p_verification_record_id: string
        }
        Returns: {
          document_id: string
          object_path: string
        }[]
      }
      decide_cancellation: {
        Args: { p_accept: boolean; p_note: string; p_request_id: string }
        Returns: undefined
      }
      decide_return_review: {
        Args: { p_booking_id: string; p_has_issue: boolean; p_note: string }
        Returns: Database["public"]["Enums"]["booking_state"]
      }
      ensure_profile: {
        Args: { p_legal_name: string; p_phone: string }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_due_bookings: { Args: never; Returns: number }
      finalize_deposit_settlement: {
        Args: {
          p_booking_id: string
          p_deduction_amount: number
          p_deduction_reason: string
          p_refund_amount: number
          p_refund_transaction_id: string
        }
        Returns: string
      }
      record_refund: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_recipient_name: string
          p_reference: string
        }
        Returns: string
      }
      record_return: {
        Args: {
          p_accessories: Json
          p_actual_at: string
          p_booking_id: string
          p_condition_summary: string
          p_has_damage: boolean
          p_has_missing_items: boolean
          p_notes: string
        }
        Returns: string
      }
      reject_booking: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: undefined
      }
      reject_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: Database["public"]["Enums"]["booking_state"]
      }
      release_manual_block: { Args: { p_block_id: string }; Returns: undefined }
      request_booking: {
        Args: {
          p_camera_id: string
          p_expected_location: string
          p_intended_use: string
          p_pickup_at: string
          p_return_at: string
        }
        Returns: string
      }
      request_cancellation: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: string
      }
      sign_contract: {
        Args: {
          p_acknowledged_content_sha256: string
          p_attestation_text: string
          p_booking_id: string
          p_signature_intent: string
        }
        Returns: string
      }
      submit_payment: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_reference: string
          p_sender_name: string
        }
        Returns: string
      }
      verify_payment: {
        Args: {
          p_deposit_allocation: number
          p_payment_id: string
          p_rental_allocation: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      availability_blocks: {
        Row: {
          booking_id: string | null
          camera_id: string
          created_at: string
          created_by: string
          ends_at: string
          id: string
          kind: Database["public"]["Enums"]["availability_block_kind"]
          period: unknown
          reason: string | null
          released_at: string | null
          released_by: string | null
          starts_at: string
        }
        Insert: {
          booking_id?: string | null
          camera_id: string
          created_at?: string
          created_by: string
          ends_at: string
          id?: string
          kind: Database["public"]["Enums"]["availability_block_kind"]
          period?: unknown
          reason?: string | null
          released_at?: string | null
          released_by?: string | null
          starts_at: string
        }
        Update: {
          booking_id?: string | null
          camera_id?: string
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["availability_block_kind"]
          period?: unknown
          reason?: string | null
          released_at?: string | null
          released_by?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "public_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_cancellation_requests: {
        Row: {
          booking_id: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          disposition: Database["public"]["Enums"]["cancellation_disposition"]
          id: string
          reason: string
          requested_at: string
          requester_id: string
        }
        Insert: {
          booking_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          disposition?: Database["public"]["Enums"]["cancellation_disposition"]
          id?: string
          reason: string
          requested_at?: string
          requester_id: string
        }
        Update: {
          booking_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          disposition?: Database["public"]["Enums"]["cancellation_disposition"]
          id?: string
          reason?: string
          requested_at?: string
          requester_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_cancellation_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_state_history: {
        Row: {
          actor_type: Database["public"]["Enums"]["booking_actor_type"]
          actor_user_id: string | null
          booking_id: string
          from_state: Database["public"]["Enums"]["booking_state"] | null
          id: number
          metadata: Json
          note: string | null
          occurred_at: string
          operation_id: string
          reason_code: string
          to_state: Database["public"]["Enums"]["booking_state"]
        }
        Insert: {
          actor_type: Database["public"]["Enums"]["booking_actor_type"]
          actor_user_id?: string | null
          booking_id: string
          from_state?: Database["public"]["Enums"]["booking_state"] | null
          id?: never
          metadata?: Json
          note?: string | null
          occurred_at?: string
          operation_id?: string
          reason_code: string
          to_state: Database["public"]["Enums"]["booking_state"]
        }
        Update: {
          actor_type?: Database["public"]["Enums"]["booking_actor_type"]
          actor_user_id?: string | null
          booking_id?: string
          from_state?: Database["public"]["Enums"]["booking_state"] | null
          id?: never
          metadata?: Json
          note?: string | null
          occurred_at?: string
          operation_id?: string
          reason_code?: string
          to_state?: Database["public"]["Enums"]["booking_state"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_state_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          approval_deadline_at: string | null
          approved_at: string | null
          approved_by: string | null
          camera_id: string
          currency: string
          current_contract_version_id: string | null
          daily_rate_snapshot: number | null
          expected_location: string
          id: string
          intended_use: string
          operator_notes: string | null
          pickup_at: string
          rental_amount: number | null
          renter_id: string
          requested_at: string
          return_at: string
          security_deposit_amount: number | null
          state: Database["public"]["Enums"]["booking_state"]
          total_due: number | null
          updated_at: string
        }
        Insert: {
          approval_deadline_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          camera_id: string
          currency?: string
          current_contract_version_id?: string | null
          daily_rate_snapshot?: number | null
          expected_location: string
          id?: string
          intended_use: string
          operator_notes?: string | null
          pickup_at: string
          rental_amount?: number | null
          renter_id: string
          requested_at?: string
          return_at: string
          security_deposit_amount?: number | null
          state?: Database["public"]["Enums"]["booking_state"]
          total_due?: number | null
          updated_at?: string
        }
        Update: {
          approval_deadline_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          camera_id?: string
          currency?: string
          current_contract_version_id?: string | null
          daily_rate_snapshot?: number | null
          expected_location?: string
          id?: string
          intended_use?: string
          operator_notes?: string | null
          pickup_at?: string
          rental_amount?: number | null
          renter_id?: string
          requested_at?: string
          return_at?: string
          security_deposit_amount?: number | null
          state?: Database["public"]["Enums"]["booking_state"]
          total_due?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "public_cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_current_contract_version_fk"
            columns: ["current_contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_renter_id_fkey"
            columns: ["renter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      camera_accessories: {
        Row: {
          archived_at: string | null
          camera_id: string
          created_at: string
          id: string
          name: string
          quantity: number
          replacement_value: number | null
          sort_position: number
        }
        Insert: {
          archived_at?: string | null
          camera_id: string
          created_at?: string
          id?: string
          name: string
          quantity: number
          replacement_value?: number | null
          sort_position?: number
        }
        Update: {
          archived_at?: string | null
          camera_id?: string
          created_at?: string
          id?: string
          name?: string
          quantity?: number
          replacement_value?: number | null
          sort_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "camera_accessories_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camera_accessories_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "public_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
      camera_photos: {
        Row: {
          alt_text: string
          archived_at: string | null
          camera_id: string
          created_at: string
          id: string
          object_path: string
          sort_position: number
        }
        Insert: {
          alt_text: string
          archived_at?: string | null
          camera_id: string
          created_at?: string
          id?: string
          object_path: string
          sort_position: number
        }
        Update: {
          alt_text?: string
          archived_at?: string | null
          camera_id?: string
          created_at?: string
          id?: string
          object_path?: string
          sort_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "camera_photos_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camera_photos_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "public_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
      cameras: {
        Row: {
          acquisition_cost: number | null
          archived_at: string | null
          created_at: string
          daily_rate: number | null
          description: string | null
          id: string
          internal_notes: string | null
          name: string
          published_at: string | null
          replacement_value: number | null
          security_deposit: number | null
          serial_number: string
          slug: string
          status: Database["public"]["Enums"]["camera_status"]
          updated_at: string
        }
        Insert: {
          acquisition_cost?: number | null
          archived_at?: string | null
          created_at?: string
          daily_rate?: number | null
          description?: string | null
          id?: string
          internal_notes?: string | null
          name: string
          published_at?: string | null
          replacement_value?: number | null
          security_deposit?: number | null
          serial_number: string
          slug: string
          status?: Database["public"]["Enums"]["camera_status"]
          updated_at?: string
        }
        Update: {
          acquisition_cost?: number | null
          archived_at?: string | null
          created_at?: string
          daily_rate?: number | null
          description?: string | null
          id?: string
          internal_notes?: string | null
          name?: string
          published_at?: string | null
          replacement_value?: number | null
          security_deposit?: number | null
          serial_number?: string
          slug?: string
          status?: Database["public"]["Enums"]["camera_status"]
          updated_at?: string
        }
        Relationships: []
      }
      condition_photos: {
        Row: {
          byte_size: number
          condition_report_id: string
          created_at: string
          deleted_at: string | null
          deletion_requested_at: string | null
          evidence_category: string
          id: string
          media_type: string
          object_path: string
          retention_until: string | null
          sha256: string
          supersedes_id: string | null
          verified_deleted_at: string | null
        }
        Insert: {
          byte_size: number
          condition_report_id: string
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          evidence_category: string
          id?: string
          media_type: string
          object_path: string
          retention_until?: string | null
          sha256: string
          supersedes_id?: string | null
          verified_deleted_at?: string | null
        }
        Update: {
          byte_size?: number
          condition_report_id?: string
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          evidence_category?: string
          id?: string
          media_type?: string
          object_path?: string
          retention_until?: string | null
          sha256?: string
          supersedes_id?: string | null
          verified_deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "condition_photos_condition_report_id_fkey"
            columns: ["condition_report_id"]
            isOneToOne: false
            referencedRelation: "condition_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_photos_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "condition_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      condition_reports: {
        Row: {
          accessory_checklist_snapshot: Json
          camera_condition_summary: string
          created_at: string
          handoff_id: string
          has_damage: boolean
          has_missing_items: boolean
          id: string
          notes: string | null
          reported_by: string
        }
        Insert: {
          accessory_checklist_snapshot: Json
          camera_condition_summary: string
          created_at?: string
          handoff_id: string
          has_damage?: boolean
          has_missing_items?: boolean
          id?: string
          notes?: string | null
          reported_by: string
        }
        Update: {
          accessory_checklist_snapshot?: Json
          camera_condition_summary?: string
          created_at?: string
          handoff_id?: string
          has_damage?: boolean
          has_missing_items?: boolean
          id?: string
          notes?: string | null
          reported_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "condition_reports_handoff_id_fkey"
            columns: ["handoff_id"]
            isOneToOne: true
            referencedRelation: "handoffs"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          acknowledged_content_sha256: string
          attestation_text: string
          contract_version_id: string
          id: string
          renter_id: string
          request_ip_digest: string | null
          signature_intent: string
          signed_at: string
          user_agent_digest: string | null
        }
        Insert: {
          acknowledged_content_sha256: string
          attestation_text: string
          contract_version_id: string
          id?: string
          renter_id: string
          request_ip_digest?: string | null
          signature_intent: string
          signed_at?: string
          user_agent_digest?: string | null
        }
        Update: {
          acknowledged_content_sha256?: string
          attestation_text?: string
          contract_version_id?: string
          id?: string
          renter_id?: string
          request_ip_digest?: string | null
          signature_intent?: string
          signed_at?: string
          user_agent_digest?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_renter_id_fkey"
            columns: ["renter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          activated_at: string | null
          approved_at: string | null
          approved_by: string | null
          content_sha256: string
          created_at: string
          created_by: string
          deactivated_at: string | null
          id: string
          schema_version: number
          terms: Json
          version: string
        }
        Insert: {
          activated_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          content_sha256: string
          created_at?: string
          created_by: string
          deactivated_at?: string | null
          id?: string
          schema_version: number
          terms: Json
          version: string
        }
        Update: {
          activated_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          content_sha256?: string
          created_at?: string
          created_by?: string
          deactivated_at?: string | null
          id?: string
          schema_version?: number
          terms?: Json
          version?: string
        }
        Relationships: []
      }
      contract_versions: {
        Row: {
          booking_id: string
          content_sha256: string
          id: string
          issued_at: string
          issued_by: string
          rendered_pdf_path: string | null
          snapshot: Json
          snapshot_schema_version: number
          status: Database["public"]["Enums"]["contract_version_status"]
          supersedes_id: string | null
          template_id: string
          version_no: number
        }
        Insert: {
          booking_id: string
          content_sha256: string
          id?: string
          issued_at?: string
          issued_by: string
          rendered_pdf_path?: string | null
          snapshot: Json
          snapshot_schema_version: number
          status?: Database["public"]["Enums"]["contract_version_status"]
          supersedes_id?: string | null
          template_id: string
          version_no: number
        }
        Update: {
          booking_id?: string
          content_sha256?: string
          id?: string
          issued_at?: string
          issued_by?: string
          rendered_pdf_path?: string | null
          snapshot?: Json
          snapshot_schema_version?: number
          status?: Database["public"]["Enums"]["contract_version_status"]
          supersedes_id?: string | null
          template_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_settlements: {
        Row: {
          booking_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          deduction_amount: number
          deduction_reason: string | null
          held_amount: number
          id: string
          refund_amount: number
          refund_transaction_id: string | null
          status: Database["public"]["Enums"]["deposit_settlement_status"]
          supersedes_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          deduction_amount?: number
          deduction_reason?: string | null
          held_amount: number
          id?: string
          refund_amount?: number
          refund_transaction_id?: string | null
          status?: Database["public"]["Enums"]["deposit_settlement_status"]
          supersedes_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          deduction_amount?: number
          deduction_reason?: string | null
          held_amount?: number
          id?: string
          refund_amount?: number
          refund_transaction_id?: string | null
          status?: Database["public"]["Enums"]["deposit_settlement_status"]
          supersedes_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposit_settlements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_settlements_refund_transaction_id_fkey"
            columns: ["refund_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_settlements_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "deposit_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      handoffs: {
        Row: {
          accessory_checklist_completed: boolean
          actual_at: string
          booking_id: string
          camera_serial_checked: boolean
          conducted_at: string
          conducted_by: string
          id: string
          named_renter_present: boolean | null
          notes: string | null
          original_id_checked: boolean | null
          original_id_matched: boolean | null
          type: Database["public"]["Enums"]["handoff_type"]
        }
        Insert: {
          accessory_checklist_completed: boolean
          actual_at: string
          booking_id: string
          camera_serial_checked: boolean
          conducted_at?: string
          conducted_by: string
          id?: string
          named_renter_present?: boolean | null
          notes?: string | null
          original_id_checked?: boolean | null
          original_id_matched?: boolean | null
          type: Database["public"]["Enums"]["handoff_type"]
        }
        Update: {
          accessory_checklist_completed?: boolean
          actual_at?: string
          booking_id?: string
          camera_serial_checked?: boolean
          conducted_at?: string
          conducted_by?: string
          id?: string
          named_renter_present?: boolean | null
          notes?: string | null
          original_id_checked?: boolean | null
          original_id_matched?: boolean | null
          type?: Database["public"]["Enums"]["handoff_type"]
        }
        Relationships: [
          {
            foreignKeyName: "handoffs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["payment_allocation_kind"]
          transaction_id: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["payment_allocation_kind"]
          transaction_id: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["payment_allocation_kind"]
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_proofs: {
        Row: {
          byte_size: number
          created_at: string
          deleted_at: string | null
          deletion_requested_at: string | null
          id: string
          media_type: string
          object_path: string
          owner_user_id: string
          retention_until: string | null
          sha256: string
          supersedes_id: string | null
          transaction_id: string
          verified_deleted_at: string | null
        }
        Insert: {
          byte_size: number
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          id?: string
          media_type: string
          object_path: string
          owner_user_id: string
          retention_until?: string | null
          sha256: string
          supersedes_id?: string | null
          transaction_id: string
          verified_deleted_at?: string | null
        }
        Update: {
          byte_size?: number
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          id?: string
          media_type?: string
          object_path?: string
          owner_user_id?: string
          retention_until?: string | null
          sha256?: string
          supersedes_id?: string | null
          transaction_id?: string
          verified_deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_proofs_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "payment_proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          booking_id: string
          counterparty_display_name: string
          currency: string
          decided_at: string | null
          decided_by: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          id: string
          method: string
          reference: string
          reference_normalized: string | null
          rejection_reason: string | null
          reversal_of: string | null
          status: Database["public"]["Enums"]["payment_status"]
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          amount: number
          booking_id: string
          counterparty_display_name: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          id?: string
          method?: string
          reference: string
          reference_normalized?: string | null
          rejection_reason?: string | null
          reversal_of?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          amount?: number
          booking_id?: string
          counterparty_display_name?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          direction?: Database["public"]["Enums"]["payment_direction"]
          id?: string
          method?: string
          reference?: string
          reference_normalized?: string | null
          rejection_reason?: string | null
          reversal_of?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          created_at: string
          legal_name: string
          phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string
          legal_name: string
          phone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string
          legal_name?: string
          phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      verification_documents: {
        Row: {
          byte_size: number
          created_at: string
          deleted_at: string | null
          deletion_requested_at: string | null
          id: string
          media_type: string
          object_path: string
          owner_user_id: string
          retention_until: string | null
          sha256: string
          supersedes_id: string | null
          verification_record_id: string
          verified_deleted_at: string | null
        }
        Insert: {
          byte_size: number
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          id?: string
          media_type: string
          object_path: string
          owner_user_id: string
          retention_until?: string | null
          sha256: string
          supersedes_id?: string | null
          verification_record_id: string
          verified_deleted_at?: string | null
        }
        Update: {
          byte_size?: number
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          id?: string
          media_type?: string
          object_path?: string
          owner_user_id?: string
          retention_until?: string | null
          sha256?: string
          supersedes_id?: string | null
          verification_record_id?: string
          verified_deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_documents_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "verification_documents_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "verification_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_documents_verification_record_id_fkey"
            columns: ["verification_record_id"]
            isOneToOne: false
            referencedRelation: "verification_records"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_records: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          document_expiration_date: string | null
          id: string
          id_type: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["verification_status"]
          submitted_at: string
          supersedes_id: string | null
          user_id: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          document_expiration_date?: string | null
          id?: string
          id_type: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          submitted_at?: string
          supersedes_id?: string | null
          user_id: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          document_expiration_date?: string | null
          id?: string
          id_type?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          submitted_at?: string
          supersedes_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_records_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "verification_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      public_availability: {
        Row: {
          camera_id: string | null
          ends_at: string | null
          reason: string | null
          starts_at: string | null
        }
        Insert: {
          camera_id?: string | null
          ends_at?: string | null
          reason?: never
          starts_at?: string | null
        }
        Update: {
          camera_id?: string | null
          ends_at?: string | null
          reason?: never
          starts_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "public_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
      public_camera_photos: {
        Row: {
          alt_text: string | null
          camera_id: string | null
          id: string | null
          object_path: string | null
          sort_position: number | null
        }
        Relationships: [
          {
            foreignKeyName: "camera_photos_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camera_photos_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "public_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
      public_cameras: {
        Row: {
          daily_rate: number | null
          description: string | null
          id: string | null
          name: string | null
          published_at: string | null
          security_deposit: number | null
          slug: string | null
        }
        Insert: {
          daily_rate?: number | null
          description?: string | null
          id?: string | null
          name?: string | null
          published_at?: string | null
          security_deposit?: number | null
          slug?: string | null
        }
        Update: {
          daily_rate?: number | null
          description?: string | null
          id?: string | null
          name?: string | null
          published_at?: string | null
          security_deposit?: number | null
          slug?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      account_status: "active" | "suspended"
      availability_block_kind: "booking" | "maintenance" | "manual"
      booking_actor_type: "renter" | "admin" | "system"
      booking_state:
        | "FOR_REVIEW"
        | "CONTRACT_PENDING"
        | "TO_PAY"
        | "PAYMENT_REVIEW"
        | "CONFIRMED"
        | "ACTIVE"
        | "RETURN_REVIEW"
        | "ISSUE_REVIEW"
        | "COMPLETED"
        | "REJECTED"
        | "EXPIRED"
        | "CANCELLED"
      camera_status: "draft" | "published" | "archived"
      cancellation_disposition: "pending" | "accepted" | "declined"
      contract_version_status: "issued" | "superseded" | "voided"
      deposit_settlement_status: "pending" | "final" | "reversed"
      handoff_type: "pickup" | "return"
      payment_allocation_kind:
        | "rental_payment"
        | "security_deposit"
        | "deposit_refund"
      payment_direction: "incoming" | "outgoing"
      payment_status: "submitted" | "verified" | "rejected"
      verification_status: "pending" | "verified" | "rejected" | "expired"
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
  api: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["active", "suspended"],
      availability_block_kind: ["booking", "maintenance", "manual"],
      booking_actor_type: ["renter", "admin", "system"],
      booking_state: [
        "FOR_REVIEW",
        "CONTRACT_PENDING",
        "TO_PAY",
        "PAYMENT_REVIEW",
        "CONFIRMED",
        "ACTIVE",
        "RETURN_REVIEW",
        "ISSUE_REVIEW",
        "COMPLETED",
        "REJECTED",
        "EXPIRED",
        "CANCELLED",
      ],
      camera_status: ["draft", "published", "archived"],
      cancellation_disposition: ["pending", "accepted", "declined"],
      contract_version_status: ["issued", "superseded", "voided"],
      deposit_settlement_status: ["pending", "final", "reversed"],
      handoff_type: ["pickup", "return"],
      payment_allocation_kind: [
        "rental_payment",
        "security_deposit",
        "deposit_refund",
      ],
      payment_direction: ["incoming", "outgoing"],
      payment_status: ["submitted", "verified", "rejected"],
      verification_status: ["pending", "verified", "rejected", "expired"],
    },
  },
} as const
