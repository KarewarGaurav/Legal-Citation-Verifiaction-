import { CitationStatusBadge } from "@/components/CitationStatusBadge";
import { SourceBadge } from "@/components/SourceBadge";
import type { CitationAnnotation } from "@/lib/types";

interface AnnotationBadgesProps {
  annotations: CitationAnnotation[];
}

export function AnnotationBadges({ annotations }: AnnotationBadgesProps) {
  if (annotations.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {annotations.map((a) => (
        <li
          key={a.id}
          className="flex min-w-0 max-w-full flex-col gap-1.5 rounded-lg border border-border/70 bg-background/40 px-3 py-2 sm:max-w-[min(100%,22rem)]"
          title={a.citationText}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <CitationStatusBadge state={a.state} size="list" />
            <SourceBadge source={a.verificationResult?.source} />
          </div>
          <span className="break-words text-xs leading-snug text-foreground/90">
            {truncate(a.citationText, 96)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
