"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  GuestIdentityModal,
  getStoredGuestIdentity,
} from "@/components/guest-identity-modal";
import { getGuestToken, storeGuestToken, removeGuestToken } from "@/lib/guest-tokens";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import type { RsvpWithProfile } from "@/types/database";

const AVATAR_DISPLAY_LIMIT = 8;

interface RsvpSectionProps {
  potluckSlug: string;
  rsvps: RsvpWithProfile[];
  onRsvpChanged?: () => void;
}

export function RsvpSection({
  potluckSlug,
  rsvps,
  onRsvpChanged,
}: RsvpSectionProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);

  // Ownership: authenticated profile match, or (as a guest) holding the
  // capability token for that RSVP. Token replaces the spoofable name match.
  const userRsvp = useMemo(() => {
    if (user) return rsvps.find((r) => r.profile_id === user.id);
    return rsvps.find((r) => !!getGuestToken("rsvp", r.id));
  }, [rsvps, user]);

  const handleRsvp = async (guestName?: string, guestEmail?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/potlucks/${potluckSlug}/rsvps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_name: guestName,
          guest_email: guestEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.duplicate) {
          toast.info("You've already RSVP'd!");
        } else {
          toast.error(data.error || "Failed to RSVP. Please try again.");
        }
        return;
      }
      if (data.guest_token && data.rsvp_id) {
        storeGuestToken("rsvp", data.rsvp_id, data.guest_token);
      }
      toast.success("You're going! 🎉");
      onRsvpChanged?.();
    } catch {
      toast.error("Failed to RSVP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!userRsvp) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/potlucks/${potluckSlug}/rsvps`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rsvp_id: userRsvp.id,
          guest_token: getGuestToken("rsvp", userRsvp.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to cancel RSVP.");
        return;
      }
      removeGuestToken("rsvp", userRsvp.id);
      toast.success("RSVP cancelled.");
      onRsvpChanged?.();
    } catch {
      toast.error("Failed to cancel RSVP.");
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (userRsvp) {
      handleCancel();
      return;
    }
    if (!user) {
      const stored = getStoredGuestIdentity();
      if (stored) {
        handleRsvp(stored.name, stored.email);
      } else {
        setShowGuestModal(true);
      }
      return;
    }
    handleRsvp();
  };

  const displayName = (rsvp: RsvpWithProfile) =>
    rsvp.profile?.display_name || rsvp.guest_name || "Guest";

  const initial = (rsvp: RsvpWithProfile) => {
    const name = displayName(rsvp);
    return name.charAt(0).toUpperCase();
  };

  const [showAllRsvps, setShowAllRsvps] = useState(false);
  const overflow = rsvps.length - AVATAR_DISPLAY_LIMIT;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-warm-green" />
          <h3 className="font-semibold text-lg">
            Attending
            {rsvps.length > 0 && (
              <span className="text-muted-foreground font-normal ml-1.5 text-base">
                ({rsvps.length})
              </span>
            )}
          </h3>
        </div>
        {userRsvp ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={loading}
            className="border-warm-green text-warm-green hover:bg-warm-green/10"
          >
            <UserCheck className="mr-1.5 h-3.5 w-3.5" />
            Going
          </Button>
        ) : (
          <Button size="sm" onClick={handleClick} disabled={loading}>
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            RSVP
          </Button>
        )}
      </div>

      {rsvps.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAllRsvps(true)}
          className="flex items-center gap-2 group"
        >
          <div className="flex -space-x-2">
            {rsvps.slice(0, AVATAR_DISPLAY_LIMIT).map((rsvp) => (
              <Avatar
                key={rsvp.id}
                className="h-8 w-8 ring-2 ring-background"
                title={displayName(rsvp)}
              >
                <AvatarImage src={rsvp.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-warm-green/10 text-warm-green">
                  {initial(rsvp)}
                </AvatarFallback>
              </Avatar>
            ))}
            {overflow > 0 && (
              <div className="h-8 w-8 rounded-full ring-2 ring-background bg-muted flex items-center justify-center">
                <span className="text-xs font-medium text-muted-foreground">
                  +{overflow}
                </span>
              </div>
            )}
          </div>
          <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
            See who&apos;s going
          </span>
        </button>
      )}

      {rsvps.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No RSVPs yet — be the first to say you&apos;re going!
        </p>
      )}

      <Dialog open={showAllRsvps} onOpenChange={setShowAllRsvps}>
        <DialogContent className="max-w-sm max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Attending ({rsvps.length})
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto -mx-1 px-1 space-y-1">
            {rsvps.map((rsvp) => (
              <div
                key={rsvp.id}
                className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-muted/50"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={rsvp.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-xs bg-warm-green/10 text-warm-green">
                    {initial(rsvp)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium truncate">
                  {displayName(rsvp)}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <GuestIdentityModal
        open={showGuestModal}
        onClose={() => setShowGuestModal(false)}
        onSubmit={(name, email) => {
          setShowGuestModal(false);
          handleRsvp(name, email);
        }}
      />
    </div>
  );
}
