-- METRIX IAP — Seed 0008: cohort_definitions (canonical registry: METRIX_Cohort_Architecture_v1.md)
-- Illustrative seed set, not a fixed taxonomy — a new business model is a new
-- row, no schema change or deployment required.
-- lead_gen and service are two distinct cohort_definitions rows that both
-- point at required_metric_block = 'service_18' (decision resolved July 6, 2026
-- — Option 2; no lead_gen_18 block exists).

insert into cohort_definitions
  (cohort_key, label, funnel_stages, intent_score_weights, terminal_metric, terminal_metric_direction, required_metric_block, schema_version)
values
  (
    'ecommerce',
    'Ecommerce',
    '["click","add_to_cart","initiate_checkout","purchase"]',
    '{"click":1,"add_to_cart":2,"initiate_checkout":5,"purchase":10}',
    'cost_per_purchase',
    'lower_is_better',
    'ecommerce_24',
    'v1.0'
  ),
  (
    'lead_gen',
    'Lead Generation',
    '["click","lead_submit","qualified","close"]',
    '{"click":1,"lead_submit":5,"qualified":8,"close":10}',
    'cost_per_qualified_lead',
    'lower_is_better',
    'service_18',
    'v1.0'
  ),
  (
    'service',
    'Service / Booking',
    '["click","inquiry","consult_booked","close"]',
    '{"click":1,"inquiry":4,"consult_booked":7,"close":10}',
    'cost_per_booking',
    'lower_is_better',
    'service_18',
    'v1.0'
  ),
  (
    'app',
    'App',
    '["click","install","activation","retained"]',
    '{"click":1,"install":3,"activation":6,"retained":10}',
    'cost_per_activation',
    'lower_is_better',
    'app_22',
    'v1.0'
  );
