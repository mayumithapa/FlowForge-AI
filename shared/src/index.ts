/**
 * Shared types intended to be consumed by both backend and frontend over time.
 * For the MVP each side keeps its own DTOs to avoid coupling, but as the
 * surface grows we'll lift cross-cutting types here.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
