"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CLAIM_COLUMNS } from "@/lib/db-columns";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Trophy,
  ChefHat,
  Users,
  Loader2,
  Pencil,
  Check,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import type { Potluck, Claim } from "@/types/database";
import Link from "next/link";

export default function ProfilePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [hostedPotlucks, setHostedPotlucks] = useState<Potluck[]>([]);
  const [participatedPotlucks, setParticipatedPotlucks] = useState<
    (Potluck & { my_claims: Claim[] })[]
  >([]);
  const [loadingData, setLoadingData] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoadingData(true);
    try {
    const [hostedRes, claimsRes, cohostRes] = await Promise.all([
      supabase
        .from("potlucks")
        .select("*")
        .eq("host_id", user.id)
        .order("event_date", { ascending: false }),
      supabase
        .from("claims")
        .select(`${CLAIM_COLUMNS}, potlucks(*)`)
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("cohosts")
        .select("potluck_id")
        .eq("profile_id", user.id),
    ]);

    let hosted = hostedRes.data || [];

    // Include co-hosted potlucks
    if (cohostRes.data && cohostRes.data.length > 0) {
      const cohostIds = cohostRes.data.map((c: any) => c.potluck_id);
      const { data: cohosted } = await supabase
        .from("potlucks")
        .select("*")
        .in("id", cohostIds)
        .order("event_date", { ascending: false });

      if (cohosted) {
        const existingIds = new Set(hosted.map((p) => p.id));
        hosted = [...hosted, ...cohosted.filter((p) => !existingIds.has(p.id))];
      }
    }

    setHostedPotlucks(hosted);

    const potluckMap = new Map<string, Potluck & { my_claims: Claim[] }>();
    (claimsRes.data || []).forEach((claim: any) => {
      if (claim.potlucks) {
        const existing = potluckMap.get(claim.potluck_id);
        if (existing) {
          existing.my_claims.push(claim);
        } else {
          potluckMap.set(claim.potluck_id, {
            ...claim.potlucks,
            my_claims: [claim],
          });
        }
      }
    });
    setParticipatedPotlucks(Array.from(potluckMap.values()));
    } catch {
      // Surface nothing destructive; just stop the spinner so the page renders.
    } finally {
      setLoadingData(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchData();
    }
    if (!authLoading && !user) {
      router.push("/auth/login?redirect=/profile");
    }
  }, [authLoading, user, fetchData, router]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", user!.id);

    if (error) {
      toast.error("Failed to update name.");
    } else {
      toast.success("Name updated!");
      setEditing(false);
    }
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Use JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large. Max 2MB.");
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Upload failed.");
        return;
      }

      setAvatarUrl(data.url);
      toast.success("Profile picture updated!");
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  if (authLoading || loadingData) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="container max-w-3xl py-6 md:py-8 space-y-5 md:space-y-6">
      {/* Profile header */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="relative group shrink-0"
            >
              <Avatar className="h-12 w-12 sm:h-16 sm:w-16">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="text-base sm:text-xl bg-warm-green text-white">
                  {profile.display_name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? (
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-white animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </button>
            <div className="flex-1">
              {editing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="max-w-xs"
                    autoFocus
                  />
                  <Button
                    size="icon"
                    onClick={handleSaveName}
                    disabled={saving}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">
                    {profile.display_name}
                  </h1>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                {user?.email}
              </p>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-warm-golden">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-xl sm:text-2xl font-bold">
                  {profile.total_points}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
                Points
              </p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-warm-green">
                <ChefHat className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-xl sm:text-2xl font-bold">
                  {hostedPotlucks.length}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">Hosted</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-warm-terracotta">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-xl sm:text-2xl font-bold">
                  {participatedPotlucks.length}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
                Participated
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hosted */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" />
            Potlucks Hosted
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hostedPotlucks.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              You haven&apos;t hosted any potlucks yet.{" "}
              <Link href="/create" className="text-primary underline">
                Create one!
              </Link>
            </p>
          ) : (
            <div className="space-y-2">
              {hostedPotlucks.map((p) => (
                <Link
                  key={p.id}
                  href={`/p/${p.slug}/manage`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.event_date)} · {p.location}
                    </p>
                  </div>
                  <Badge
                    variant={p.status === "active" ? "default" : "outline"}
                  >
                    {p.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Participated */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Participated In
          </CardTitle>
        </CardHeader>
        <CardContent>
          {participatedPotlucks.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              You haven&apos;t contributed to any potlucks yet.
            </p>
          ) : (
            <div className="space-y-2">
              {participatedPotlucks.map((p) => (
                <Link
                  key={p.id}
                  href={`/p/${p.slug}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.event_date)} · {p.my_claims.length}{" "}
                      contribution(s)
                    </p>
                  </div>
                  <div className="text-right">
                    {p.my_claims.reduce((sum, c) => sum + c.points_awarded, 0) >
                      0 && (
                      <Badge variant="warm">
                        +
                        {p.my_claims.reduce(
                          (sum, c) => sum + c.points_awarded,
                          0
                        )}{" "}
                        pts
                      </Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
