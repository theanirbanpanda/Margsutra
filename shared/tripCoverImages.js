// Shared destination photos used until an admin uploads a trip-specific cover.
// A saved coverImageUrl always takes precedence over these demo defaults.
const RAJMACHI_COVER =
  "https://vl-prod-static.b-cdn.net/system/images/000/763/352/9f4757badd42ba87ef9984dfaefc1c15/original/Rajmachi-Trek-27.jpg?width=1100";
const HARISHCHANDRAGAD_COVER =
  "https://vl-prod-static.b-cdn.net/system/images/000/460/427/aeba98c8c7be7d5b27563972c59b625c/original/kokan_kada.jpg?width=1100";

export function getTripCoverImage(trip = {}) {
  const customCover = String(trip.coverImageUrl || trip.imageUrl || "").trim();
  if (customCover) return customCover;

  const identity = `${trip.code || ""} ${trip.name || ""} ${trip.location || ""}`;
  if (/harishchandra|konkan kada/i.test(identity)) return HARISHCHANDRAGAD_COVER;
  if (/rajmachi/i.test(identity)) return RAJMACHI_COVER;
  return "";
}

export function getTripCoverAlt(trip = {}) {
  const identity = `${trip.code || ""} ${trip.name || ""} ${trip.location || ""}`;
  if (/harishchandra|konkan kada/i.test(identity)) {
    return "Konkan Kada cliff at Harishchandragad in Maharashtra";
  }
  if (/rajmachi/i.test(identity)) {
    return "Rajmachi Fort landscape near Lonavala, Maharashtra";
  }
  return `${trip.name || "Trek"} cover photo`;
}
