import { createClient } from "@/lib/supabase/server";
import { PotluckCard } from "@/components/potluck-card";
import { MyPotlucksSection } from "@/components/my-potlucks-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Sparkles } from "lucide-react";
import Link from "next/link";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.q || "";
  const page = parseInt(params.page || "1");
  const perPage = 12;

  let potlucks: any[] = [];
  let hasMore = false;
  let hostedPotlucks: any[] = [];
  let participatingPotlucks: any[] = [];
  let isLoggedIn = false;

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      isLoggedIn = true;

      // Potlucks the user hosts directly
      const { data: hosted } = await supabase
        .from("potlucks")
        .select("*, needs(quantity, claimed_quantity)")
        .eq("host_id", user.id)
        .eq("status", "active")
        .order("event_date", { ascending: true });

      hostedPotlucks = hosted || [];

      // Potlucks the user co-hosts
      const { data: cohostRows } = await supabase
        .from("cohosts")
        .select("potluck_id")
        .eq("profile_id", user.id);

      if (cohostRows && cohostRows.length > 0) {
        const cohostIds = cohostRows.map((c: any) => c.potluck_id);
        const { data: cohosted } = await supabase
          .from("potlucks")
          .select("*, needs(quantity, claimed_quantity)")
          .in("id", cohostIds)
          .eq("status", "active")
          .order("event_date", { ascending: true });

        if (cohosted) {
          const existingIds = new Set(hostedPotlucks.map((p: any) => p.id));
          hostedPotlucks = [
            ...hostedPotlucks,
            ...cohosted.filter((p: any) => !existingIds.has(p.id)),
          ];
        }
      }

      const { data: claims } = await supabase
        .from("claims")
        .select("potluck_id")
        .eq("profile_id", user.id);

      if (claims && claims.length > 0) {
        const claimedIds = Array.from(
          new Set(claims.map((c: any) => c.potluck_id))
        );
        const { data: attending } = await supabase
          .from("potlucks")
          .select("*, needs(quantity, claimed_quantity)")
          .in("id", claimedIds)
          .eq("status", "active")
          .order("event_date", { ascending: true });

        participatingPotlucks = attending || [];
      }
    }

    let dbQuery = supabase
      .from("potlucks")
      .select("*, needs(quantity, claimed_quantity)")
      .eq("access_level", "public")
      .eq("status", "active")
      .order("event_date", { ascending: true })
      .range((page - 1) * perPage, page * perPage);

    if (query) {
      dbQuery = dbQuery.or(
        `title.ilike.%${query}%,description.ilike.%${query}%`
      );
    }

    const { data, error } = await dbQuery;
    if (!error && data) {
      potlucks = data;
      hasMore = data.length > perPage;
      if (hasMore) potlucks = potlucks.slice(0, perPage);
    }
  } catch {
    // Supabase not configured yet — show empty state
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-warm-cream to-background">
        <div className="container py-12 md:py-24 text-center space-y-5 md:space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-warm-golden-light/50 text-sm text-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Coordination made simple
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight text-balance max-w-3xl mx-auto">
            What do we need?{" "}
            <span className="text-warm-green">Who&apos;s bringing what?</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-xl mx-auto text-balance">
            Create a potluck, share it with your people, and let everyone claim
            what to bring. Simple, beautiful coordination.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="w-full sm:w-auto" asChild>
              <Link href="/create">Create a Potluck</Link>
            </Button>
            <Button variant="outline" size="lg" className="w-full sm:w-auto" asChild>
              <Link href="#potlucks">Browse Potlucks</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            Potluck is in beta — free and{" "}
            <a
              href="https://github.com/omniharmonic/potluck"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              open source
            </a>
            . Questions? Reach out to{" "}
            <a
              href="mailto:potluck@solutul.resend.app"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              potluck@solutul.resend.app
            </a>
          </p>
        </div>
      </section>

      {/* My potlucks (logged-in users only) */}
      {isLoggedIn &&
        (hostedPotlucks.length > 0 || participatingPotlucks.length > 0) && (
          <MyPotlucksSection
            hosted={hostedPotlucks}
            participating={participatingPotlucks}
          />
        )}

      {/* Public potlucks feed */}
      <section id="potlucks" className="container py-12 space-y-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Public Potlucks</h2>
            <p className="text-muted-foreground">
              Discover events in your community
            </p>
          </div>
          <form className="relative w-full sm:w-auto" action="/" method="GET">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={query}
              placeholder="Search potlucks..."
              className="pl-9 w-full sm:w-64"
            />
          </form>
        </div>

        {potlucks.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {potlucks.map((potluck) => (
                <PotluckCard key={potluck.id} potluck={potluck} />
              ))}
            </div>
            {(page > 1 || hasMore) && (
              <div className="flex justify-center gap-2">
                {page > 1 && (
                  <Button variant="outline" asChild>
                    <Link
                      href={`/?page=${page - 1}${query ? `&q=${query}` : ""}`}
                    >
                      Previous
                    </Link>
                  </Button>
                )}
                {hasMore && (
                  <Button variant="outline" asChild>
                    <Link
                      href={`/?page=${page + 1}${query ? `&q=${query}` : ""}`}
                    >
                      Next
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 space-y-4">
            <div className="text-6xl">🍲</div>
            <h3 className="text-xl font-semibold">No public potlucks yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {query
                ? `No potlucks matching "${query}". Try a different search.`
                : "Be the first to create a public potluck and bring your community together!"}
            </p>
            <Button asChild>
              <Link href="/create">Create the First One</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
