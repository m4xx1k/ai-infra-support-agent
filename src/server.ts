import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiRoutes } from "./api/routes.ts";
import { buildApp } from "./app.ts";

const server = new Hono();
server.use("/api/*", cors());
server.route("/api", apiRoutes(buildApp()));
server.get("/", (c) => c.html(readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8")));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: server.fetch, port }, () => console.log(`core + dashboard on http://localhost:${port}`));
