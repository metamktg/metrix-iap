// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Supabase Stub Client
// TODO: real Supabase project not connected this pass.
// This file is a typed stub only. All data comes from mock-data.ts.
// Wire the real client here when Supabase credentials are available.
// ═══════════════════════════════════════════════════════════════════════

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["organizations"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
      };
      workspaces: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          type: string;
          slug: string;
          health_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["workspaces"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["workspaces"]["Insert"]>;
      };
      ad_accounts: {
        Row: {
          id: string;
          workspace_id: string;
          platform: string;
          account_name: string;
          status: string;
          spend_analyzed_usd: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["ad_accounts"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["ad_accounts"]["Insert"]>;
      };
      analysis_runs: {
        Row: {
          id: string;
          workspace_id: string;
          ad_account_id: string;
          status: string;
          created_at: string;
          completed_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["analysis_runs"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["analysis_runs"]["Insert"]>;
      };
      decision_feed_items: {
        Row: {
          id: string;
          run_id: string;
          workspace_id: string;
          decision_type: string;
          tier: number;
          confidence_label: string;
          status: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["decision_feed_items"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["decision_feed_items"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// TODO: real Supabase project not connected this pass.
// When ready, replace this stub with:
//   import { createClient } from '@supabase/supabase-js';
//   export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

type StubQueryBuilder = {
  select: (...args: unknown[]) => StubQueryBuilder;
  insert: (...args: unknown[]) => StubQueryBuilder;
  update: (...args: unknown[]) => StubQueryBuilder;
  delete: () => StubQueryBuilder;
  eq: (...args: unknown[]) => StubQueryBuilder;
  neq: (...args: unknown[]) => StubQueryBuilder;
  order: (...args: unknown[]) => StubQueryBuilder;
  limit: (...args: unknown[]) => StubQueryBuilder;
  single: () => Promise<{ data: null; error: { message: string } }>;
  then: (resolve: (val: { data: null; error: { message: string } }) => void) => void;
};

const STUB_ERROR = { message: "Supabase not connected — using mock data" };

function makeStubBuilder(): StubQueryBuilder {
  const builder: StubQueryBuilder = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    neq: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => ({ data: null, error: STUB_ERROR }),
    then: (resolve) => resolve({ data: null, error: STUB_ERROR }),
  };
  return builder;
}

export const supabase = {
  from: (_table: string) => makeStubBuilder(),
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    signIn: async () => ({ data: null, error: STUB_ERROR }),
    signOut: async () => ({ error: null }),
  },
  storage: {
    from: (_bucket: string) => ({
      upload: async () => ({ data: null, error: STUB_ERROR }),
      download: async () => ({ data: null, error: STUB_ERROR }),
      getPublicUrl: (_path: string) => ({ data: { publicUrl: "" } }),
    }),
  },
};
