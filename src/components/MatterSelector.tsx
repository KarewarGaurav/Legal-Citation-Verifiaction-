"use client";

import { LEGAL_MATTERS } from "@/lib/legal-matters";
import type { Matter } from "@/lib/types";

interface MatterSelectorProps {
  selectedMatterId: string;
  onSelectMatter: (matter: Matter) => void;
}

export function MatterSelector({
  selectedMatterId,
  onSelectMatter,
}: MatterSelectorProps) {
  return (
    <div className="glass-card rounded-xl p-4">
      <label htmlFor="matter-select" className="text-sm font-semibold text-foreground">
        Matter
      </label>
      <p className="mt-0.5 text-xs text-muted">
        Eight assessment scenarios — pick a matter to load its demo query
      </p>
      <select
        id="matter-select"
        value={selectedMatterId}
        onChange={(e) => {
          const matter = LEGAL_MATTERS.find((m) => m.id === e.target.value);
          if (matter) onSelectMatter(matter);
        }}
        className="mt-2 w-full rounded-lg border border-border/80 bg-background/60 px-3 py-2 text-sm text-foreground focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
      >
        {LEGAL_MATTERS.map((matter) => (
          <option key={matter.id} value={matter.id}>
            {matter.name}
          </option>
        ))}
      </select>
      {LEGAL_MATTERS.find((m) => m.id === selectedMatterId)?.description && (
        <p className="mt-2 text-xs text-muted">
          {LEGAL_MATTERS.find((m) => m.id === selectedMatterId)?.description}
        </p>
      )}
    </div>
  );
}
