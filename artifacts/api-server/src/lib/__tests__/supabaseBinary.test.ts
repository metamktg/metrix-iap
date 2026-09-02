// The staged-file byte reader has exactly two paths, and both must stay
// one-cell-per-request: PostgREST binary output through the domain-typed
// RPC, and — only when that is refused with 406 — a single row's JSON
// content. Pinned here so a refactor can never reintroduce the bulk
// `select content` that took the database down on 2026-09-02.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const supabaseState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  calls: [] as Array<{ table: string; column: string; eq: Array<[string, unknown]> }>,
}));

vi.mock("../supabase", () => ({
  getSupabaseRest: () => ({ url: "https://proj.supabase.co", serviceRoleKey: "service-key" }),
  getSupabase: () => ({
    from: (table: string) => ({
      select: (column: string) => {
        const call = { table, column, eq: [] as Array<[string, unknown]> };
        supabaseState.calls.push(call);
        const builder = {
          eq: (k: string, v: unknown) => {
            call.eq.push([k, v]);
            return builder;
          },
          limit: async () => ({ data: supabaseState.rows, error: null }),
        };
        return builder;
      },
    }),
  }),
}));
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { fetchImportContent, fetchImportChunk, decodeByteaJson } from "../supabaseBinary";

const fetchMock = vi.fn();

beforeEach(() => {
  supabaseState.rows = [];
  supabaseState.calls = [];
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function binaryResponse(bytes: Uint8Array, status = 200) {
  return new Response(bytes, { status, headers: { "content-type": "application/octet-stream" } });
}

describe("fetchImportContent", () => {
  it("reads raw bytes through the domain-typed RPC with octet-stream negotiation", async () => {
    fetchMock.mockResolvedValueOnce(binaryResponse(new Uint8Array([1, 2, 3])));
    const out = await fetchImportContent("imp-1");
    expect([...(out ?? [])]).toEqual([1, 2, 3]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://proj.supabase.co/rest/v1/rpc/manual_import_content");
    expect((init.headers as Record<string, string>)["Accept"]).toBe("application/octet-stream");
    expect(JSON.parse(String(init.body))).toEqual({ p_import_id: "imp-1" });
    expect(supabaseState.calls).toEqual([]);
  });

  it("falls back to ONE row's JSON content only when binary output is refused (406)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 406 }));
    supabaseState.rows = [{ content: "\\x0a0b" }];
    const out = await fetchImportContent("imp-2");
    expect([...(out ?? [])]).toEqual([0x0a, 0x0b]);
    expect(supabaseState.calls).toEqual([{ table: "manual_imports", column: "content", eq: [["id", "imp-2"]] }]);
  });

  it("surfaces other HTTP failures rather than pretending the row is missing", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    await expect(fetchImportContent("imp-3")).rejects.toThrow(/HTTP 500/);
  });
});

describe("fetchImportChunk", () => {
  it("addresses one chunk per request", async () => {
    fetchMock.mockResolvedValueOnce(binaryResponse(new Uint8Array([9])));
    const out = await fetchImportChunk("imp-4", 3);
    expect([...(out ?? [])]).toEqual([9]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/rpc\/manual_import_chunk_content$/);
    expect(JSON.parse(String(init.body))).toEqual({ p_import_id: "imp-4", p_chunk_index: 3 });
  });
});

describe("decodeByteaJson", () => {
  it("decodes PostgREST's hex rendering and leaves plain text alone", () => {
    expect([...decodeByteaJson("\\x4142")]).toEqual([0x41, 0x42]);
    expect(decodeByteaJson("AB").toString("utf8")).toBe("AB");
  });
});
