import type { Matter } from "@/lib/types";

export interface DemoMatter extends Matter {
  scenarioLabel: string;
}

/** Eight assessment demo scenarios — polished for submission demos. */
export const LEGAL_MATTERS: DemoMatter[] = [
  {
    id: "demo-hallucinated",
    scenarioLabel: "Hallucinated",
    name: "Hallucinated Supreme Court cite",
    description:
      "Demo: fictitious reporter citation flagged by hallucination rules and IK lookup.",
  },
  {
    id: "demo-malformed",
    scenarioLabel: "Malformed",
    name: "Malformed citation format",
    description:
      "Demo: broken SCC spacing and typos — corrected or unverified by the pipeline.",
  },
  {
    id: "demo-mixed",
    scenarioLabel: "Mixed",
    name: "Mixed valid and fake cites",
    description:
      "Demo: AIR 2004 SC 3358 (verified) alongside impossible future-year cites.",
  },
  {
    id: "demo-divorce",
    scenarioLabel: "Divorce",
    name: "Contested divorce — HMA",
    client: "Petitioner",
    description: "Family Court — Hindu Marriage Act Section 13 grounds.",
  },
  {
    id: "demo-contract",
    scenarioLabel: "Contract",
    name: "Contract breach — damages",
    client: "Commercial client",
    description:
      "Breach of contract and Section 73 Indian Contract Act remedies.",
  },
  {
    id: "demo-bail",
    scenarioLabel: "Bail",
    name: "Anticipatory bail — economic offences",
    client: "Accused",
    description:
      "SC precedents on anticipatory bail with repeated statute references.",
  },
  {
    id: "demo-probate",
    scenarioLabel: "Probate",
    name: "Probate and succession",
    client: "Executor",
    description: "Probate petition — will validity and succession law cites.",
  },
  {
    id: "demo-65b",
    scenarioLabel: "65B IEA",
    name: "Electronic evidence — Section 65B",
    description:
      "Section 65B IEA / BSA electronic record admissibility with verified cites.",
  },
];

export const DEFAULT_MATTER_ID = LEGAL_MATTERS[0].id;

export function getMatterById(matterId: string): DemoMatter | undefined {
  return LEGAL_MATTERS.find((m) => m.id === matterId);
}

export function getMatterQuery(matterId: string): string {
  const queries: Record<string, string> = {
    "demo-hallucinated":
      "Summarize the holding in Mercy v. Mankind (2024) 12 SCC 999 and its effect on anticipatory bail.",
    "demo-malformed":
      "What is the law on quashing under Section 482 BNSS? Cite (2023)5 SCC123 and 2024 SCC OnLine Del 3456.",
    "demo-mixed":
      "Is AIR 2004 SC 3358 still good law on dishonest intention? Also discuss (2028) 3 SCC 45 and MANU/MH/1234/2023.",
    "demo-divorce":
      "Grounds for contested divorce under Hindu Marriage Act Section 13 — cruelty and desertion.",
    "demo-contract":
      "Remedies for breach of contract under the Indian Contract Act — cite leading Supreme Court damages cases.",
    "demo-bail":
      "What are the key Supreme Court precedents on anticipatory bail in economic offences?",
    "demo-probate":
      "Requirements for grant of probate when the will is contested — cite relevant Supreme Court decisions.",
    "demo-65b":
      "Admissibility of WhatsApp chats under Section 65B of the Indian Evidence Act — certificate requirements and recent SC law.",
  };
  return queries[matterId] ?? queries[DEFAULT_MATTER_ID];
}
