// The root layout turns SSR off for the whole app. Page options override layout
// options, so this re-enables it for this page alone: its form actions and
// redirects run on the server before any HTML.
export const ssr = true;
