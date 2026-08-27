import { z } from "zod";

export const composePrerollActionSchema = z.object({
  action: z.literal("compose_preroll"),
  renderId: z.string().min(1),
  highlightId: z.string().min(1),
  renderVideoUrl: z.string().url(),
});
