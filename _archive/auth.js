/**
 * ARCHIVED: Authentication routes for magic link login
 * 
 * Original location: backend/routes/auth.js
 * Archived on: 2024-11-26
 * Reason: Auth system being rebuilt as standalone system
 * 
 * To restore: Move to backend/routes/auth.js and update server.js imports
 */

import express from 'express';
import { supabase } from '../utils/supabase.js';

const router = express.Router();

// GET /api/auth/config
// Returns Supabase configuration for frontend (anon key only, safe to expose)
router.get('/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

// POST /api/auth/request-magic-link
// Sends a magic link email via Supabase Auth
router.post('/request-magic-link', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Valid email address is required'
      });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // Optional: Check if email exists in screener_users table
    const { data: existingUser, error: checkError } = await supabase
      .from('screener_users')
      .select('email')
      .eq('email', normalizedEmail)
      .single();

    // Send magic link via Supabase Auth REST API
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    const redirectUrl = `${req.protocol}://${req.get('host')}/api/auth/callback`;
    
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({
          email: normalizedEmail,
          data: {},
          options: {
            emailRedirectTo: redirectUrl
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Error sending magic link:', data);
        return res.status(500).json({
          success: false,
          error: data.error?.message || 'Failed to send magic link. Please try again.'
        });
      }
    } catch (fetchError) {
      console.error('Error sending magic link (fetch error):', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to send magic link. Please try again.'
      });
    }

    // If email doesn't exist in screener_users, optionally create it
    if (!existingUser) {
      const { error: insertError } = await supabase
        .from('screener_users')
        .insert({
          email: normalizedEmail,
          name: null
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating screener user:', insertError);
      }
    }

    res.json({
      success: true,
      message: 'Magic link sent to your email. Please check your inbox.'
    });
  } catch (error) {
    console.error('Unexpected error in request-magic-link:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/auth/callback
// Handles magic link redirect from Supabase
router.get('/callback', async (req, res) => {
  try {
    const { token_hash, type, email } = req.query;

    if (!token_hash || type !== 'email') {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Invalid authentication link</h1>
            <p>Please request a new magic link.</p>
            <script>
              setTimeout(() => window.location.href = '/login.html', 3000);
            </script>
          </body>
        </html>
      `);
    }

    // Redirect to frontend with token_hash - frontend will exchange it for session
    const redirectUrl = new URL('/login.html', `${req.protocol}://${req.get('host')}`);
    redirectUrl.searchParams.set('token_hash', token_hash);
    redirectUrl.searchParams.set('type', type);
    if (email) redirectUrl.searchParams.set('email', email);

    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('Error in callback:', error);
    res.status(500).send('Authentication error');
  }
});

// POST /api/auth/verify-session
// Verifies session token from frontend
router.post('/verify-session', async (req, res) => {
  try {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(401).json({
        success: false,
        error: 'No access token provided'
      });
    }

    // Verify the session with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(access_token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session'
      });
    }

    // Get user info from screener_users table and update last_login
    const { data: screenerUser, error: dbError } = await supabase
      .from('screener_users')
      .select('id, email, name, created_at, last_login')
      .eq('email', user.email?.toLowerCase())
      .single();

    // Update last_login timestamp
    if (user.email) {
      await supabase
        .from('screener_users')
        .update({ 
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('email', user.email.toLowerCase());
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: screenerUser?.name || null,
        created_at: screenerUser?.created_at || null,
        last_login: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Unexpected error in verify-session:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/auth/me
// Returns current user info (protected route)
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided'
      });
    }

    const access_token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(access_token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session'
      });
    }

    const { data: screenerUser } = await supabase
      .from('screener_users')
      .select('id, email, name, created_at, last_login')
      .eq('email', user.email?.toLowerCase())
      .single();

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: screenerUser?.name || null,
        created_at: screenerUser?.created_at || null,
        last_login: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Unexpected error in /me:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const { access_token } = req.body;

    if (access_token) {
      await supabase.auth.signOut();
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Unexpected error in logout:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;

