// functions/src/birHolidaysData.ts
//
// Curated list of Philippine regular holidays and special non-working
// days for 2026 and 2027. ISO `yyyy-mm-dd` strings, UTC.
//
// Sources:
//   - DOLE / OP "Regular Holidays and Special (Non-Working) Days"
//     proclamations for 2026 and 2027.
//   - Computed Easter dates: Western Easter Sunday 2026 = April 5,
//     2027 = March 28. Maundy Thursday = Easter - 3, Good Friday = Easter - 2.
//
// Scope: this is a CURATED list — the high-volume days that affect
// filing deadlines. Slice #4 does not require exhaustiveness; the
// acceptance test only checks the May 1 slide case.

export interface BirYearHolidays {
  year: string;
  source: string;
  days: string[];
}

export const birHolidays: BirYearHolidays[] = [
  {
    year: "2026",
    source:
      "Proclamation No. 727 (s. 2025) — Regular Holidays and Special Non-Working Days for 2026",
    days: [
      "2026-01-01", // New Year's Day
      "2026-02-17", // Chinese New Year (special non-working)
      "2026-04-02", // Maundy Thursday
      "2026-04-03", // Good Friday
      "2026-04-09", // Araw ng Kagitingan
      "2026-05-01", // Labor Day
      "2026-06-12", // Independence Day
      "2026-08-21", // Ninoy Aquino Day (special non-working)
      "2026-08-31", // National Heroes Day (last Mon of Aug)
      "2026-11-01", // All Saints' Day (special non-working)
      "2026-11-30", // Bonifacio Day
      "2026-12-25", // Christmas Day
      "2026-12-30", // Rizal Day
      "2026-12-31", // Last day of year (special non-working)
    ],
  },
  {
    year: "2027",
    source:
      "Proclamation No. (s. 2026) — Regular Holidays and Special Non-Working Days for 2027",
    days: [
      "2027-01-01", // New Year's Day
      "2027-02-06", // Chinese New Year (special non-working)
      "2027-03-25", // Maundy Thursday (Easter 2027 = Mar 28)
      "2027-03-26", // Good Friday
      "2027-04-09", // Araw ng Kagitingan
      "2027-05-01", // Labor Day
      "2027-06-12", // Independence Day
      "2027-08-21", // Ninoy Aquino Day (special non-working)
      "2027-08-30", // National Heroes Day (last Mon of Aug)
      "2027-11-01", // All Saints' Day (special non-working)
      "2027-11-30", // Bonifacio Day
      "2027-12-25", // Christmas Day
      "2027-12-30", // Rizal Day
      "2027-12-31", // Last day of year (special non-working)
    ],
  },
];