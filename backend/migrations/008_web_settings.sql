-- Organization identity is the existing shared record; version protects concurrent edits.
ALTER TABLE organizations ADD COLUMN settings_version INTEGER NOT NULL DEFAULT 1 CHECK (settings_version > 0);

-- Preferences belong to the authenticated user, never to a caller-selected account.
CREATE TABLE web_user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme_mode TEXT NOT NULL DEFAULT 'dark' CHECK (theme_mode IN ('dark','light')),
  color_theme TEXT NOT NULL DEFAULT 'default' CHECK (color_theme IN ('default','fiery-ocean','peachy-delight','pastel-dreamland','ocean-breeze','earthy-tones','monochrome-harmony','vintage-charm','soft-blush','professional-light')),
  nav_layout TEXT NOT NULL DEFAULT 'left' CHECK (nav_layout IN ('left','top')),
  nav_icon_color_mode TEXT NOT NULL DEFAULT 'color' CHECK (nav_icon_color_mode IN ('color','mono')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
