import { z } from 'zod';

/**
 * Zod schema for tutorial response validation from Drupal JSON-RPC API
 */
export const TutorialSchema = z.object({
  score: z.number(),
  id: z.string(),
  bundle: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  excerpt: z.string().optional(),
  url: z.string().url().optional(),
  author: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  drupal_version: z.array(z.string()).optional(),
  category: z.string(),
});

/**
 * TypeScript type inferred from TutorialSchema
 */
export type Tutorial = z.infer<typeof TutorialSchema>;

/**
 * Zod schema for search response validation
 */
export const SearchResponseSchema = z.object({
  results: z.array(TutorialSchema),
  total: z.number(),
  limit: z.number().optional(),
});

/**
 * TypeScript type inferred from SearchResponseSchema
 */
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
