"use client";
import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from "react";
import { readCheckoutDraft, writeCheckoutDraft } from "@/features/kyc/checkout-draft";
import { ADDRESS_GROUPS, canonicalPath, FRIENDLY_AREA_BY_LOCALITY, groupForRegion, projectAddressPath, provinceAreaChoices } from "./address-presentation";
import { prepareAddressSelection, restoredAddress } from "./address-selection";
import { addressReferenceSchema, psgcChoicesSchema, type AddressGroupId, type AddressPath, type AddressReference, type PsgcChoice } from "./types";
import type { PsgcAreaSelectorProps } from "./psgc-area-selector";

const EMPTY_PATH: AddressPath = [];
const inputClass = "min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2";
export function ShoppingAreaSelector({initialPath = EMPTY_PATH, draftKey, name = "psgcAreaCode", errorId, invalid,
  onSelectionChange, onManualSelectionChange, externalSelection, onExternalSelectionApplied, fallback,
}: PsgcAreaSelectorProps & {fallback: ReactNode}) {
  const id = useId();
  const [restore] = useState(()=>restoredAddress(readCheckoutDraft<unknown>(draftKey),initialPath));
  const [reference,setReference] = useState<AddressReference | null>(null);
  const [path,setPath] = useState<AddressPath>([]);
  const [group,setGroup] = useState<AddressGroupId | null>(restore.groupId);
  const [barangays,setBarangays] = useState<PsgcChoice[]>([]);
  const [status,setStatus] = useState<"loading"|"ready"|"error">("loading");
  const [attempt,setAttempt] = useState(0);
  const retryPath = useRef<AddressPath>(restore.path);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string,PsgcChoice[]>());
  const appliedRequest = useRef<number | null>(null);
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const notifyApplied = useEffectEvent((request: number) => onExternalSelectionApplied?.(request));
  const notifySelection = useEffectEvent((value: AddressPath, release: string) => onSelectionChange?.(value.at(-1) ?? null, release));
  const persistApplied = useEffectEvent(persist);

  async function leafChoices(ref: AddressReference, parent: string, signal: AbortSignal) {
    const key = ref.release + ":" + parent;
    const cached = cache.current.get(key);
    if (cached) return cached;
    const response = await fetch("/api/locations/psgc?parent=" + parent, {signal, cache:"no-cache"});
    if (!response.ok) throw new Error("reference_unavailable");
    const payload = psgcChoicesSchema.parse(await response.json());
    if (payload.release !== ref.release) throw new Error("reference_changed");
    cache.current.set(key,payload.choices);
    return payload.choices;
  }
  function persist(ref: AddressReference, nextPath: AddressPath, nextGroup: AddressGroupId | null) {
    writeCheckoutDraft(draftKey,{version:2,canonicalPath:nextPath,groupId:nextGroup,release:ref.release});
  }
  useEffect(()=>{
    const request = ++requestId.current;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    async function load() {
      try {
        const response = await fetch("/api/locations/psgc?view=address-reference",{signal:active.signal,cache:"no-cache"});
        if (!response.ok) throw new Error("reference_unavailable");
        const ref = addressReferenceSchema.parse(await response.json());
        const selection = await prepareAddressSelection(ref,retryPath.current,parent=>leafChoices(ref,parent,active.signal));
        if (active.signal.aborted || request !== requestId.current) return;
        setReference(ref); setPath(selection.path); setBarangays(selection.barangays);
        setGroup(selection.groupId ?? restore.groupId); setStatus("ready");
      } catch {
        if (!active.signal.aborted && request === requestId.current) setStatus("error");
      }
    }
    void load();
    return ()=>{active.abort();};
  },[attempt,restore.groupId]);

  useEffect(()=>{
    if (!externalSelection || !reference || appliedRequest.current === externalSelection.requestId) return;
    appliedRequest.current = externalSelection.requestId;
    const request = ++requestId.current;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    async function apply() {
      try {
        let ref = reference!;
        if (ref.release !== externalSelection!.release) {
          cache.current.clear();
          const response = await fetch("/api/locations/psgc?view=address-reference",{signal:active.signal,cache:"no-cache"});
          if (!response.ok) throw new Error("reference_unavailable");
          ref = addressReferenceSchema.parse(await response.json());
        }
        if (ref.release !== externalSelection!.release) throw new Error("reference_changed");
        const next = await prepareAddressSelection(ref,externalSelection!.path,parent=>leafChoices(ref,parent,active.signal));
        if (active.signal.aborted || request !== requestId.current) return;
        if (JSON.stringify(next.path) !== JSON.stringify(externalSelection!.path)) throw new Error("reference_changed");
        setReference(ref);setPath(next.path);setGroup(next.groupId);setBarangays(next.barangays);setStatus("ready");
        persistApplied(ref,next.path,next.groupId);
        notifySelection(next.path,ref.release);
        notifyApplied(externalSelection!.requestId);
        requestAnimationFrame(()=>{
          if (request === requestId.current) {
            const unanswered = [...(fieldset.current?.querySelectorAll("select") ?? [])].find(el=>!el.value);
            unanswered?.focus();
          }
        });
      } catch {
        if (!active.signal.aborted && request === requestId.current) setStatus("error");
      }
    }
    void apply();
    return ()=>{active.abort();};
  },[externalSelection,reference]); // callback identity must not restart a location result

  async function select(code: string, selectedGroup: AddressGroupId | null = group) {
    if (!reference) return;
    onManualSelectionChange?.();
    const request = ++requestId.current;
    controller.current?.abort();
    const active = new AbortController();
    controller.current=active;
    const leaf = barangays.find(n=>n.code===code);
    const next = leaf ? [...path.filter(n=>n.type!=="barangay"),{code:leaf.code,name:leaf.name,type:leaf.type}] : canonicalPath(reference,code);
    retryPath.current=next;
    setPath(next);setGroup(selectedGroup);setBarangays([]);setStatus("loading");
    persist(reference,next,selectedGroup);
    onSelectionChange?.(next.at(-1) ?? null, reference.release);
    try {
      const prepared = await prepareAddressSelection(reference,next,parent=>leafChoices(reference,parent,active.signal));
      if (active.signal.aborted || request !== requestId.current) return;
      setPath(prepared.path);setBarangays(prepared.barangays);setStatus("ready");
    } catch {if(request === requestId.current) setStatus("error");}
  }
  if (reference?.nodes.some(n=>n.type==="region" && !groupForRegion(n.code))) return <>{fallback}</>;
  const presented = reference ? projectAddressPath(reference,path) : null;
  const areaId = presented?.areaId;
  const localities = reference?.nodes.filter(n=>
    ["city","municipality"].includes(n.type) &&
    (group === "metro-manila" ? n.parentCode==="1300000000" :
      n.parentCode===areaId || n.code===areaId || FRIENDLY_AREA_BY_LOCALITY[n.code]===areaId),
  ).sort((a,b)=>a.name.localeCompare(b.name)) ?? [];
  const districts = reference?.nodes.filter(n=>n.type==="submunicipality" && n.parentCode===presented?.localityCode) ?? [];
  const selectedCode = status === "ready" ? path.find(n=>n.type==="barangay")?.code ?? "" : "";
  return <fieldset ref={fieldset} className="space-y-3" aria-invalid={invalid || undefined} aria-describedby={[id+"-status",errorId].filter(Boolean).join(" ")}>
    <legend className="text-sm font-medium">Philippine address</legend>
    <input name={name} type="hidden" value={selectedCode}/>
    <input name="psgcRelease" type="hidden" value={status==="ready" ? reference?.release ?? "" : ""}/>
    {reference ? <>
      <AreaDropdown label="Region" value={group ?? ""} choices={ADDRESS_GROUPS.map(g=>({code:g.id,name:g.label}))} onChange={code=>void select(code==="metro-manila" ? "1300000000" : "",code as AddressGroupId || null)}/>
      {group && group!=="metro-manila" ? <AreaDropdown label="Province or area" value={areaId ?? ""} choices={provinceAreaChoices(reference,group).map(a=>({code:a.id,name:a.label}))} onChange={code=>void select(code)}/> : null}
      {localities.length ? <AreaDropdown label="City or municipality" value={presented?.localityCode ?? ""} choices={localities} onChange={code=>void select(code || areaId || "")}/> : null}
      {districts.length ? <AreaDropdown label="District" value={presented?.districtCode ?? ""} choices={districts} onChange={code=>void select(code || presented?.localityCode || "")}/> : null}
      {barangays.length ? <AreaDropdown label="Barangay" value={presented?.barangayCode ?? ""} choices={barangays} onChange={code=>void select(code || presented?.districtCode || presented?.localityCode || "")}/> : null}
    </> : null}
    <p id={id+"-status"} role={status==="error" ? "alert" : "status"} aria-live="polite" className="text-sm text-stone-600">
      {status==="loading" ? "Loading valid areas…" : status==="error" ? "Area choices could not be loaded. Retry to continue with your address." : selectedCode ? "Barangay selected." : "Choose your region, province or area, city or municipality, and barangay."}
    </p>
    {status==="error" ? <button type="button" className="button-secondary" onClick={()=>{
      cache.current.clear(); retryPath.current=path.length ? path : restore.path; setStatus("loading"); setAttempt(n=>n+1);
    }}>Retry area lookup</button> : null}
  </fieldset>;
}

function AreaDropdown({label,value,choices,onChange}:{label:string;value:string;choices:Array<{code:string;name:string}>;onChange:(code:string)=>void}) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</span>
    <select className={inputClass} value={value} onChange={e=>onChange(e.target.value)}>
      <option value="">Select…</option>{choices.map(n=><option key={n.code} value={n.code}>{n.name}</option>)}
    </select></label>;
}
