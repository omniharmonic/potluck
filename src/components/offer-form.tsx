"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmojiPicker } from "@/components/emoji-picker";
import {
  GuestIdentityModal,
  getStoredGuestIdentity,
} from "@/components/guest-identity-modal";
import { storeGuestToken } from "@/lib/guest-tokens";
import { Gift, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { OfferWithProfile } from "@/types/database";

interface OfferFormProps {
  potluckSlug: string;
  offers: OfferWithProfile[];
  onOfferAdded?: () => void;
}

export function OfferSection({
  potluckSlug,
  offers,
  onOfferAdded,
}: OfferFormProps) {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [emoji, setEmoji] = useState("🎁");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (guestName?: string) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/potlucks/${potluckSlug}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emoji,
          name: name.trim(),
          description: description.trim() || undefined,
          guest_name: guestName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to submit offer.");
        return;
      }
      if (data.guest_token && data.offer_id) {
        storeGuestToken("offer", data.offer_id, data.guest_token);
      }
      toast.success("Offer submitted!");
      setName("");
      setDescription("");
      setEmoji("🎁");
      setShowForm(false);
      onOfferAdded?.();
    } catch {
      toast.error("Failed to submit offer.");
    } finally {
      setLoading(false);
    }
  };

  const handleOfferClick = () => {
    if (!user) {
      const stored = getStoredGuestIdentity();
      if (!stored) {
        setShowGuestModal(true);
        return;
      }
    }
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-warm-terracotta" />
        <h3 className="font-semibold text-lg">Open Offers</h3>
      </div>

      {offers.length > 0 && (
        <div className="space-y-2">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card"
            >
              <span className="text-2xl shrink-0">{offer.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{offer.name}</p>
                {offer.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {offer.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  by {offer.profile?.display_name || offer.guest_name || "Guest"}
                  {offer.verified && (
                    <Badge variant="success" className="ml-2">
                      Verified
                    </Badge>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="p-4 rounded-lg border bg-card space-y-3">
          <div className="flex gap-2">
            <EmojiPicker value={emoji} onChange={setEmoji} />
            <Input
              aria-label="What are you bringing?"
              placeholder="What are you bringing?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <Textarea
            aria-label="Offer details (optional)"
            placeholder="Any details? (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (!user) {
                  const stored = getStoredGuestIdentity();
                  handleSubmit(stored?.name);
                } else {
                  handleSubmit();
                }
              }}
              disabled={loading || !name.trim()}
              size="sm"
            >
              Submit Offer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={handleOfferClick}
          className="w-full border-dashed"
        >
          <Plus className="mr-2 h-4 w-4" />
          Offer something
        </Button>
      )}

      <GuestIdentityModal
        open={showGuestModal}
        onClose={() => setShowGuestModal(false)}
        onSubmit={() => {
          setShowGuestModal(false);
          setShowForm(true);
        }}
      />
    </div>
  );
}
