"use client";

import { ClaimButton } from "@/components/claim-button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { NeedWithClaims } from "@/types/database";
import { getClaimProgress } from "@/lib/utils";

interface NeedsListProps {
  needs: NeedWithClaims[];
  potluckSlug: string;
  showClaimButton?: boolean;
  onClaimed?: () => void;
}

export function NeedsList({
  needs,
  potluckSlug,
  showClaimButton = true,
  onClaimed,
}: NeedsListProps) {
  const progress = getClaimProgress(needs);

  if (needs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-lg">No needs listed yet</p>
        <p className="text-sm mt-1">The host hasn&apos;t added any needs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {progress.claimed} of {progress.total} items claimed
          </span>
          <span className="font-medium">{progress.percentage}%</span>
        </div>
        <Progress value={progress.percentage} />
      </div>

      <div className="space-y-2">
        {needs.map((need) => (
          <div
            key={need.id}
            className="flex items-center gap-3 p-3 rounded-lg border bg-card"
          >
            <span className="text-2xl shrink-0">{need.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{need.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {need.claimed_quantity} / {need.quantity} claimed
                </span>
                {need.point_value && (
                  <Badge variant="warm" className="text-xs">
                    {need.point_value} pts
                  </Badge>
                )}
              </div>
              {need.claims.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {need.claims.map((claim) => (
                    <Badge key={claim.id} variant="outline" className="text-xs">
                      {claim.profile?.display_name || claim.guest_name || "Guest"}
                      {claim.verified && (
                        <span className="ml-1 text-warm-green">
                          <span aria-hidden="true">✓</span>
                          <span className="sr-only">verified</span>
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {showClaimButton && (
              <ClaimButton
                need={need}
                potluckSlug={potluckSlug}
                onClaimed={onClaimed}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
