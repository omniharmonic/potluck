"use client";

import { useState } from "react";
import { useRealtimeClaims, useRealtimeOffers, useRealtimeRsvps } from "@/hooks/use-realtime-claims";
import { NeedsList } from "@/components/needs-list";
import { OfferSection } from "@/components/offer-form";
import { RsvpSection } from "@/components/rsvp-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar, CalendarPlus, MapPin, Globe, Link as LinkIcon, Lock, Navigation, ExternalLink, Download, Share2, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import type { Potluck, NeedWithClaims, Offer, Profile, RsvpWithProfile, CohostWithProfile } from "@/types/database";

interface PotluckDetailClientProps {
  potluck: Potluck;
  initialNeeds: NeedWithClaims[];
  initialOffers: Offer[];
  initialRsvps: RsvpWithProfile[];
  host: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
  cohosts: CohostWithProfile[];
}

export function PotluckDetailClient({
  potluck,
  initialNeeds,
  initialOffers,
  initialRsvps,
  host,
  cohosts,
}: PotluckDetailClientProps) {
  const { user } = useAuth();
  const { needs, refetchNeeds } = useRealtimeClaims(potluck.id, initialNeeds);
  const { offers, refetchOffers } = useRealtimeOffers(potluck.id, initialOffers);
  const { rsvps, refetchRsvps } = useRealtimeRsvps(potluck.id, initialRsvps);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const isHost = user?.id === potluck.host_id || cohosts.some((c) => c.profile_id === user?.id);

  const shareLink = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: potluck.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  };

  const encodedLocation = encodeURIComponent(potluck.location);
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedLocation}`;
  const appleMapsUrl = `https://maps.apple.com/?daddr=${encodedLocation}`;

  const looksLikeAddress =
    /\d/.test(potluck.location) || /,/.test(potluck.location) ||
    /\b(st|ave|blvd|rd|dr|ln|ct|way|pl|pk|hwy|street|avenue|road|drive|lane|court|plaza|park)\b/i.test(potluck.location);

  // Calendar helpers — parse as local wall clock time
  const cleanedDate = potluck.event_date.replace(/Z$/, "").replace(/[+-]\d{2}:\d{2}$/, "");
  const eventStart = new Date(cleanedDate);
  const eventEnd = new Date(eventStart.getTime() + 2 * 60 * 60 * 1000); // 2-hour default

  // Format as local time for calendar (YYYYMMDDTHHMMSS without Z suffix)
  const toCalString = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(potluck.title)}&dates=${toCalString(eventStart)}/${toCalString(eventEnd)}&location=${encodedLocation}&details=${encodeURIComponent(potluck.description || "")}`;

  const downloadIcs = () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Potluck//EN",
      "BEGIN:VEVENT",
      `DTSTART:${toCalString(eventStart)}`,
      `DTEND:${toCalString(eventEnd)}`,
      `SUMMARY:${potluck.title}`,
      `LOCATION:${potluck.location}`,
      `DESCRIPTION:${(potluck.description || "").replace(/\n/g, "\\n")}`,
      `URL:${typeof window !== "undefined" ? window.location.href : ""}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${potluck.title.replace(/[^a-z0-9]+/gi, "-")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const accessIcon =
    potluck.access_level === "public" ? (
      <Globe className="h-3.5 w-3.5" />
    ) : potluck.access_level === "link_shared" ? (
      <LinkIcon className="h-3.5 w-3.5" />
    ) : (
      <Lock className="h-3.5 w-3.5" />
    );

  return (
    <div className="container max-w-3xl py-6 md:py-8 space-y-5 md:space-y-6">
      {/* Banner */}
      {potluck.banner_url ? (
        <div className="aspect-[16/9] w-full rounded-xl overflow-hidden">
          <img
            src={potluck.banner_url}
            alt={potluck.title}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-[16/9] w-full rounded-xl overflow-hidden bg-gradient-to-br from-warm-cream-dark to-warm-golden-light flex items-center justify-center">
          <span className="text-7xl opacity-30">🍲</span>
        </div>
      )}

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold">{potluck.title}</h1>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={shareLink}>
              <Share2 className="mr-1.5 h-3.5 w-3.5" />
              Share
            </Button>
            {isHost && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/p/${potluck.slug}/manage`}>
                  <Settings className="mr-1.5 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Manage</span>
                </Link>
              </Button>
            )}
          </div>
        </div>

        <p className="text-sm sm:text-base text-muted-foreground">{potluck.description}</p>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors group"
          >
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="underline decoration-dashed underline-offset-2 group-hover:decoration-solid">
              {formatDateTime(potluck.event_date)}
            </span>
            <CalendarPlus className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          {looksLikeAddress ? (
            <button
              type="button"
              onClick={() => setDirectionsOpen(true)}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors group"
            >
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="underline decoration-dashed underline-offset-2 group-hover:decoration-solid">
                {potluck.location}
              </span>
              <Navigation className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{potluck.location}</span>
            </div>
          )}
        </div>

        {host && (
          <div className="flex items-center gap-2 text-sm">
            <div className="flex -space-x-1">
              <Avatar className="h-6 w-6 ring-2 ring-background">
                <AvatarImage src={host.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-warm-green text-white">
                  {host.display_name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {cohosts.map((cohost) => (
                <Avatar key={cohost.id} className="h-6 w-6 ring-2 ring-background">
                  <AvatarImage src={cohost.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-xs bg-warm-green text-white">
                    {cohost.profile?.display_name?.charAt(0).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="text-muted-foreground">
              Hosted by{" "}
              <span className="font-medium text-foreground">
                {host.display_name}
                {cohosts.length > 0 && (
                  <>
                    {" & "}
                    {cohosts.map((c) => c.profile?.display_name).join(", ")}
                  </>
                )}
              </span>
            </span>
          </div>
        )}
      </div>

      <Separator />

      {/* RSVP */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <RsvpSection
            potluckId={potluck.id}
            rsvps={rsvps}
            onRsvpChanged={() => refetchRsvps()}
          />
        </CardContent>
      </Card>

      {/* Needs */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">What&apos;s Needed</h2>
          <NeedsList
            needs={needs}
            potluckId={potluck.id}
            onClaimed={() => refetchNeeds()}
          />
        </CardContent>
      </Card>

      {/* Offers */}
      {potluck.open_offers && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <OfferSection
              potluckId={potluck.id}
              offers={offers}
              onOfferAdded={() => refetchOffers()}
            />
          </CardContent>
        </Card>
      )}

      {potluck.points_enabled && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-lg">🏆</span>
              <span>
                This potluck has <strong>Potluck Points</strong> enabled.
                Contribute and earn reputation when the host verifies your
                contribution.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={directionsOpen} onOpenChange={setDirectionsOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              Get Directions
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-1">{potluck.location}</p>
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full justify-start gap-3" variant="outline">
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                <span className="text-lg">🗺️</span>
                Google Maps
                <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </Button>
            <Button asChild className="w-full justify-start gap-3" variant="outline">
              <a href={appleMapsUrl} target="_blank" rel="noopener noreferrer">
                <span className="text-lg">🍎</span>
                Apple Maps
                <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4" />
              Add to Calendar
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-1">{formatDateTime(potluck.event_date)}</p>
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full justify-start gap-3" variant="outline">
              <a href={googleCalUrl} target="_blank" rel="noopener noreferrer">
                <span className="text-lg">📅</span>
                Google Calendar
                <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </Button>
            <Button className="w-full justify-start gap-3" variant="outline" onClick={downloadIcs}>
              <Download className="h-4 w-4" />
              Apple Calendar / Other (.ics)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
