// The root layout turns SSR off for the whole app. Page options override layout
// options, so this re-enables it for the home page alone — the other routes are
// still client-rendered against Phoenix and have never been server-rendered.
export const ssr = true;
