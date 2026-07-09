// METRIX IAP Phase 0 security tests (Master Prompt §3 Phase 0 gate).
//
// Runs against the live Supabase database via SUPABASE_DB_URL:
//   1. RLS is ENABLED on all 22 official tables (default Supabase grants give
//      `authenticated` full DML, so a table without relrowsecurity is open).
//   2. RLS allow/deny: a member reads their client's rows; a non-member
//      cannot; a client_viewer cannot write; an operator can.
//   3. No-ROAS alert constraint (alert_rules.metric <> 'roas').
//   4. BSIL budget-scope constraint (campaign/ad_set only).
//   5. Manual creative intake requires >= 5 assets.
//   6. learning_registry approval gate (BEFORE INSERT trigger — binds even
//      roles that bypass RLS).
//   7. Migration runner bookkeeping: every migration/seed file is recorded in
//      _metrix_migrations with a matching checksum (re-run would be a no-op).
//
// Every mutation happens inside a transaction that is ROLLED BACK, so the
// live database is left untouched. If the official schema has not been
// deployed yet (no _metrix_migrations table), the suite fails loudly — the
// Phase 0 gate is "tests pass against the deployed schema", not "tests
// skipped".

import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_DIR = path.resolve(__dirname, "../../../../../supabase");

const OFFICIAL_TABLES = [
  "organizations",
  "org_members",
  "clients",
  "client_memberships",
  "cohort_definitions",
  "client_enabled_cohorts",
  "analysis_runs",
  "analysis_run_cohorts",
  "analysis_run_inputs",
  "analysis_run_stages",
  "intelligence_cards",
  "creative_briefs",
  "reports",
  "onboarding_creative_intake",
  "creative_alignment_checks",
  "alert_rules",
  "bsil_suggestions",
  "review_events",
  "human_edits",
  "approval_events",
  "learning_registry",
  "global_variable_registry",
] as const;

const dbUrl = process.env.SUPABASE_DB_URL;

