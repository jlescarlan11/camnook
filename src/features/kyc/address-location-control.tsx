"use client";
import { useEffect, useRef, useState } from "react";
import { Crosshair2Icon } from "@radix-ui/react-icons";
import { addressLocationResultSchema, type AddressLocationResult } from "@/features/locations/types";
import type { DraftPin } from "./residential-pin-picker";

export function AddressLocationControl({invalidationKey, disabled, onResult, onStart}: {
  invalidationKey:number; disabled:boolean; onResult:(result:AddressLocationResult,pin:DraftPin)=>void;
  onStart?:()=>void;
}) {
  const [state,setState]=useState({key:invalidationKey,busy:false,message:""});
  const requestId=useRef(0);
  const controller=useRef<AbortController | null>(null);
  const busy = state.key === invalidationKey && state.busy;
  useEffect(()=>()=>{requestId.current++;controller.current?.abort();},[invalidationKey]);
  function locate() {
    if (busy || disabled) return;
    onStart?.();
    const request=++requestId.current;
    const report=(message:string,busy=false)=>{
      if(request===requestId.current) setState({key:invalidationKey,message,busy});
    };
    if(!navigator.geolocation) {report("Location is unavailable in this browser. Choose your address below.");return;}
    report("Finding your location…",true);
    navigator.geolocation.getCurrentPosition(async position=>{
      if(request!==requestId.current) return;
      const {latitude,longitude,accuracy}=position.coords;
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<4||latitude>22||longitude<116||longitude>127) {
        report("The reported location is outside the Philippines. Choose your address below.");return;
      }
      if(!Number.isFinite(accuracy)||accuracy<=0||accuracy>50_000) {
        report("Your location is too approximate. Try again or choose your address below.");return;
      }
      report("Finding your address…",true);
      const active=new AbortController();controller.current=active;
      const timeout=setTimeout(()=>active.abort(),15_000);
      try {
        const response=await fetch("/api/kyc/residential-geocode",{
          method:"POST",headers:{"content-type":"application/json"},signal:active.signal,
          body:JSON.stringify({mode:"address",latitude,longitude,accuracyMeters:accuracy}),
        });
        if(request!==requestId.current) return;
        if(response.status===422) {report("The reported location is outside the Philippines. Choose your address below.");return;}
        if(!response.ok) throw new Error("lookup_unavailable");
        const result=addressLocationResultSchema.parse(await response.json());
        if(request!==requestId.current) return;
        onResult(result,{latitude,longitude,accuracyMeters:accuracy,source:"device_gps",label:"Device location"});
        report(result.outcome==="complete" ? "Area found from your location. Check the details before continuing." :
          result.outcome==="partial" ? "We found part of your address. Choose the remaining area below and check your pin." :
          "We found your location but couldn’t match its area. Choose your address below and check your pin.");
      } catch {
        report("We couldn’t look up your address. Try again or choose your address below.");
      } finally {clearTimeout(timeout);}
    },error=>{
      report(error.code===1 ? "Location permission was denied. Allow location in your browser or choose your address below." :
        error.code===3 ? "Finding your location timed out. Try again or choose your address below." :
        "Your location is unavailable. Try again or choose your address below.");
    },{enableHighAccuracy:true,maximumAge:60_000,timeout:10_000});
  }
  return <div className="mb-5 space-y-2">
    <button className="button-secondary inline-flex min-h-11 items-center gap-2" type="button" disabled={disabled||busy} onClick={locate}>
      <Crosshair2Icon aria-hidden="true"/>{busy ? "Finding your address…" : "Use my current location"}
    </button>
    <p className="text-sm text-stone-600">At home? Use your location to fill your area, then check the details.</p>
    <p className="text-xs text-stone-500">Your coordinates are sent to Geoapify to suggest your address and map pin.</p>
    <p className="text-sm text-stone-600" role="status" aria-live="polite">{state.key===invalidationKey ? state.message : ""}</p>
  </div>;
}
