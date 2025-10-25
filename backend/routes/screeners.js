import express from 'express';
import { supabase } from '../utils/supabase.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    console.log('Fetching active screeners...');
    const { data, error } = await supabase
      .from('screeners')
      .select('*')
      .eq('active', true)
      .order('name');
    
    if (error) {
      console.error('Error fetching screeners:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch screeners'
      });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Unexpected error in GET /api/screeners:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
