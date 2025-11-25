import { Express } from "express";

/** Render terminates public traffic at its managed ingress. Trust only the
 * nearest forwarded hop; never trust an arbitrary client-supplied prefix. */
export function configureProxy(app: Express, render = process.env.RENDER): void {
  app.set("trust proxy", render === "true" ? 1 : false);
}
