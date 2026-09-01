// ─── Objective labels (display only) ────────────────────────────────────
// The objective is DERIVED from each ad's Meta result type by the analysis
// run (owner decision 2026-09-01) — it is never asked, and there is no
// control that sets it. These entries only give a derived key its label,
// icon, and terminal metric for read-only display. An account can be
// derived to MORE than one at once. Backing ids stay stable since they are
// wired through the seed and cohortMeta.ts.
import { Store, Target, MapPin, Smartphone } from "lucide-react";
import type { ObjectiveKey } from "@/lib/data/seedTypes";

export const OBJECTIVE_OPTIONS: { id: ObjectiveKey; label: string; desc: string; Icon: typeof Store }[] = [
  { id: "ecommerce", label: "Sales", desc: "Ecommerce purchases. Terminal metric: purchases / ROAS", Icon: Store },
  { id: "lead_gen", label: "Leads", desc: "Lead generation. Terminal metric: leads / cost per lead", Icon: Target },
  { id: "service", label: "Local business", desc: "Bookings & appointments. Terminal metric: bookings / cost per booking", Icon: MapPin },
  { id: "app", label: "Apps", desc: "App installs. Terminal metric: installs / cost per install", Icon: Smartphone },
];
