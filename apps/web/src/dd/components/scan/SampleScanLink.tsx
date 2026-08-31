"use client";

import { useMemo } from "react";
import { Eye } from "lucide-react";
import { encodeShare, type SharedScan } from "@/lib/share-link";
import { useT } from "@/lib/i18n";

export function SampleScanLink() {
  const { t } = useT();
  const href = useMemo(() => {
    const sample: SharedScan = {
      v: 1,
      o: 7.8,
      t: "chadlite",
      c: {
        harmony: 7.6,
        angularity: 8.2,
        dimorphism: 7.4,
        "eye-area": 8.1,
        features: 7.5,
        symmetry: 8.6,
      },
      g: "male",
      e: "asian",
      ts: Date.UTC(2026, 4, 1, 12, 0, 0),
      geo: 7.6,
      s: 8.0,
      l: 8.1,
    };
    return `/share?d=${encodeShare(sample)}`;
  }, []);

  return (
    <div className="flex justify-center">
      <a
        href={href}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/60 bg-white/50 px-3 py-1.5 text-xs font-medium text-[#6f625a] backdrop-blur-md transition hover:border-white/75 hover:bg-white/70 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/30"
      >
        <Eye className="h-3.5 w-3.5" />
        {t.scan.sampleLink}
      </a>
    </div>
  );
}
