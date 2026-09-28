// =====================================================================
// Art Class Gallery — settings
// Fill in supabaseUrl and supabaseKey from Supabase → Project Settings → API.
// While they are empty, the app runs in demo mode with sample data.
// =====================================================================
window.APP_CONFIG = {
  studioName: "Sasha & Lulu Atelier", // used in messages to parents
  shortName: "Sasha & Lulu",          // big part of the header wordmark
  logo: "logo.png",                  // shown on the login screen
  supabaseUrl: "",                   // e.g. "https://abcdefgh.supabase.co"
  supabaseKey: "",                   // the "anon" / "publishable" key (safe to put here)

  classes: ["Young", "Older"],       // class groups
  levels: ["Sparkle", "Jumble", "Plopping", "Artsy", "Starburst"],   // in order, first to last
  keepDays: 90,                      // photos are removed this many days after the lesson
};
