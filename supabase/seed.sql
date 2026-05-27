-- =============================================================================
-- BRAHMO Citation Safety Engine — assessment-aligned seed data
-- Run after schema.sql. Safe to re-run (upserts on natural keys).
-- =============================================================================

-- Remove patterns not in the BRAHMO assessment (6 reporters only)
DELETE FROM public.citation_patterns
WHERE pattern_name NOT IN (
  'SCC',
  'SCC_OnLine',
  'AIR',
  'Cri_LJ',
  'SCR',
  'MANU'
);

-- -----------------------------------------------------------------------------
-- 1. Citation regex patterns (6) — assessment reporters only
-- -----------------------------------------------------------------------------
INSERT INTO public.citation_patterns (
  id,
  pattern_name,
  regex,
  format_template,
  example,
  jurisdiction
) VALUES
  -- SCC: prior regex required YYYY at match start, so "(2004) 6 SCC …" failed.
  -- Now: optional "(YYYY)" or YYYY, volume, flexible \s* before SCC and page (pairs with JS (?i)→gi).
  (
    'a1000001-0001-4001-8001-000000000001',
    'SCC',
    '(?i)(?:\(\s*(\d{4})\s*\)|(\d{4}))\s*(\d+)\s*SCC\s*(\d+)',
    '({year}) {volume} SCC {page}',
    '(2004) 6 SCC 224',
    'India'
  ),
  (
    'a1000001-0001-4001-8001-000000000002',
    'SCC_OnLine',
    '(?i)(\d{4})\s+SCC\s+OnLine\s+(SC|Del|Bom|All|Mad|Ker|Cal|[A-Za-z]+)\s+(\d+)',
    '{year} SCC OnLine {court} {page}',
    '2024 SCC OnLine SC 123',
    'India'
  ),
  (
    'a1000001-0001-4001-8001-000000000003',
    'AIR',
    '(?i)AIR\s+(\d{4})\s+(SC|All|Bom|Cal|Del|Mad|Ker|Kant|Pat|Guj|Raj|MP|HP|Ori|AP|Punj|J&K|[A-Za-z&]+)\s+(\d+)',
    'AIR {year} {court} {page}',
    'AIR 2004 SC 3358',
    'India'
  ),
  (
    'a1000001-0001-4001-8001-000000000004',
    'Cri_LJ',
    '(?i)(\d{4})\s+Cri\.?\s*LJ\.?\s+(\d+)',
    '{year} Cri LJ {page}',
    '2023 Cri LJ 456',
    'India'
  ),
  -- SCR: prior \(?\d+\)? before SCR required digits and broke "1995 SCR 646".
  -- Now: "(YYYY) vol SCR page" or "YYYY SCR page" with optional volume and flexible spacing.
  (
    'a1000001-0001-4001-8001-000000000005',
    'SCR',
    '(?i)(?:\(\s*(\d{4})\s*\)\s*(\d+)\s*|(\d{4})\s*)SCR\s*(\d+)',
    '{year} SCR {page}',
    '1995 SCR 646',
    'India'
  ),
  -- MANU: prior pattern required a fifth path segment (…/YYYY/NNN); assessment uses court/serial/year only.
  (
    'a1000001-0001-4001-8001-000000000006',
    'MANU',
    '(?i)MANU/[A-Za-z]+/[A-Za-z0-9]+/\d{4}',
    'MANU/{court}/{serial}/{year}',
    'MANU/MH/1234/2023',
    'India'
  )
ON CONFLICT (pattern_name) DO UPDATE SET
  regex           = EXCLUDED.regex,
  format_template = EXCLUDED.format_template,
  example         = EXCLUDED.example,
  jurisdiction    = EXCLUDED.jurisdiction,
  updated_at      = NOW();

-- Legacy natural keys superseded by assessment (e.g. slot 015 was IPC 500, now IPC 499)
DELETE FROM public.section_mappings
WHERE (old_act, old_section) IN (
  ('IPC', '500')
);

-- Drop rows outside the 30 stable assessment ids
DELETE FROM public.section_mappings
WHERE id NOT IN (
  'b2000001-0001-4001-8001-000000000001',
  'b2000001-0001-4001-8001-000000000002',
  'b2000001-0001-4001-8001-000000000003',
  'b2000001-0001-4001-8001-000000000004',
  'b2000001-0001-4001-8001-000000000005',
  'b2000001-0001-4001-8001-000000000006',
  'b2000001-0001-4001-8001-000000000007',
  'b2000001-0001-4001-8001-000000000008',
  'b2000001-0001-4001-8001-000000000009',
  'b2000001-0001-4001-8001-000000000010',
  'b2000001-0001-4001-8001-000000000011',
  'b2000001-0001-4001-8001-000000000012',
  'b2000001-0001-4001-8001-000000000013',
  'b2000001-0001-4001-8001-000000000014',
  'b2000001-0001-4001-8001-000000000015',
  'b2000001-0001-4001-8001-000000000016',
  'b2000001-0001-4001-8001-000000000017',
  'b2000001-0001-4001-8001-000000000018',
  'b2000001-0001-4001-8001-000000000019',
  'b2000001-0001-4001-8001-000000000020',
  'b2000001-0001-4001-8001-000000000021',
  'b2000001-0001-4001-8001-000000000022',
  'b2000001-0001-4001-8001-000000000023',
  'b2000001-0001-4001-8001-000000000024',
  'b2000001-0001-4001-8001-000000000025',
  'b2000001-0001-4001-8001-000000000026',
  'b2000001-0001-4001-8001-000000000027',
  'b2000001-0001-4001-8001-000000000028',
  'b2000001-0001-4001-8001-000000000029',
  'b2000001-0001-4001-8001-000000000030'
);

