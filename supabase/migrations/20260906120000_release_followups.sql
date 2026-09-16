-- Recovered verbatim in substance from the already-applied production migration.
-- Keeps fresh installs consistent with the database (no new production changes).
drop index if exists public.idx_admin_audit_actor;
drop index if exists public.idx_admin_audit_created;
create index if not exists idx_content_reports_comment on public.content_reports (comment_id);
create index if not exists idx_content_reports_pool on public.content_reports (pool_id);
create index if not exists idx_content_reports_reported_user on public.content_reports (reported_user_id);
create index if not exists idx_pool_promotions_requested_by on public.pool_promotions (requested_by);
create index if not exists idx_payout_requests_tenant on public.payout_requests (tenant_id);
create index if not exists idx_payout_requests_reviewed_by on public.payout_requests (reviewed_by);
create index if not exists idx_comments_moderated_by on public.comments (moderated_by);
revoke execute on function public.set_pool_share_slug() from public, anon, authenticated;
revoke execute on function public.enforce_display_name_rules() from public, anon, authenticated;
