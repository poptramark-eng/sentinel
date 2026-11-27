-- The auth.users trigger invokes this function as its owner.
-- API roles must not be able to invoke the trigger function as an RPC.
REVOKE ALL ON FUNCTION public.handle_new_auth_user()
  FROM PUBLIC, anon, authenticated, service_role;
