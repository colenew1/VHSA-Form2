import express from 'express';
import { supabase } from '../utils/supabase.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .eq('active', true)
      .order('name');
    
    if (error) {
      console.error('Error fetching schools:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch schools',
        message: error.message
      });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Unexpected error in GET /api/schools:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;
