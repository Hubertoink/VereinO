-- Personal settings that can be shared across browsers in the web pilot.
ALTER TABLE web_user_preferences
  ADD COLUMN workflow_data JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN table_data JSONB NOT NULL DEFAULT '{}';
