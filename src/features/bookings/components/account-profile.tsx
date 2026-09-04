import { ProfileForm } from "./profile-form";

type AccountProfileProps = {
  profile: {
    accountStatus: string;
    legalName: string;
    phone: string;
  } | null;
};

export function AccountProfile({ profile }: AccountProfileProps) {
  if (!profile) {
    return (
      <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p>
          Add your name and phone now so your account is ready when
          you choose a camera.
        </p>
        <ProfileForm successMessage="Profile saved. Your account is ready for booking requests." />
      </div>
    );
  }

  return (
    <dl className="mt-5 grid gap-4 sm:grid-cols-3">
      <SummaryValue label="Name" value={profile.legalName} />
      <SummaryValue label="Phone" value={profile.phone} />
      <SummaryValue label="Account status" value={profile.accountStatus} />
    </dl>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium capitalize">{value}</dd>
    </div>
  );
}
