export function PersistedIntendedUse({ value }: { value: string }) {
  return (
    <p
      className="mt-2 min-w-0 max-w-full whitespace-pre-wrap leading-7 text-stone-700"
      style={{ overflowWrap: "anywhere" }}
    >
      {value}
    </p>
  );
}
