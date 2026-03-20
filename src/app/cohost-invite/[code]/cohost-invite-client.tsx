"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar, MapPin, Loader2, CheckCircle } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";

interface CohostInviteClientProps {
  code: string;
  potluckTitle: string;
  potluckSlug: string;
  eventDate: string;
  location: string;
  hostName: string;
  inviteAccepted: boolean;
  alreadyCohost: boolean;
  isAuthenticated: boolean;
}

export function CohostInviteClient({
  code,
  potluckTitle,
  potluckSlug,
  eventDate,
  location,
  hostName,
  inviteAccepted,
  alreadyCohost,
  isAuthenticated,
}: CohostInviteClientProps) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(inviteAccepted || alreadyCohost);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await fetch(`/api/cohost-invite/${code}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setAccepting(false);
        return;
      }
      setAccepted(true);
      // Brief pause to show success state, then redirect
      setTimeout(() => {
        router.push(`/p/${data.slug || potluckSlug}/manage`);
      }, 800);
    } catch {
      setAccepting(false);
    }
  };

  // Already accepted state
  if (accepted && !accepting) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl">You&apos;re a co-host!</CardTitle>
            <CardDescription>
              You&apos;re already a co-host of <strong>{potluckTitle}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild className="w-full">
              <Link href={`/p/${potluckSlug}/manage`}>Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🤝</div>
          <CardTitle className="text-2xl">Co-Host Invitation</CardTitle>
          <CardDescription>
            <strong>{hostName}</strong> has invited you to co-host
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Potluck details */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="font-semibold text-lg">{potluckTitle}</p>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>{formatDateTime(eventDate)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>{location}</span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            As a co-host you can manage needs, verify contributions, send
            invites, and more — everything except deleting the event.
          </p>

          {isAuthenticated ? (
            <Button
              className="w-full"
              size="lg"
              onClick={handleAccept}
              disabled={accepting}
            >
              {accepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                "Accept & Start Co-Hosting"
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              <Button className="w-full" size="lg" asChild>
                <Link
                  href={`/auth/login?redirect=${encodeURIComponent(`/cohost-invite/${code}`)}`}
                >
                  Sign in to Accept
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Don&apos;t have an account? You&apos;ll be able to create one on the
                next page.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
