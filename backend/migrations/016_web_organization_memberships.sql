CREATE TABLE organization_memberships (
 organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role VARCHAR(10) NOT NULL CHECK(role IN ('ADMIN','EDITOR','USER')),
 is_active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,user_id)
);
INSERT INTO organization_memberships(organization_id,user_id,role,is_active)
 SELECT organization_id,id,role,is_active FROM users;
CREATE INDEX organization_memberships_user ON organization_memberships(user_id);
ALTER TABLE sessions ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE sessions s SET organization_id=u.organization_id FROM users u WHERE u.id=s.user_id;
-- Keep legacy user creation compatible; memberships are authoritative thereafter.
CREATE FUNCTION create_initial_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO organization_memberships(organization_id,user_id,role,is_active) VALUES(NEW.organization_id,NEW.id,NEW.role,NEW.is_active);
 RETURN NEW;
END $$;
CREATE TRIGGER users_initial_membership AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION create_initial_membership();
