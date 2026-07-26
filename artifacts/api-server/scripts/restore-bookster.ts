/**
 * One-time restore script: re-runs analysis for bookster using its staged CSVs.
 * Run with: npx tsx scripts/restore-bookster.ts
 */
import { startManualAnalysis } from "../src/lib/analysisEngine";

async function main() {
  console.log("Starting analysis for bookster (date_range=all)…");
  try {
    const runId = await startManualAnalysis("bookster", "all", "restore-script");
    console.log("Analysis started, runId:", runId);

    // Poll until the run completes (up to 5 minutes)
    const { getLatestAnalysisRun } = await import("../src/lib/analysisEngine");
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const run = await getLatestAnalysisRun("bookster");
      const status = run?.status ?? "unknown";
      const pct = run?.progress_pct ?? 0;
      console.log(`  status=${status} progress=${pct}%`);
      if (status === "success") {
        console.log("✅ Analysis completed successfully.");
        process.exit(0);
      }
      if (status === "error") {
        console.error("❌ Analysis failed:", run);
        process.exit(1);
      }
    }
    console.error("❌ Timed out waiting for analysis to complete.");
    process.exit(1);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
