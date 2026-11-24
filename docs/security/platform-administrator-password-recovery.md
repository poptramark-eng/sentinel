# One-time Platform Administrator password recovery

This procedure resets the password of an **existing** active Platform Administrator. It does not create an account, add an email address, or change the verified login identifier.

## Preconditions

- Run from a trusted development machine with access to the Sentinel repository.
- Use the production Neon connection string in `DATABASE_URL` (prefer the pooled/runtime URL).
- Ensure the repository dependencies can be installed and the database package can generate its Prisma client.
- Use the exact, already-verified administrator email address.
- Do not put the password in a command-line argument, source file, or committed `.env` file.

## Windows PowerShell

Run these commands from the repository root. The password is requested through a masked secure prompt and is held only in the current PowerShell process environment while the script runs.

```powershell
$env:RESET_ADMIN_EMAIL = "poptramark@gmail.com"
$securePassword = Read-Host "Enter the new Sentinel password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $env:RESET_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

  pnpm install
  pnpm db:generate
  pnpm --filter @cbe/database build
  pnpm --filter @cbe/api build
  if ($LASTEXITCODE -ne 0) { throw "Build failed; password was not reset." }

  pnpm --filter @cbe/api reset:platform-admin-password
  if ($LASTEXITCODE -ne 0) { throw "Password recovery failed. Review the error above." }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:RESET_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:RESET_ADMIN_EMAIL -ErrorAction SilentlyContinue
  $securePassword = $null
}
```

The repository's root `.env` (or the API package environment) must provide `DATABASE_URL`. Do not use `MIGRATION_DATABASE_URL`; this procedure does not run migrations.

## What the script does

1. Requires `RESET_ADMIN_EMAIL` and `RESET_ADMIN_PASSWORD`; enforces 12–128 characters and rejects whitespace.
2. Finds exactly one verified email identifier matching the supplied address.
3. Confirms its account and Platform Administrator role are both active.
4. Hashes the new password using Sentinel's existing Argon2id configuration.
5. Updates that account's password hash and increments `authVersion`.
6. Revokes all active refresh tokens for that account.
7. Writes an `AUTH_PASSWORD_RESET` audit event in the same database transaction.

If any identity or status check fails, the transaction makes no changes. The script never prints the password or its hash.

## After recovery

Sign in at https://app.poptraworld.digital/login using the verified email and the new password. Existing sessions are invalidated by the reset. Remove any temporary environment variables and do not retain the password in shell history or files.
