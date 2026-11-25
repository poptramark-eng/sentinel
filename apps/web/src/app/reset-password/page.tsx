import { ResetPasswordForm } from "./reset-password-form";

export const metadata = {
  title: "Reset password | Sentinel",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] ?? "" : params.token ?? "";
  return <ResetPasswordForm token={token} />;
}
