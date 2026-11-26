import { AcceptTeacherInvitationForm } from "./accept-teacher-invitation-form";

export const metadata = {
  title: "Accept teacher invitation | Sentinel",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function AcceptTeacherInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] ?? "" : params.token ?? "";
  return <AcceptTeacherInvitationForm token={token} />;
}
