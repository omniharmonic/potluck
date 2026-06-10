"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { NEEDS_WITH_CLAIMS_SELECT, OFFERS_SELECT, RSVPS_SELECT } from "@/lib/db-columns";
import type { OfferWithProfile, NeedWithClaims, RsvpWithProfile } from "@/types/database";

export function useRealtimeClaims(potluckId: string, initialNeeds: NeedWithClaims[]) {
  const [needs, setNeeds] = useState<NeedWithClaims[]>(initialNeeds);
  const supabaseRef = useRef(createClient());

  const refetchNeeds = useCallback(async () => {
    const { data: needsData } = await supabaseRef.current
      .from("needs")
      .select(NEEDS_WITH_CLAIMS_SELECT)
      .eq("potluck_id", potluckId)
      .order("sort_order");

    if (needsData) {
      setNeeds(needsData as NeedWithClaims[]);
    }
  }, [potluckId]);

  useEffect(() => {
    setNeeds(initialNeeds);
  }, [initialNeeds]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`potluck:${potluckId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "claims",
          filter: `potluck_id=eq.${potluckId}`,
        },
        () => {
          refetchNeeds();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "needs",
          filter: `potluck_id=eq.${potluckId}`,
        },
        () => {
          refetchNeeds();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [potluckId, refetchNeeds]);

  return { needs, refetchNeeds };
}

export function useRealtimeOffers(potluckId: string, initialOffers: OfferWithProfile[]) {
  const [offers, setOffers] = useState<OfferWithProfile[]>(initialOffers);
  const supabaseRef = useRef(createClient());

  const refetchOffers = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("offers")
      .select(OFFERS_SELECT)
      .eq("potluck_id", potluckId)
      .order("created_at");

    if (data) {
      setOffers(data as OfferWithProfile[]);
    }
  }, [potluckId]);

  useEffect(() => {
    setOffers(initialOffers);
  }, [initialOffers]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`potluck-offers:${potluckId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offers",
          filter: `potluck_id=eq.${potluckId}`,
        },
        () => {
          refetchOffers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [potluckId, refetchOffers]);

  return { offers, refetchOffers };
}

export function useRealtimeRsvps(potluckId: string, initialRsvps: RsvpWithProfile[]) {
  const [rsvps, setRsvps] = useState<RsvpWithProfile[]>(initialRsvps);
  const supabaseRef = useRef(createClient());

  const refetchRsvps = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("rsvps")
      .select(RSVPS_SELECT)
      .eq("potluck_id", potluckId)
      .order("created_at");

    if (data) {
      setRsvps(data as RsvpWithProfile[]);
    }
  }, [potluckId]);

  useEffect(() => {
    setRsvps(initialRsvps);
  }, [initialRsvps]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`potluck-rsvps:${potluckId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rsvps",
          filter: `potluck_id=eq.${potluckId}`,
        },
        () => {
          refetchRsvps();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [potluckId, refetchRsvps]);

  return { rsvps, refetchRsvps };
}
