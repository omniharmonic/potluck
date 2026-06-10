"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeClaims, useRealtimeOffers } from "@/hooks/use-realtime-claims";
import { VerificationPanel } from "@/components/verification-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { EmojiPicker } from "@/components/emoji-picker";
import {
  Copy,
  ExternalLink,
  Users,
  CheckCircle,
  Plus,
  Loader2,
  Mail,
  Send,
  Link as LinkIcon,
  Check,
  Clock,
  Trash2,
  Share2,
  Pencil,
  Save,
  X,
  UserPlus,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { formatDateTime, getClaimProgress } from "@/lib/utils";
import { NEEDS_WITH_CLAIMS_SELECT, OFFERS_SELECT } from "@/lib/db-columns";
import type { Potluck, NeedWithClaims, OfferWithProfile, Invite, CohostWithProfile, CohostInvite } from "@/types/database";

export default function ManagePotluckPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [potluck, setPotluck] = useState<Potluck | null>(null);
  const [rawNeeds, setRawNeeds] = useState<NeedWithClaims[]>([]);
  const [rawOffers, setRawOffers] = useState<OfferWithProfile[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "verify" | "invites" | "cohosts">("overview");
  const [cohosts, setCohosts] = useState<CohostWithProfile[]>([]);
  const [cohostInvites, setCohostInvites] = useState<CohostInvite[]>([]);
  const [cohostEmail, setCohostEmail] = useState("");
  const [sendingCohostInvites, setSendingCohostInvites] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvites, setSendingInvites] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [editingNeedId, setEditingNeedId] = useState<string | null>(null);
  const [editNeedName, setEditNeedName] = useState("");
  const [editNeedEmoji, setEditNeedEmoji] = useState("");
  const [editNeedQuantity, setEditNeedQuantity] = useState(1);

  const { needs, refetchNeeds } = useRealtimeClaims(potluck?.id || "", rawNeeds);
  const { offers, refetchOffers } = useRealtimeOffers(potluck?.id || "", rawOffers);

  const fetchData = useCallback(async () => {
    const { data: potluckData } = await supabase
      .from("potlucks")
      .select("*")
      .eq("slug", slug)
      .single();

    if (!potluckData) {
      router.push("/");
      return;
    }

    setPotluck(potluckData);

    const [needsRes, offersRes, invitesRes, cohostsRes, cohostInvitesRes] = await Promise.all([
      supabase
        .from("needs")
        .select(NEEDS_WITH_CLAIMS_SELECT)
        .eq("potluck_id", potluckData.id)
        .order("sort_order"),
      supabase
        .from("offers")
        .select(OFFERS_SELECT)
        .eq("potluck_id", potluckData.id)
        .order("created_at"),
      supabase
        .from("invites")
        .select("*")
        .eq("potluck_id", potluckData.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("cohosts")
        .select("*, profile:profiles(id, display_name, avatar_url)")
        .eq("potluck_id", potluckData.id),
      supabase
        .from("cohost_invites")
        .select("*")
        .eq("potluck_id", potluckData.id)
        .order("created_at", { ascending: false }),
    ]);

    setRawNeeds((needsRes.data as NeedWithClaims[]) || []);
    setRawOffers(offersRes.data || []);
    setInvites(invitesRes.data || []);
    setCohosts((cohostsRes.data as CohostWithProfile[]) || []);
    setCohostInvites(cohostInvitesRes.data || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, router]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  useEffect(() => {
    if (!authLoading && !loading && potluck && user) {
      const isCohost = cohosts.some((c) => c.profile_id === user.id);
      if (user.id !== potluck.host_id && !isCohost) {
        router.push(`/p/${slug}`);
      }
    }
    if (!authLoading && !loading && potluck && !user) {
      router.push(`/p/${slug}`);
    }
  }, [authLoading, loading, potluck, user, slug, router, cohosts]);

  const copyLink = () => {
    const url = `${window.location.origin}/p/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
  };

  const addNeed = async () => {
    if (!potluck) return;
    const { error } = await supabase.from("needs").insert({
      potluck_id: potluck.id,
      emoji: "🍽️",
      name: "New item",
      quantity: 1,
      sort_order: needs.length,
    });
    if (!error) refetchNeeds();
  };

  const deleteNeed = async (needId: string) => {
    const { error } = await supabase.from("needs").delete().eq("id", needId);
    if (!error) {
      refetchNeeds();
      toast.success("Need removed.");
    }
  };

  const startEditDetails = () => {
    if (!potluck) return;
    setEditTitle(potluck.title);
    setEditDescription(potluck.description);
    // Extract datetime-local format from stored value (strip Z/timezone suffix)
    const cleaned = potluck.event_date.replace(/Z$/, "").replace(/[+-]\d{2}:\d{2}$/, "");
    setEditDate(cleaned.slice(0, 16));
    setEditLocation(potluck.location);
    setEditingDetails(true);
  };

  const saveDetails = async () => {
    if (!potluck) return;
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/potlucks/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
          event_date: editDate,
          location: editLocation.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Details updated!");
      setEditingDetails(false);
      fetchData();
    } catch {
      toast.error("Failed to save changes.");
    } finally {
      setSavingDetails(false);
    }
  };

  const startEditNeed = (need: NeedWithClaims) => {
    setEditingNeedId(need.id);
    setEditNeedName(need.name);
    setEditNeedEmoji(need.emoji);
    setEditNeedQuantity(need.quantity);
  };

  const saveNeed = async () => {
    if (!editingNeedId) return;
    const { error } = await supabase
      .from("needs")
      .update({
        name: editNeedName.trim(),
        emoji: editNeedEmoji,
        quantity: editNeedQuantity,
      })
      .eq("id", editingNeedId);
    if (!error) {
      toast.success("Need updated!");
      setEditingNeedId(null);
      refetchNeeds();
    } else {
      toast.error("Failed to update need.");
    }
  };

  const sendInvites = async () => {
    const raw = inviteEmail.trim();
    if (!raw) return;

    const emails = raw
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (emails.length === 0) {
      toast.error("Please enter valid email addresses.");
      return;
    }

    const existing = new Set(invites.map((i) => i.email.toLowerCase()));
    const newEmails = emails.filter((e) => !existing.has(e));
    if (newEmails.length === 0) {
      toast.error("All emails have already been invited.");
      return;
    }

    setSendingInvites(true);
    try {
      const res = await fetch(`/api/potlucks/${slug}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: newEmails }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send invites.");
        return;
      }
      const emailsSent = data.emailsSent || 0;
      if (emailsSent > 0) {
        toast.success(`${emailsSent} invite email(s) sent!`);
      } else {
        toast.success(`${newEmails.length} invite(s) created! Share the links below.`);
      }
      setInviteEmail("");
      fetchData();
    } catch {
      toast.error("Failed to send invites.");
    } finally {
      setSendingInvites(false);
    }
  };

  const copyInviteLink = (code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied!");
  };

  const shareInvite = (invite: Invite) => {
    const link = `${window.location.origin}/invite/${invite.code}`;
    const subject = encodeURIComponent(`You're invited to ${potluck?.title || "a Potluck"}!`);
    const body = encodeURIComponent(
      `Hey! You're invited to "${potluck?.title}".\n\n` +
      `📅 ${potluck ? formatDateTime(potluck.event_date) : ""}\n` +
      `📍 ${potluck?.location || ""}\n\n` +
      `Join here: ${link}`
    );
    window.open(`mailto:${invite.email}?subject=${subject}&body=${body}`);
  };

  const deleteInvite = async (inviteId: string) => {
    const { error } = await supabase.from("invites").delete().eq("id", inviteId);
    if (!error) {
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Invite removed.");
    }
  };

  const sendCohostInvites = async () => {
    const raw = cohostEmail.trim();
    if (!raw) return;

    const emails = raw
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (emails.length === 0) {
      toast.error("Please enter valid email addresses.");
      return;
    }

    setSendingCohostInvites(true);
    try {
      const res = await fetch(`/api/potlucks/${slug}/cohosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send co-host invites.");
        return;
      }
      const emailsSent = data.emailsSent || 0;
      if (emailsSent > 0) {
        toast.success(`${emailsSent} co-host invite email(s) sent!`);
      } else {
        toast.success(`${emails.length} co-host invite(s) created!`);
      }
      setCohostEmail("");
      fetchData();
    } catch {
      toast.error("Failed to send co-host invites.");
    } finally {
      setSendingCohostInvites(false);
    }
  };

  const removeCohost = async (cohostId: string) => {
    try {
      const res = await fetch(`/api/potlucks/${slug}/cohosts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohost_id: cohostId }),
      });
      if (!res.ok) throw new Error();
      setCohosts((prev) => prev.filter((c) => c.id !== cohostId));
      toast.success("Co-host removed.");
    } catch {
      toast.error("Failed to remove co-host.");
    }
  };

  const removeCohostInvite = async (inviteId: string) => {
    try {
      const res = await fetch(`/api/potlucks/${slug}/cohosts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: inviteId }),
      });
      if (!res.ok) throw new Error();
      setCohostInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Co-host invite removed.");
    } catch {
      toast.error("Failed to remove invite.");
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!potluck) return null;

  const progress = getClaimProgress(needs);

  return (
    <div className="container max-w-4xl py-6 md:py-8 space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <Badge variant="outline" className="mb-2">
            Host Dashboard
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-bold truncate">{potluck.title}</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {formatDateTime(potluck.event_date)} · {potluck.location}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Copy Link</span>
            <span className="sm:hidden">Copy</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/p/${slug}`, "_blank")}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            View
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-warm-green">
              {progress.percentage}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">Claimed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{needs.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Needs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">
              {new Set(
                needs
                  .flatMap((n) => n.claims)
                  .map((c) => c.profile_id || c.guest_name)
              ).size}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Participants</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{offers.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Offers</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "overview"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="inline mr-1.5 h-4 w-4" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab("verify")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "verify"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle className="inline mr-1.5 h-4 w-4" />
          Verify
        </button>
        <button
          onClick={() => setActiveTab("invites")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "invites"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Mail className="inline mr-1.5 h-4 w-4" />
          Invites
          {invites.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
              {invites.length}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab("cohosts")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "cohosts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserPlus className="inline mr-1.5 h-4 w-4" />
          Co-Hosts
          {cohosts.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
              {cohosts.length}
            </Badge>
          )}
        </button>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Event details */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Event Details</CardTitle>
              {editingDetails ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingDetails(false)}>
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveDetails} disabled={savingDetails}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {savingDetails ? "Saving..." : "Save"}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={startEditDetails}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editingDetails ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">Title</Label>
                    <Input
                      id="edit-title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-desc">Description</Label>
                    <Textarea
                      id="edit-desc"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      maxLength={500}
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-date">Date & Time</Label>
                      <Input
                        id="edit-date"
                        type="datetime-local"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-location">Location</Label>
                      <Input
                        id="edit-location"
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Title:</span> {potluck.title}</p>
                  <p><span className="text-muted-foreground">Description:</span> {potluck.description}</p>
                  <p><span className="text-muted-foreground">When:</span> {formatDateTime(potluck.event_date)}</p>
                  <p><span className="text-muted-foreground">Where:</span> {potluck.location}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Needs management */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Needs</CardTitle>
              <Button variant="outline" size="sm" onClick={addNeed}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Need
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {needs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No needs yet. Add one above.
                  </p>
                ) : (
                  needs.map((need) => (
                    <div
                      key={need.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                    >
                      {editingNeedId === need.id ? (
                        <>
                          <EmojiPicker value={editNeedEmoji} onChange={setEditNeedEmoji} />
                          <div className="flex-1 flex flex-col sm:flex-row gap-2">
                            <Input
                              value={editNeedName}
                              onChange={(e) => setEditNeedName(e.target.value)}
                              className="flex-1"
                              autoFocus
                            />
                            <Input
                              type="number"
                              value={editNeedQuantity}
                              onChange={(e) => setEditNeedQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-20"
                              min={1}
                            />
                          </div>
                          <Button size="sm" onClick={saveNeed}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingNeedId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
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
                                      <span className="ml-1 text-warm-green">✓</span>
                                    )}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => startEditNeed(need)}
                            title="Edit need"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => deleteNeed(need.id)}
                            title="Delete need"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Offers */}
          {potluck.open_offers && offers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Open Offers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {offers.map((offer) => (
                    <div
                      key={offer.id}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                    >
                      <span className="text-xl">{offer.emoji}</span>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{offer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          by {(offer as any).profile?.display_name || offer.guest_name || "Guest"}
                        </p>
                      </div>
                      {offer.verified && (
                        <Badge variant="success">Verified</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "verify" && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <VerificationPanel
              potluckSlug={slug}
              needs={needs}
              offers={offers}
              pointsEnabled={potluck.points_enabled}
              onVerified={() => {
                refetchNeeds();
                refetchOffers();
              }}
            />
          </CardContent>
        </Card>
      )}

      {activeTab === "invites" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send Invites
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Enter email addresses to invite people to this potluck.
                They&apos;ll get a unique link to join.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="email@example.com, friend@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendInvites(); }}
                  className="flex-1"
                />
                <Button
                  onClick={sendInvites}
                  disabled={sendingInvites || !inviteEmail.trim()}
                >
                  {sendingInvites ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 h-4 w-4" />
                  )}
                  Invite
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Separate multiple emails with commas, semicolons, or spaces.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Invited Guests
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {invites.filter((i) => i.accepted).length}/{invites.length} accepted
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invites.length === 0 ? (
                <div className="text-center py-8">
                  <Mail className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">
                    No invites sent yet.
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add email addresses above to invite people.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {invite.email}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {invite.accepted ? (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <Check className="h-3 w-3" />
                              Accepted
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Pending
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => copyInviteLink(invite.code)}
                          title="Copy invite link"
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => shareInvite(invite)}
                          title="Send via email"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteInvite(invite.id)}
                          title="Remove invite"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {potluck.access_level !== "invite_only" && (
            <Card className="border-dashed">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Tip:</strong> This potluck is set to{" "}
                  <Badge variant="outline" className="mx-1">
                    {potluck.access_level === "public" ? "Public" : "Link Only"}
                  </Badge>
                  — anyone with the link can view it. Switch to{" "}
                  <strong>Invite Only</strong> if you want to restrict access to
                  only invited guests.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "cohosts" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Invite Co-Hosts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Co-hosts can manage everything except deleting this potluck.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="email@example.com"
                  value={cohostEmail}
                  onChange={(e) => setCohostEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendCohostInvites(); }}
                  className="flex-1"
                />
                <Button
                  onClick={sendCohostInvites}
                  disabled={sendingCohostInvites || !cohostEmail.trim()}
                >
                  {sendingCohostInvites ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 h-4 w-4" />
                  )}
                  Invite
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Separate multiple emails with commas, semicolons, or spaces.
              </p>
            </CardContent>
          </Card>

          {cohosts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Current Co-Hosts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {cohosts.map((cohost) => (
                    <div
                      key={cohost.id}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={cohost.profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-warm-green text-white">
                          {cohost.profile?.display_name?.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {cohost.profile?.display_name || "Unknown"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeCohost(cohost.id)}
                        title="Remove co-host"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {cohostInvites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Pending Co-Host Invites
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {cohostInvites.filter((i) => i.accepted).length}/{cohostInvites.length} accepted
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {cohostInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {invite.email}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {invite.accepted ? (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <Check className="h-3 w-3" />
                              Accepted
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Pending
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeCohostInvite(invite.id)}
                        title="Remove invite"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
