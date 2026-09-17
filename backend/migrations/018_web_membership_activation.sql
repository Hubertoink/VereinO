-- Legacy deactivation belonged to the only organization. Migration 016 copied
-- that state into its membership. Keep inactive memberships inactive, but allow
-- administrators to reactivate them via the organization-scoped user controls.
UPDATE users u SET is_active=true
 WHERE NOT u.is_active AND NOT EXISTS (
  SELECT 1 FROM organization_memberships m WHERE m.user_id=u.id AND m.is_active
 );
