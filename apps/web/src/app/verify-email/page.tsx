import { VerifyEmailClient } from "./verify-email-client";

export const metadata = {
  title: "Verify your email | Sentinel",
  referrer: "no-referrer" as const,
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return <VerifyEmailClient token={params.token ?? ""} />;
}
