// Explicit, safe column lists for client-side reads.
//
// After migration 013, `guest_email` and `guest_token` are NOT selectable by
// the anon/authenticated API roles (they are guest PII / secret capability
// tokens). A `select("*")` would therefore fail with "permission denied".
// Always select through these constants on the client.

export const CLAIM_COLUMNS =
  "id, need_id, potluck_id, profile_id, guest_name, quantity, verified, points_awarded, created_at";

export const OFFER_COLUMNS =
  "id, potluck_id, profile_id, guest_name, emoji, name, description, verified, points_awarded, created_at";

export const RSVP_COLUMNS =
  "id, potluck_id, profile_id, guest_name, created_at";

const PROFILE_JOIN = "profile:profiles(display_name, avatar_url)";

// Composed select strings for the common nested reads.
export const NEEDS_WITH_CLAIMS_SELECT =
  `*, claims(${CLAIM_COLUMNS}, ${PROFILE_JOIN})`;

export const OFFERS_SELECT = `${OFFER_COLUMNS}, ${PROFILE_JOIN}`;

export const RSVPS_SELECT = `${RSVP_COLUMNS}, ${PROFILE_JOIN}`;
