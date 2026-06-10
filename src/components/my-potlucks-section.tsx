"use client";

import { useState, useMemo } from "react";
import { PotluckCard } from "@/components/potluck-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ChefHat, Users } from "lucide-react";
import type { Potluck, Need } from "@/types/database";

type PotluckWithNeeds = Potluck & {
  needs: Pick<Need, "quantity" | "claimed_quantity">[];
};

interface MyPotlucksSectionProps {
  hosted: PotluckWithNeeds[];
  participating: PotluckWithNeeds[];
}

export function MyPotlucksSection({
  hosted,
  participating,
}: MyPotlucksSectionProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "hosting" | "attending">("all");

  const allPotlucks = useMemo(() => {
    const map = new Map<string, PotluckWithNeeds>();
    for (const p of hosted) map.set(p.id, p);
    for (const p of participating) {
      if (!map.has(p.id)) map.set(p.id, p);
    }
    return Array.from(map.values());
  }, [hosted, participating]);

  const hostedIds = useMemo(() => new Set(hosted.map((p) => p.id)), [hosted]);
  const participatingIds = useMemo(
    () => new Set(participating.map((p) => p.id)),
    [participating]
  );

  const filtered = useMemo(() => {
    let list =
      tab === "hosting"
        ? hosted
        : tab === "attending"
          ? participating.filter((p) => !hostedIds.has(p.id))
          : allPotlucks;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          (p.title || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.location || "").toLowerCase().includes(q)
      );
    }

    // Sort a copy — never mutate the incoming `hosted`/`participating` props.
    return [...list].sort(
      (a, b) =>
        new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );
  }, [tab, search, hosted, participating, allPotlucks, hostedIds]);

  if (allPotlucks.length === 0) return null;

  const attendingOnly = participating.filter((p) => !hostedIds.has(p.id));

  return (
    <section className="container py-12 space-y-6 border-b">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">My Potlucks</h2>
          <p className="text-muted-foreground">
            Events you&apos;re hosting or attending
          </p>
        </div>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search my potlucks..."
            aria-label="Search my potlucks"
            className="pl-9 w-full sm:w-64"
          />
        </div>
      </div>

      <div className="flex gap-2" role="group" aria-label="Filter my potlucks">
        <button
          onClick={() => setTab("all")}
          aria-pressed={tab === "all"}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            tab === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          All
          <Badge
            variant="secondary"
            className="ml-0.5 h-5 min-w-[20px] px-1.5 text-xs"
          >
            {allPotlucks.length}
          </Badge>
        </button>
        <button
          onClick={() => setTab("hosting")}
          aria-pressed={tab === "hosting"}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            tab === "hosting"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <ChefHat className="h-3.5 w-3.5" aria-hidden="true" />
          Hosting
          <Badge
            variant="secondary"
            className="ml-0.5 h-5 min-w-[20px] px-1.5 text-xs"
          >
            {hosted.length}
          </Badge>
        </button>
        {attendingOnly.length > 0 && (
          <button
            onClick={() => setTab("attending")}
            aria-pressed={tab === "attending"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === "attending"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Attending
            <Badge
              variant="secondary"
              className="ml-0.5 h-5 min-w-[20px] px-1.5 text-xs"
            >
              {attendingOnly.length}
            </Badge>
          </button>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((potluck) => (
            <PotluckCard key={potluck.id} potluck={potluck} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>
            {search
              ? `No potlucks matching "${search}"`
              : "No potlucks in this category"}
          </p>
        </div>
      )}
    </section>
  );
}
