-- The service-role JWT bypasses RLS, but PostgreSQL table and sequence
-- privileges are still required. SQL-editor-created tables do not always
-- inherit the API roles' default grants, so grant them explicitly.
grant usage on schema public to service_role;

grant all privileges on table
  public.northbook_integration_connections,
  public.northbook_authorization_codes,
  public.northbook_access_tokens,
  public.northbook_refresh_tokens,
  public.northbook_billing_requests,
  public.northbook_accounting_documents,
  public.northbook_accounting_document_revisions,
  public.northbook_project_summaries,
  public.northbook_idempotency_keys,
  public.northbook_delivery_attempts,
  public.northbook_integration_audit_log,
  public.northbook_change_log
to service_role;

grant usage, select on sequence
  public.northbook_integration_audit_log_id_seq,
  public.northbook_change_log_sequence_seq
to service_role;
