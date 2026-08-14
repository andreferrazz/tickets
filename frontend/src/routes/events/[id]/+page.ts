// The root layout turns SSR off for the whole app. Page options override layout
// options, so this re-enables it for the event page alone — a shared event link
// has to carry its title and cover image in the served HTML.
export const ssr = true;
