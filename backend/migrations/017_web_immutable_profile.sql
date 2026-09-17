INSERT INTO web_organization_profiles(organization_id,profile)
 SELECT id,'NONPROFIT' FROM organizations ON CONFLICT DO NOTHING;
CREATE FUNCTION prevent_organization_profile_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.profile IS DISTINCT FROM OLD.profile THEN
  RAISE EXCEPTION 'Die Organisationsart ist nach der Erstellung unveränderlich.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER organization_profile_immutable BEFORE UPDATE ON web_organization_profiles
 FOR EACH ROW EXECUTE FUNCTION prevent_organization_profile_change();
