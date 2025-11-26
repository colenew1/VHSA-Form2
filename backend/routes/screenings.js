import express from 'express';
import { supabase } from '../utils/supabase.js';

// Import shared logic - single source of truth for screening logic
import {
  extractOverallResults,
  buildScreeningData,
  mergeScreeningData
} from '../../shared/screening-logic.js';

const router = express.Router();

// Submit screening results
router.post('/', async (req, res) => {
  try {
    const payload = req.body;
    const { uniqueId, screeningDate } = payload;
    
    if (!uniqueId || !screeningDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: uniqueId and screeningDate'
      });
    }
    
    // Get student
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, school')
      .eq('unique_id', uniqueId)
      .single();
    
    if (studentError || !student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }
    
    // Check if screening already exists
    const { data: existingScreening } = await supabase
      .from('screening_results')
      .select('*')
      .eq('student_id', student.id)
      .maybeSingle();
    
    // Build screening data using shared logic
    const screeningData = buildScreeningData(payload, existingScreening, student);
    
    let result;
    if (existingScreening) {
      // Update existing - merge with existing data
      const finalData = mergeScreeningData(existingScreening, screeningData);
      
      const { error: updateError } = await supabase
        .from('screening_results')
        .update(finalData)
        .eq('student_id', student.id)
        .select();
      
      if (updateError) {
        throw updateError;
      }
      result = { success: true, message: 'Screening results updated' };
    } else {
      // Create new
      const { error: insertError } = await supabase
        .from('screening_results')
        .insert({
          ...screeningData,
          created_at: new Date().toISOString()
        })
        .select();
      
      if (insertError) {
        throw insertError;
      }
      result = { success: true, message: 'Screening results saved' };
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error in POST /api/screenings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;