-- -----------------------------------------------------------------------------
-- 2. Section mappings (30) — BRAHMO assessment v2.0 (IPC/CrPC/IEA → BNS/BNSS/BSA)
-- -----------------------------------------------------------------------------
INSERT INTO public.section_mappings (
  id,
  old_section,
  new_section,
  old_act,
  new_act
) VALUES
  -- IPC → BNS (21)
  ('b2000001-0001-4001-8001-000000000001', '302',   '101',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000002', '304',   '105',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000003', '304A',  '106',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000004', '304B',  '80',     'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000005', '306',   '108',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000006', '307',   '109',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000007', '323',   '115',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000008', '326',   '119',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000009', '354',   '74',     'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000010', '376',   '63',     'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000011', '379',   '303',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000012', '384',   '308',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000013', '392',   '309',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000014', '406',   '316',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000015', '420',   '318',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000016', '467',   '336',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000017', '498A',  '85',     'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000018', '499',   '356',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000019', '506',   '351',    'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000020', '34',    '3(5)',   'IPC', 'BNS'),
  ('b2000001-0001-4001-8001-000000000021', '120B',  '61',     'IPC', 'BNS'),

  -- CrPC → BNSS (8)
  ('b2000001-0001-4001-8001-000000000022', '125',   '144',    'CrPC', 'BNSS'),
  ('b2000001-0001-4001-8001-000000000023', '154',   '173',    'CrPC', 'BNSS'),
  ('b2000001-0001-4001-8001-000000000024', '156(3)', '175(3)', 'CrPC', 'BNSS'),
  ('b2000001-0001-4001-8001-000000000025', '167',   '187',    'CrPC', 'BNSS'),
  ('b2000001-0001-4001-8001-000000000026', '437',   '480',    'CrPC', 'BNSS'),
  ('b2000001-0001-4001-8001-000000000027', '438',   '482',    'CrPC', 'BNSS'),
  ('b2000001-0001-4001-8001-000000000028', '439',   '483',    'CrPC', 'BNSS'),
  ('b2000001-0001-4001-8001-000000000029', '482',   '528',    'CrPC', 'BNSS'),

  -- IEA → BSA (1)
  ('b2000001-0001-4001-8001-000000000030', '65B',   '63',     'IEA', 'BSA')
ON CONFLICT (id) DO UPDATE SET
  old_section = EXCLUDED.old_section,
  new_section = EXCLUDED.new_section,
  old_act     = EXCLUDED.old_act,
  new_act     = EXCLUDED.new_act,
  updated_at  = NOW();

-- -----------------------------------------------------------------------------
-- 3. Sample verification cache rows (3)
-- -----------------------------------------------------------------------------
INSERT INTO public.verification_cache (
  id,
  citation_text,
  status,
  verified_at,
  ik_doc_id,
  case_name,
  metadata
) VALUES
  (
    'c3000001-0001-4001-8001-000000000001',
    'AIR 2004 SC 3358',
    'VERIFIED',
    '2024-05-05 00:00:00+00',
    '1787363',
    'Brahmo Samaj Education Society v. State of West Bengal',
    '{"reporter":"AIR","year":2004,"court":"SC","page":"3358","scc_equivalent":"(2004) 6 SCC 224","source":"indiankanoon.org"}'::jsonb
  ),
  (
    'c3000001-0001-4001-8001-000000000002',
    '1995 SCC (4) 646',
    'VERIFIED',
    '1995-07-02 00:00:00+00',
    '967081',
    'Bramchari Sidheswar Bhai v. State of West Bengal',
    '{"reporter":"SCC","year":1995,"volume":"4","page":"646","air_equivalent":"1995 AIR 2089","source":"indiankanoon.org"}'::jsonb
  ),
  (
    'c3000001-0001-4001-8001-000000000003',
    'Mercy v. Mankind (fictitious)',
    'UNVERIFIED',
    NULL,
    NULL,
    NULL,
    '{"note":"Hallucinated citation flagged during verification","flagged_by":"citation-check","confidence":0.12}'::jsonb
  )
ON CONFLICT (citation_text) DO UPDATE SET
  status      = EXCLUDED.status,
  verified_at = EXCLUDED.verified_at,
  ik_doc_id   = EXCLUDED.ik_doc_id,
  case_name   = EXCLUDED.case_name,
  metadata    = EXCLUDED.metadata,
  updated_at  = NOW();
