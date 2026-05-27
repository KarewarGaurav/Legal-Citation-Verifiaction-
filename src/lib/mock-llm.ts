import { getMatterQuery, LEGAL_MATTERS } from "@/lib/legal-matters";

/**
 * Assessment-aligned mock LLM outputs (offline demo / API fallback).
 */

const MOCK_BY_MATTER: Record<string, string> = {
  "demo-hallucinated": `Analysis of anticipatory bail implications:

Counsel relies on Mercy v. Mankind (2024) 12 SCC 999, which purportedly held that economic offences cannot justify custodial remand without a speaking order. This citation does not appear in standard reporters.

For contrast, see Satender Kumar Antil v. CBI (2022) 10 SCC 51 on classification of offences for default bail.

Section 438 CrPC (now Section 482 BNSS) remains the governing provision for anticipatory bail applications.`,

  "demo-malformed": `Inherent powers under Section 482 BNSS (formerly Section 482 CrPC):

The Delhi High Court in 2024 SCC OnLine Del 3456 exercised powers sparingly in economic cases.

A draft cite (2023)5 SCC123 omits required spacing — the pipeline should normalize or flag formatting.

Verified anchor: State of Haryana v. Bhajan Lal (1992) Supp (1) SCC 335 on quashing parameters.`,

  "demo-mixed": `Dishonest intention in cheating cases:

The Hon'ble Supreme Court in AIR 2004 SC 3358 (Brahmo Samaj Education Society) held that mens rea must be proved for Section 420 IPC.

Some drafts cite (2028) 3 SCC 45 — impossible future year, removed by hallucination pre-filter.

MANU/MH/1234/2023 is a valid neutral citation format for Maharashtra orders.

Also compare (2004) 6 SCC 224 as the SCC parallel citation.`,

  "demo-divorce": `Contested divorce under Section 13 Hindu Marriage Act:

Cruelty and desertion remain established grounds — Samar Ghosh v. Jaya Ghosh (2007) 4 SCC 484.

Family courts must record specific findings; cite K. Srinivas Rao v. D.A. Deepa (2013) 5 SCC 226.

Section 498A IPC references in older pleadings map to Section 85 BNS after the 2024 codes.`,

  "demo-contract": `Remedies for breach of contract:

Section 73 of the Indian Contract Act governs compensation for loss caused by breach.

Hadley v. Baxendale principles are applied in India through Murlidhar Chiranjilal v. Harishchandra (1962) 1 SCR 653.

Recent discussion appears in 2024 SCC OnLine SC 892 (verify reporter formatting).`,

  "demo-bail": `Anticipatory bail in economic offences:

Rajesh Sharma v. State of UP (2017) 9 SCC 678 — guidelines on arrest in matrimonial cases (distinguish on facts).

Siddharth v. State of UP (2021) 10 SCC 1 emphasizes personal liberty under Article 21.

Repeated reference: Section 420 IPC and Section 406 IPC in the complaint context (maps to BNS).

AIR 2024 SC 567 cited in some drafts — verify on Indian Kanoon.`,

  "demo-probate": `Probate when the will is contested:

Section 276 Indian Succession Act governs proof of wills in solemn form.

Cite H. Venkatachala Iyengar v. B.N. Thimmajamma AIR 1959 SC 443 on suspicious circumstances.

Executor must establish testamentary capacity — see Rabindra Nath Mukherjee v. Panchanan Banerjee (1995) 4 SCC 459.`,

  "demo-65b": `Electronic evidence under Section 65B IEA:

Certificate under Section 65B(4) is mandatory for secondary electronic records — Anvar P.V. v. P.K. Basheer (2014) 10 SCC 473.

After the 2024 codes, Section 63 BSA carries equivalent requirements.

WhatsApp exports require proper chain-of-custody; cite Arjun Panditrao Khot v. Kailash Kushanrao (2020) 7 SCC 1.

Store certificate contemporaneously with seizure memos under Section 65B IEA.`,
};

function matchMatterFromQuery(query: string): string | undefined {
  const q = query.trim().toLowerCase();
  for (const matter of LEGAL_MATTERS) {
    const matterQuery = getMatterQuery(matter.id).toLowerCase();
    if (q === matterQuery || q.includes(matterQuery.slice(0, 36))) {
      return matter.id;
    }
  }
  if (q.includes("mercy v. mankind")) return "demo-hallucinated";
  if (q.includes("482 bnss") || q.includes("5 scc123")) return "demo-malformed";
  if (q.includes("air 2004 sc 3358") && q.includes("2028")) return "demo-mixed";
  if (q.includes("divorce") && q.includes("section 13")) return "demo-divorce";
  if (q.includes("breach of contract")) return "demo-contract";
  if (q.includes("anticipatory bail")) return "demo-bail";
  if (q.includes("probate")) return "demo-probate";
  if (q.includes("65b") || q.includes("whatsapp")) return "demo-65b";
  return undefined;
}

/** Returns assessment-style mock output when matterId or query is recognized. */
export function generateMockLlmResponse(
  query: string,
  matterId?: string
): string {
  const key =
    matterId && MOCK_BY_MATTER[matterId]
      ? matterId
      : matchMatterFromQuery(query);
  if (key && MOCK_BY_MATTER[key]) {
    return MOCK_BY_MATTER[key];
  }

  return (
    "The Hon'ble Supreme Court in AIR 2004 SC 3358 held that dishonest intention is essential. " +
    "Counsel also cited (2028) 3 SCC 45 and Section 420 IPC. " +
    "For bail, see Section 438 CrPC and (2004)6 SCC224."
  );
}

export { LEGAL_MATTERS as SAMPLE_LEGAL_QUERIES };
