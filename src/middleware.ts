import { sequence } from "astro:middleware";

export const onRequest = sequence();
