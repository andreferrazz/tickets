// The root layout turns SSR off for the whole app. Page options override layout
// options, so this re-enables it for this page alone: it now loads from the
// database on the server, and the login redirect must happen before any HTML.
export const ssr = true;
