"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  GuestIdentityModal,
  getStoredGuestIdentity,
} from "@/components/guest-identity-modal";
import { getGuestToken, storeGuestToken, removeGuestToken } from "@/lib/guest-tokens";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { NeedWithClaims } from "@/types/database";

interface ClaimButtonProps {
  need: NeedWithClaims;
  potluckSlug: string;
  onClaimed?: () => void;
}

export function ClaimButton({ need, potluckSlug, onClaimed }: ClaimButtonProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);

  // A claim is "mine" if I'm the authenticated owner, or (as a guest) I hold a
  // capability token for it. Token ownership replaces the old spoofable
  // match-by-display-name behaviour.
  const userClaim = need.claims.find(
    (c) =>
      (user && c.profile_id === user.id) ||
      (!user && !!getGuestToken("claim", c.id))
  );

  const isFull = need.claimed_quantity >= need.quantity;

  const handleClaim = async (guestName?: string, guestEmail?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/potlucks/${potluckSlug}/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          need_id: need.id,
          guest_name: guestName,
          guest_email: guestEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to claim. Please try again.");
        return;
      }
      if (data.guest_token && data.claim?.id) {
        storeGuestToken("claim", data.claim.id, data.guest_token);
      }
      toast.success(`Claimed: ${need.emoji} ${need.name}`);
      onClaimed?.();
    } catch {
      toast.error("Failed to claim. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnclaim = async () => {
    if (!userClaim) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/potlucks/${potluckSlug}/claims`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_id: userClaim.id,
          guest_token: getGuestToken("claim", userClaim.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to unclaim. Please try again.");
        return;
      }
      removeGuestToken("claim", userClaim.id);
      toast.success(`Unclaimed: ${need.emoji} ${need.name}`);
      onClaimed?.();
    } catch {
      toast.error("Failed to unclaim. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (userClaim) {
      handleUnclaim();
      return;
    }
    if (!user) {
      const stored = getStoredGuestIdentity();
      if (stored) {
        handleClaim(stored.name, stored.email);
      } else {
        setShowGuestModal(true);
      }
      return;
    }
    handleClaim();
  };

  if (userClaim) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={loading}
        aria-label={`Unclaim ${need.name}`}
        className="border-warm-green text-warm-green hover:bg-warm-green/10"
      >
        <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Claimed
      </Button>
    );
  }

  return (
    <>
      <Button
        size="sm"
        onClick={handleClick}
        disabled={loading || isFull}
        aria-label={isFull ? `${need.name} is fully claimed` : `Claim ${need.name}`}
        className={isFull ? "opacity-50" : ""}
      >
        {isFull ? "Full" : "Claim"}
      </Button>
      <GuestIdentityModal
        open={showGuestModal}
        onClose={() => setShowGuestModal(false)}
        onSubmit={(name, email) => {
          setShowGuestModal(false);
          handleClaim(name, email);
        }}
      />
    </>
  );
}
