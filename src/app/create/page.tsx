"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NeedsBuilder, type NeedItem } from "@/components/needs-builder";
import { BannerUpload } from "@/components/banner-upload";
import { toast } from "sonner";
import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";

export default function CreatePotluckPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [accessLevel, setAccessLevel] = useState<
    "link_shared" | "public" | "invite_only"
  >("link_shared");
  const [openOffers, setOpenOffers] = useState(true);
  const [pointsEnabled, setPointsEnabled] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [needs, setNeeds] = useState<NeedItem[]>([
    { id: "initial-1", emoji: "🍕", name: "", quantity: 1, point_value: null },
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("Please sign in to create a potluck.");
      router.push("/auth/login?redirect=/create");
      return;
    }

    if (!title.trim()) {
      toast.error("Please add a title.");
      return;
    }
    if (!eventDate) {
      toast.error("Please set a date and time.");
      return;
    }
    if (!location.trim()) {
      toast.error("Please add a location.");
      return;
    }

    const validNeeds = needs.filter((n) => n.name.trim());
    if (validNeeds.length === 0) {
      toast.error("Add at least one need.");
      return;
    }

    setLoading(true);
    try {
      let uploadedBannerUrl = null;

      if (bannerFile) {
        const formData = new FormData();
        formData.append("file", bannerFile);
        const uploadRes = await fetch("/api/upload/banner", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          uploadedBannerUrl = url;
        } else {
          // Don't silently drop the banner the user chose — surface it and stop
          // so they can retry rather than creating a potluck without their image.
          const data = await uploadRes.json().catch(() => ({}));
          toast.error(data.error || "Banner upload failed. Please try again.");
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/potlucks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          event_date: eventDate,
          location: location.trim(),
          access_level: accessLevel,
          open_offers: openOffers,
          points_enabled: pointsEnabled,
          banner_url: uploadedBannerUrl,
          needs: validNeeds.map((n, i) => ({
            emoji: n.emoji,
            name: n.name.trim(),
            quantity: n.quantity,
            point_value: pointsEnabled ? n.point_value : null,
            sort_order: i,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create potluck");
      }

      const { slug } = await res.json();
      toast.success("Potluck created!");
      router.push(`/p/${slug}/manage`);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-2xl py-6 md:py-8 space-y-5 md:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Create a Potluck</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Set up your event and list what you need.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {!authLoading && !user && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-4 flex items-center gap-3">
              <LogIn className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-900">
                  Sign in to create your potluck
                </p>
                <p className="text-xs text-amber-700">
                  You&apos;ll need an account to host and manage events.
                </p>
              </div>
              <Button size="sm" asChild>
                <Link href="/auth/login?redirect=/create">Sign In</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Banner Image</CardTitle>
          </CardHeader>
          <CardContent>
            <BannerUpload
              value={bannerUrl}
              onChange={(url, file) => {
                setBannerUrl(url);
                setBannerFile(file);
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Community Garden Potluck"
                maxLength={100}
                required
              />
              <p className="text-xs text-muted-foreground text-right">
                {title.length}/100
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell people what this gathering is about..."
                maxLength={500}
                rows={3}
                required
              />
              <p className="text-xs text-muted-foreground text-right">
                {description.length}/500
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date & Time *</Label>
                <Input
                  id="date"
                  type="datetime-local"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="123 Main St or 'Online'"
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label id="access-level-label">Access Level</Label>
              <div
                role="radiogroup"
                aria-labelledby="access-level-label"
                className="grid grid-cols-1 sm:grid-cols-3 gap-2"
              >
                {(
                  [
                    {
                      value: "public",
                      label: "Public",
                      desc: "Listed on homepage",
                    },
                    {
                      value: "link_shared",
                      label: "Link Only",
                      desc: "Anyone with link",
                    },
                    {
                      value: "invite_only",
                      label: "Invite Only",
                      desc: "Requires invite code",
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={accessLevel === option.value}
                    onClick={() => setAccessLevel(option.value)}
                    className={`p-3 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      accessLevel === option.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <p className="font-medium text-sm">{option.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {option.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <Label htmlFor="open-offers">Open Offers</Label>
                <p className="text-xs text-muted-foreground">
                  Let participants offer items not on the list
                </p>
              </div>
              <Switch
                id="open-offers"
                checked={openOffers}
                onCheckedChange={setOpenOffers}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <Label htmlFor="points">Potluck Points</Label>
                <p className="text-xs text-muted-foreground">
                  Assign points to needs for contributor reputation
                </p>
              </div>
              <Switch
                id="points"
                checked={pointsEnabled}
                onCheckedChange={setPointsEnabled}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What Do You Need?</CardTitle>
          </CardHeader>
          <CardContent>
            <NeedsBuilder
              needs={needs}
              onChange={setNeeds}
              pointsEnabled={pointsEnabled}
            />
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Potluck"
          )}
        </Button>
      </form>
    </div>
  );
}
