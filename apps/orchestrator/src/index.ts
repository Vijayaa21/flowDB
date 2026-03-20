import { handle } from "hono/vercel";

import { createApp } from "./server.js";

const app = createApp();

export { app };
export default handle(app);
