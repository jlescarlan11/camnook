import { z } from "zod";

const streetAddressTerm =
  /\b(?:street|road|avenue|boulevard|barangay|brgy|house|unit|lot|block)\b/iu;
const abbreviatedStreetSuffix = /\b(?:st|rd|ave|blvd)\.?$/iu;

export const cityInputSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{L} .'-]+$/u)
  .refine(
    (value) =>
      !streetAddressTerm.test(value) && !abbreviatedStreetSuffix.test(value),
  );
