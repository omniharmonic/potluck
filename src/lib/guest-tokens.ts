// Client-side store for guest capability tokens.
//
// When a guest creates a claim/offer/RSVP, the server returns a one-time
// secret token that proves ownership of that row. We persist it keyed by row
// id so the same browser can later unclaim/cancel without an account, and
// without the spoofable "match by display name" approach.

type Kind = "claim" | "offer" | "rsvp";

const KEY = "potluck-guest-tokens";

type TokenMap = Record<string, string>; // `${kind}:${id}` -> token

function read(): TokenMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function write(map: TokenMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage unavailable (private mode) — tokens simply won't persist
  }
}

export function storeGuestToken(kind: Kind, id: string, token: string | null) {
  if (!token) return;
  const map = read();
  map[`${kind}:${id}`] = token;
  write(map);
}

export function getGuestToken(kind: Kind, id: string): string | undefined {
  return read()[`${kind}:${id}`];
}

export function removeGuestToken(kind: Kind, id: string) {
  const map = read();
  delete map[`${kind}:${id}`];
  write(map);
}
