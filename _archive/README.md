# Archived Code

This folder contains code that has been disabled but preserved for reference.

## Contents

### `auth.js` (from backend/routes/)
Authentication routes for magic link login. Disabled while auth system is rebuilt as a standalone system.

### `login.html` (from frontend/)
Login page for magic link authentication. Disabled while auth system is rebuilt.

## When to Use

These files can be referenced when rebuilding the authentication system. They contain working magic link authentication code using Supabase Auth.

## Re-enabling

If you need to re-enable auth:
1. Move files back to their original locations
2. Update `backend/server.js` to import and use the auth router
3. Test thoroughly before deploying

