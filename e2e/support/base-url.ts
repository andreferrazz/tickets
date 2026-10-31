/** The port the suite's own dev server listens on; the config and the helpers share it. */
export const E2E_PORT = 5273;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** A second server on the blank database, for the first-run spec alone. */
export const E2E_SETUP_PORT = 5274;
export const E2E_SETUP_BASE_URL = `http://localhost:${E2E_SETUP_PORT}`;
