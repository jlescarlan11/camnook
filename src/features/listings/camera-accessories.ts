import { z } from "zod";

type Accessory = { name: string; quantity: number };
const schema = z.array(z.object({ name: z.string().trim().min(1).max(160), quantity: z.number().int().positive().max(2_147_483_647) }));

export function formatCameraAccessories(accessories: Accessory[]) {
  return accessories.map((item) => `${item.quantity} × ${item.name}`).join("\n");
}

export function parseCameraAccessories(value: string): Accessory[] | null {
  const items = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = /^([+-]?\d+(?:\.\d+)?)\s*[x×](?:\s+|$)(.*)$/i.exec(line);
    return match ? { name: match[2].trim(), quantity: Number(match[1]) } : { name: line, quantity: 1 };
  });
  const parsed = schema.safeParse(items);
  if (!parsed.success || new Set(items.map((item) => item.name.toLowerCase())).size !== items.length) return null;
  return parsed.data;
}
