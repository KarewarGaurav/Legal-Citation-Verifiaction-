/**

 * Renders pipeline annotated text with visible badge / strikethrough styling.

 */



import { CitationStatusBadgeFromText } from "@/components/CitationStatusBadge";

import { matchCitationBadge } from "@/lib/citation-badges";



interface AnnotatedResponseTextProps {

  text: string;

}



export function AnnotatedResponseText({ text }: AnnotatedResponseTextProps) {

  const segments = parseSegments(text);



  return (

    <div className="legal-response-text space-y-2.5 text-sm leading-relaxed text-foreground">

      {segments.map((seg, i) => {

        if (seg.type === "strike") {

          return (

            <p

              key={i}

              className="break-words text-muted line-through decoration-danger/60 decoration-2"

            >

              {seg.content}

            </p>

          );

        }

        if (seg.type === "badge") {

          return (

            <CitationStatusBadgeFromText

              key={i}

              badgeText={seg.content}

              size="inline"

            />

          );

        }

        return (

          <span key={i} className="whitespace-pre-wrap break-words">

            {seg.content}

          </span>

        );

      })}

    </div>

  );

}



type Segment =

  | { type: "text"; content: string }

  | { type: "badge"; content: string }

  | { type: "strike"; content: string };



function parseSegments(text: string): Segment[] {

  const segments: Segment[] = [];

  let remaining = text;



  while (remaining.length > 0) {

    const strikeStart = remaining.indexOf("~~");

    const badgeMatch = matchCitationBadge(remaining);

    const badgeIndex = badgeMatch?.index ?? -1;



    let nextAt = remaining.length;



    if (strikeStart >= 0 && (badgeIndex < 0 || strikeStart <= badgeIndex)) {

      nextAt = strikeStart;

    } else if (badgeIndex >= 0) {

      nextAt = badgeIndex;

    }



    if (nextAt > 0) {

      segments.push({ type: "text", content: remaining.slice(0, nextAt) });

      remaining = remaining.slice(nextAt);

      continue;

    }



    if (remaining.startsWith("~~")) {

      const end = remaining.indexOf("~~", 2);

      if (end > 2) {

        segments.push({

          type: "strike",

          content: remaining.slice(2, end),

        });

        remaining = remaining.slice(end + 2);

        continue;

      }

    }



    const badge = matchCitationBadge(remaining);

    if (badge && badge.index === 0) {

      segments.push({ type: "badge", content: badge[0] });

      remaining = remaining.slice(badge[0].length);

      continue;

    }



    segments.push({ type: "text", content: remaining });

    break;

  }



  return segments.filter((s) => s.content.length > 0);

}


