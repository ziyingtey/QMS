/** Labels aligned with common MY branch-locator UIs (e.g. Public Bank state list). */
export const MALAYSIA_STATE_FILTERS = [
  "All",
  "Johor",
  "Kedah",
  "Kelantan",
  "Kuala Lumpur",
  "Labuan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Putrajaya",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
] as const;

export type MalaysiaStateFilter = (typeof MALAYSIA_STATE_FILTERS)[number];
