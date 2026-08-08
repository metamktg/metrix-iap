// ─── Business model options (account config) ────────────────────────────
// Framed as the conversion objective asked at account setup: "what are you
// running ads towards?" — sales, leads, apps, or local business. Backing
// cohort ids (ecommerce/lead_gen/service/app) stay stable since they're
// wired through the API, seed, and cohortMeta.ts; only the user-facing
// label/description reflects the objective framing.
import { Store, Target, MapPin, Smartphone } from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";

export const COHORT_OPTIONS: { id: NonNullable<AdAccount["cohort"]>; label: string; desc: string; Icon: typeof Store }[] = [
  { id: "ecommerce", label: "Sales", desc: "Ecommerce purchases. Terminal metric: purchases / ROAS", Icon: Store },
  { id: "lead_gen", label: "Leads", desc: "Lead generation. Terminal metric: leads / cost per lead", Icon: Target },
  { id: "service", label: "Local business", desc: "Bookings & appointments. Terminal metric: bookings / cost per booking", Icon: MapPin },
  { id: "app", label: "Apps", desc: "App installs. Terminal metric: installs / cost per install", Icon: Smartphone },
];