describe("METRIX official schema — Phase 0 security", () => {
  if (!dbUrl) {
    it("requires SUPABASE_DB_URL", () => {
      throw new Error("SUPABASE_DB_URL is not set — cannot run Phase 0 security tests.");
    });
    return;
  }

  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    const deployed = await client.query(
      `select 1 from information_schema.tables
        where table_schema = 'public' and table_name = '_metrix_migrations'`,
    );
    if (deployed.rowCount === 0) {
      throw new Error(
        "Official METRIX schema is not deployed (_metrix_migrations missing). " +
          "Run: pnpm --filter @workspace/scripts run migrate:metrix-official",
      );
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  // --- helpers -------------------------------------------------------------

  /** Run fn inside a transaction that is always rolled back. */
  async function inRolledBackTx(fn: () => Promise<void>): Promise<void> {
    await client.query("begin");
    try {
      await fn();
    } finally {
      await client.query("rollback");
    }
  }

  /** Impersonate a Supabase `authenticated` user inside the current tx. */
  async function actAs(userId: string): Promise<void> {
    await client.query(
      `select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: userId, role: "authenticated" })],
    );
    await client.query(`set local role authenticated`);
  }

  /** Drop back to the superuser/owner role inside the current tx. */
  async function actAsService(): Promise<void> {
    await client.query(`reset role`);
  }

  type Tenancy = {
    orgId: string;
    clientId: string;
    otherClientId: string;
    operatorId: string;
    viewerId: string;
    outsiderId: string;
    runId: string;
  };

  /** Seed two clients + three auth users (operator, viewer, outsider). */
  async function seedTenancy(): Promise<Tenancy> {
    const operatorId = randomUUID();
    const viewerId = randomUUID();
    const outsiderId = randomUUID();
    for (const uid of [operatorId, viewerId, outsiderId]) {
      await client.query(
        `insert into auth.users (id, email) values ($1, $2)`,
        [uid, `${uid}@test.invalid`],
      );
    }
    const org = await client.query(
      `insert into organizations (name) values ('Test Org') returning id`,
    );
    const orgId = org.rows[0].id as string;
    const c1 = await client.query(
      `insert into clients (org_id, name, client_code) values ($1, 'Client A', $2) returning id`,
      [orgId, `TA_${randomUUID().slice(0, 8)}`],
    );
    const clientId = c1.rows[0].id as string;
    const c2 = await client.query(
      `insert into clients (org_id, name, client_code) values ($1, 'Client B', $2) returning id`,
      [orgId, `TB_${randomUUID().slice(0, 8)}`],
    );
    const otherClientId = c2.rows[0].id as string;
    await client.query(
      `insert into client_memberships (client_id, user_id, org_id, role) values
         ($1, $2, $3, 'operator'), ($1, $4, $3, 'client_viewer'), ($5, $6, $3, 'operator')`,
      [clientId, operatorId, orgId, viewerId, otherClientId, outsiderId],
    );
    const run = await client.query(
      `insert into analysis_runs (client_id, engine_version) values ($1, 'test') returning id`,
      [clientId],
    );
    return {
      orgId,
      clientId,
      otherClientId,
      operatorId,
      viewerId,
      outsiderId,
      runId: run.rows[0].id as string,
    };
  }

  async function insertCard(clientId: string, title: string): Promise<string> {
    const res = await client.query(
      `insert into intelligence_cards
         (client_id, card_type, title, summary, confidence_grade, contract_version, schema_version)
       values ($1, 'signal', $2, 'test', 'HIGH', 'v1', 'v1') returning id`,
      [clientId, title],
    );
    return res.rows[0].id as string;
  }

  // --- 1. RLS enabled everywhere -------------------------------------------

  it("has RLS enabled on all 22 official tables", async () => {
    const res = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
        where relnamespace = 'public'::regnamespace
          and relname = any($1::name[])`,
      [OFFICIAL_TABLES],
    );
    expect(res.rows.length).toBe(OFFICIAL_TABLES.length);
    const disabled = res.rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(disabled).toEqual([]);
  });

  // --- 2. RLS allow/deny ----------------------------------------------------

  it("member can read own client rows; non-member sees nothing", async () => {
    await inRolledBackTx(async () => {
      const t = await seedTenancy();
      await insertCard(t.clientId, "Card for A");

      await actAs(t.operatorId);
      const mine = await client.query(
        `select id from intelligence_cards where client_id = $1`,
        [t.clientId],
      );
      expect(mine.rows.length).toBe(1);

      await actAsService();
      await actAs(t.outsiderId);
      const theirs = await client.query(
        `select id from intelligence_cards where client_id = $1`,
        [t.clientId],
      );
      expect(theirs.rows.length).toBe(0);
      const clientsVisible = await client.query(
        `select id from clients where id = $1`,
        [t.clientId],
      );
      // outsider is in the same org, so client row visibility via org is
      // acceptable — but data tables must stay invisible (checked above).
      void clientsVisible;
    });
  });

  it("run-scoped child tables (analysis_run_inputs) follow the run's client", async () => {
    await inRolledBackTx(async () => {
      const t = await seedTenancy();
      await client.query(
        `insert into analysis_run_inputs (analysis_run_id, input_type) values ($1, 'api_snapshot')`,
        [t.runId],
      );

      await actAs(t.operatorId);
      const mine = await client.query(
        `select id from analysis_run_inputs where analysis_run_id = $1`,
        [t.runId],
      );
      expect(mine.rows.length).toBe(1);

      await actAsService();
      await actAs(t.outsiderId);
      const theirs = await client.query(
        `select id from analysis_run_inputs where analysis_run_id = $1`,
        [t.runId],
      );
      expect(theirs.rows.length).toBe(0);
    });
  });

  it("client_viewer is read-only; operator can write", async () => {
    await inRolledBackTx(async () => {
      const t = await seedTenancy();
      const cardId = await insertCard(t.clientId, "Writable?");

      await actAs(t.viewerId);
      const readable = await client.query(
        `select id from intelligence_cards where id = $1`,
        [cardId],
      );
      expect(readable.rows.length).toBe(1);
      // RLS filters the row out of UPDATE's scope → 0 rows affected.
      const viewerUpdate = await client.query(
        `update intelligence_cards set title = 'hacked' where id = $1`,
        [cardId],
      );
      expect(viewerUpdate.rowCount).toBe(0);
      await expect(
        client.query(
          `insert into intelligence_cards
             (client_id, card_type, title, summary, confidence_grade, contract_version, schema_version)
           values ($1, 'signal', 'viewer insert', 'x', 'LOW', 'v1', 'v1')`,
          [t.clientId],
        ),
      ).rejects.toThrow(/row-level security/i);

      await actAsService();
      await actAs(t.operatorId);
      const opUpdate = await client.query(
        `update intelligence_cards set title = 'edited by operator' where id = $1`,
        [cardId],
      );
      expect(opUpdate.rowCount).toBe(1);
    });
  });

  it("non-member cannot insert rows into another client's scope", async () => {
    await inRolledBackTx(async () => {
      const t = await seedTenancy();
      await actAs(t.outsiderId);
      await expect(
        client.query(
          `insert into bsil_suggestions
             (client_id, budget_scope_object, entity_id, scope_key, suggestion_type,
              confidence_grade, contract_version, schema_version)
           values ($1, 'campaign', $2, 'k', 'hold', 'LOW', 'v1', 'v1')`,
          [t.clientId, randomUUID()],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("audit tables are append-only for authenticated users (no update/delete policy)", async () => {
    await inRolledBackTx(async () => {
      const t = await seedTenancy();
      const cardId = await insertCard(t.clientId, "Reviewed card");
      const ev = await client.query(
        `insert into review_events (analysis_run_id, object_type, object_id, reviewer_id, review_status)
         values ($1, 'intelligence_card', $2, $3, 'reviewed') returning id`,
        [t.runId, cardId, t.operatorId],
      );

      await actAs(t.operatorId);
      const upd = await client.query(
        `update review_events set review_status = 'approved' where id = $1`,
        [ev.rows[0].id],
      );
      expect(upd.rowCount).toBe(0);
      const del = await client.query(`delete from review_events where id = $1`, [
        ev.rows[0].id,
      ]);
      expect(del.rowCount).toBe(0);
    });
  });

  // --- 3–5. Hard schema constraints ------------------------------------------

  it("rejects ROAS alert rules (no-ROAS-v1 constraint)", async () => {
    await inRolledBackTx(async () => {
      const t = await seedTenancy();
      await expect(
        client.query(
          `insert into alert_rules (client_id, metric) values ($1, 'roas')`,
          [t.clientId],
        ),
      ).rejects.toThrow(/check constraint/i);
      // sanity: non-roas metric is fine
      await client.query(
        `insert into alert_rules (client_id, metric) values ($1, 'cpa')`,
        [t.clientId],
      );
    });
  });

  it("rejects BSIL suggestions outside campaign/ad_set scope", async () => {
    await inRolledBackTx(async () => {
      const t = await seedTenancy();
      for (const bad of ["creative", "copy", "angle", "variable", "landing_page"]) {
        await client.query("savepoint bsil");
        await expect(
          client.query(
            `insert into bsil_suggestions
               (client_id, budget_scope_object, entity_id, scope_key, suggestion_type,
                confidence_grade, contract_version, schema_version)
             values ($1, $2, $3, 'k', 'hold', 'LOW', 'v1', 'v1')`,
            [t.clientId, bad, randomUUID()],
          ),
        ).rejects.toThrow(/check constraint/i);
        await client.query("rollback to savepoint bsil");
      }
      await client.query(
        `insert into bsil_suggestions
           (client_id, budget_scope_object, entity_id, scope_key, suggestion_type,
            confidence_grade, contract_version, schema_version)
         values ($1, 'ad_set', $2, 'k', 'hold', 'LOW', 'v1', 'v1')`,
        [t.clientId, randomUUID()],
      );
    });
  });

  it("rejects manual creative intake with fewer than 5 assets", async () => {
    await inRolledBackTx(async () => {
      const t = await seedTenancy();
      await expect(
        client.query(
          `insert into onboarding_creative_intake (client_id, intake_method, uploaded_asset_count)
           values ($1, 'manual_upload', 3)`,
          [t.clientId],
        ),
      ).rejects.toThrow(/check constraint/i);
      await client.query(
        `insert into onboarding_creative_intake (client_id, intake_method, uploaded_asset_count)
         values ($1, 'manual_upload', 5)`,
        [t.clientId],
      );
    });
  });

  // --- 6. Learning-registry approval gate ------------------------------------

  it("blocks learning_registry inserts without a learning_registry approval — even for service-level roles", async () => {
    await inRolledBackTx(async () => {
      const t = await seedTenancy();
      const cardId = await insertCard(t.clientId, "Unapproved learning source");
      // Superuser/table-owner bypasses RLS but NOT the trigger.
      await expect(
        client.query(
          `insert into learning_registry
             (client_id, source_object_type, source_object_id, learning_summary,
              contract_version, schema_version)
           values ($1, 'intelligence_card', $2, 'should be blocked', 'v1', 'v1')`,
          [t.clientId, cardId],
        ),
      ).rejects.toThrow(/approval/i);
    });
  });

  it("allows learning_registry inserts once the exact object has a learning_registry approval", async () => {
    await inRolledBackTx(async () => {
      const t = await seedTenancy();
      const cardId = await insertCard(t.clientId, "Approved learning source");
      const approval = await client.query(
        `insert into approval_events (analysis_run_id, object_type, object_id, approver_id, approved_for)
         values ($1, 'intelligence_card', $2, $3, 'learning_registry') returning id`,
        [t.runId, cardId, t.operatorId],
      );
      const inserted = await client.query(
        `insert into learning_registry
           (client_id, source_object_type, source_object_id, learning_summary,
            contract_version, schema_version)
         values ($1, 'intelligence_card', $2, 'approved learning', 'v1', 'v1')
         returning approval_event_id`,
        [t.clientId, cardId],
      );
      // Trigger backfills the approval linkage.
      expect(inserted.rows[0].approval_event_id).toBe(approval.rows[0].id);
    });
  });

  it("rejects a learning_registry insert citing an approval for a different object or purpose", async () => {
    await inRolledBackTx(async () => {
      const t = await seedTenancy();
      const cardId = await insertCard(t.clientId, "Card 1");
      const otherCardId = await insertCard(t.clientId, "Card 2");
      const wrongPurpose = await client.query(
        `insert into approval_events (analysis_run_id, object_type, object_id, approver_id, approved_for)
         values ($1, 'intelligence_card', $2, $3, 'client_report') returning id`,
        [t.runId, cardId, t.operatorId],
      );
      await client.query("savepoint gate");
      await expect(
        client.query(
          `insert into learning_registry
             (client_id, source_object_type, source_object_id, learning_summary,
              contract_version, schema_version, approval_event_id)
           values ($1, 'intelligence_card', $2, 'x', 'v1', 'v1', $3)`,
          [t.clientId, cardId, wrongPurpose.rows[0].id],
        ),
      ).rejects.toThrow(/approved_for/i);
      await client.query("rollback to savepoint gate");

      const rightPurposeWrongObject = await client.query(
        `insert into approval_events (analysis_run_id, object_type, object_id, approver_id, approved_for)
         values ($1, 'intelligence_card', $2, $3, 'learning_registry') returning id`,
        [t.runId, otherCardId, t.operatorId],
      );
      await expect(
        client.query(
          `insert into learning_registry
             (client_id, source_object_type, source_object_id, learning_summary,
              contract_version, schema_version, approval_event_id)
           values ($1, 'intelligence_card', $2, 'x', 'v1', 'v1', $3)`,
          [t.clientId, cardId, rightPurposeWrongObject.rows[0].id],
        ),
      ).rejects.toThrow(/is for/i);
    });
  });

  // --- 7. Migration bookkeeping ----------------------------------------------

  it("records every migration and seed file in _metrix_migrations with matching checksums", async () => {
    const files: Array<{ name: string; checksum: string }> = [];
    for (const dir of ["migrations", "seed"]) {
      const dirPath = path.join(SUPABASE_DIR, dir);
      const entries = (await readdir(dirPath)).filter((f) => f.endsWith(".sql")).sort();
      for (const name of entries) {
        const sql = await readFile(path.join(dirPath, name), "utf8");
        files.push({ name, checksum: createHash("sha256").update(sql).digest("hex") });
      }
    }
    expect(files.length).toBeGreaterThanOrEqual(10);

    const res = await client.query<{ filename: string; checksum: string }>(
      `select filename, checksum from _metrix_migrations`,
    );
    const recorded = new Map(res.rows.map((r) => [r.filename, r.checksum]));
    for (const f of files) {
      expect(recorded.get(f.name), `missing or drifted: ${f.name}`).toBe(f.checksum);
    }
  });
});
