"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import type { NeedWithClaims, OfferWithProfile } from "@/types/database";

interface VerificationPanelProps {
  potluckSlug: string;
  needs: NeedWithClaims[];
  offers: OfferWithProfile[];
  pointsEnabled: boolean;
  onVerified?: () => void;
}

export function VerificationPanel({
  potluckSlug,
  needs,
  offers,
  pointsEnabled,
  onVerified,
}: VerificationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    needs.forEach((n) =>
      n.claims.forEach((c) => {
        if (c.verified) ids.add(c.id);
      })
    );
    offers.forEach((o) => {
      if (o.verified) ids.add(o.id);
    });
    return ids;
  });
  const [offerPoints, setOfferPoints] = useState<Record<string, number>>(() => {
    const pts: Record<string, number> = {};
    offers.forEach((o) => {
      pts[o.id] = o.points_awarded || 0;
    });
    return pts;
  });

  // Re-sync local state when the parent refetches (e.g. after Save or a
  // realtime update). Lazy useState only seeds once, so without this the
  // checkmarks would drift from server truth and a later Save could clobber
  // concurrent changes.
  useEffect(() => {
    const ids = new Set<string>();
    needs.forEach((n) => n.claims.forEach((c) => { if (c.verified) ids.add(c.id); }));
    offers.forEach((o) => { if (o.verified) ids.add(o.id); });
    setVerifiedIds(ids);
    const pts: Record<string, number> = {};
    offers.forEach((o) => { pts[o.id] = o.points_awarded || 0; });
    setOfferPoints(pts);
  }, [needs, offers]);

  const toggleVerify = (id: string) => {
    setVerifiedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const verifyAll = () => {
    const allIds = new Set<string>();
    needs.forEach((n) => n.claims.forEach((c) => allIds.add(c.id)));
    offers.forEach((o) => allIds.add(o.id));
    setVerifiedIds(allIds);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const claimIds = needs.flatMap((n) => n.claims.map((c) => c.id));
      const offerIds = offers.map((o) => o.id);

      const res = await fetch(`/api/potlucks/${potluckSlug}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verified_claim_ids: claimIds.filter((id) => verifiedIds.has(id)),
          verified_offer_ids: offerIds.filter((id) => verifiedIds.has(id)),
          unverified_claim_ids: claimIds.filter((id) => !verifiedIds.has(id)),
          unverified_offer_ids: offerIds.filter((id) => !verifiedIds.has(id)),
          offer_points: offerPoints,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      toast.success("Verifications saved!");
      onVerified?.();
    } catch (err) {
      toast.error("Failed to save verifications.");
    } finally {
      setLoading(false);
    }
  };

  const allClaims = needs.flatMap((n) =>
    n.claims.map((c) => ({
      ...c,
      needName: n.name,
      needEmoji: n.emoji,
      pointValue: n.point_value,
    }))
  );

  if (allClaims.length === 0 && offers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No contributions to verify yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Verify Contributions</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={verifyAll}>
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            Verify All
          </Button>
          <Button size="sm" onClick={handleSave} disabled={loading}>
            Save
          </Button>
        </div>
      </div>

      {allClaims.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Claimed Items
          </p>
          {allClaims.map((claim) => (
            <div
              key={claim.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
            >
              <button
                type="button"
                onClick={() => toggleVerify(claim.id)}
                aria-pressed={verifiedIds.has(claim.id)}
                aria-label={`${verifiedIds.has(claim.id) ? "Verified" : "Mark verified"}: ${claim.needName} by ${claim.profile?.display_name || claim.guest_name || "Guest"}`}
                className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  verifiedIds.has(claim.id)
                    ? "bg-warm-green text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                }`}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="text-xl shrink-0">{claim.needEmoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{claim.needName}</p>
                <p className="text-xs text-muted-foreground">
                  by {claim.profile?.display_name || claim.guest_name || "Guest"}
                </p>
              </div>
              {pointsEnabled && claim.pointValue && (
                <Badge variant="warm">{claim.pointValue} pts</Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {offers.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Open Offers
          </p>
          {offers.map((offer) => (
            <div
              key={offer.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
            >
              <button
                type="button"
                onClick={() => toggleVerify(offer.id)}
                aria-pressed={verifiedIds.has(offer.id)}
                aria-label={`${verifiedIds.has(offer.id) ? "Verified" : "Mark verified"}: ${offer.name} by ${offer.profile?.display_name || offer.guest_name || "Guest"}`}
                className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  verifiedIds.has(offer.id)
                    ? "bg-warm-green text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                }`}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="text-xl shrink-0">{offer.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{offer.name}</p>
                <p className="text-xs text-muted-foreground">
                  by {offer.profile?.display_name || offer.guest_name || "Guest"}
                </p>
              </div>
              {pointsEnabled && (
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    min={0}
                    value={offerPoints[offer.id] || 0}
                    onChange={(e) =>
                      setOfferPoints((prev) => ({
                        ...prev,
                        [offer.id]: Math.max(0, parseInt(e.target.value) || 0),
                      }))
                    }
                    className="w-16 h-8 text-center text-xs"
                  />
                  <span className="text-xs text-muted-foreground">pts</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
