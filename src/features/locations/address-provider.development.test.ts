import { expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { GeoapifyAdapter } from "@/features/meetups/provider";

it.skipIf(process.env.RUN_ADDRESS_PROVIDER_DEVELOPMENT_CHECK !== "1")("samples public Cebu and Manila area hints from Development Geoapify",async()=>{
  expect(process.env.VERCEL_ENV).not.toBe("production");
  expect(process.env.GEOAPIFY_API_KEY).toBeTruthy();
  const provider=new GeoapifyAdapter({apiKey:process.env.GEOAPIFY_API_KEY!,timeoutMs:10_000});
  for (const place of [
    {name:"UP Cebu public campus",latitude:10.3225,longitude:123.8983},
    {name:"Rizal Park public landmark",latitude:14.5826,longitude:120.9787},
  ]) {
    const hints=await provider.reverseGeocodeAddressAreas(place);
    expect(hints.countryCode).toBe("PH");
    expect(hints.city || hints.municipality).toBeTruthy();
    console.info({publicPlace:place.name,country:hints.countryCode,city:hints.city,municipality:hints.municipality,state:hints.state,county:hints.county,suburb:hints.suburb,village:hints.village,district:hints.district});
  }
},30_000);
