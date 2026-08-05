-- The Northbook bootstrap reads Rush-owned entities through the server-side
-- integration client. Some legacy tables predate the standard service-role
-- grants, so grant the API only the read access required for bootstrap.
grant select on table
  public.clients,
  public.projects,
  public.studios
to service_role;
