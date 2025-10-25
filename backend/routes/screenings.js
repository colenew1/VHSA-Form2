import express from 'express';
import { supabase } from '../utils/supabase.js';
import { validateRequired } from '../utils/validators.js';

const router = express.Router();

// Submit screening results
router.post('/', async (req, res) => {
  try {
    const {
      uniqueId,
      screeningDate,
      absent,
      notes,
      screenerName,
      vision,
      hearing,
      acanthosis,
      scoliosis
    } = req.body;
    
    console.log('Submitting screening results for:', uniqueId);
    
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
    
    // Build update data
    const updateData = {
      student_id: student.id,
      screening_date: screeningDate,
      absent: absent || false,
      notes: notes || null,
      updated_at: new Date().toISOString()
    };
    
    // Vision screening
    if (vision?.day1) {
      if (vision.day1.type) updateData.vision_day1_type = vision.day1.type;
      if (vision.day1.screener) updateData.vision_day1_screener = vision.day1.screener;
      if (vision.day1.date) updateData.vision_day1_date = vision.day1.date;
      if (vision.day1.glasses !== undefined) updateData.vision_day1_glasses = vision.day1.glasses === 'yes';
      if (vision.day1.rightEye) updateData.vision_day1_right_eye = vision.day1.rightEye;
      if (vision.day1.leftEye) updateData.vision_day1_left_eye = vision.day1.leftEye;
      if (vision.day1.result) updateData.vision_day1_result = vision.day1.result;
    }
    
    // Hearing screening
    if (hearing?.day1) {
      if (hearing.day1.type) updateData.hearing_day1_type = hearing.day1.type;
      if (hearing.day1.screener) updateData.hearing_day1_screener = hearing.day1.screener;
      if (hearing.day1.date) updateData.hearing_day1_date = hearing.day1.date;
      if (hearing.day1.result) updateData.hearing_day1_result = hearing.day1.result;
    }
    
    // Acanthosis screening
    if (acanthosis?.day1) {
      if (acanthosis.day1.type) updateData.acanthosis_day1_type = acanthosis.day1.type;
      if (acanthosis.day1.screener) updateData.acanthosis_day1_screener = acanthosis.day1.screener;
      if (acanthosis.day1.date) updateData.acanthosis_day1_date = acanthosis.day1.date;
      if (acanthosis.day1.result) updateData.acanthosis_day1_result = acanthosis.day1.result;
    }
    
    // Scoliosis screening
    if (scoliosis?.day1) {
      if (scoliosis.day1.type) updateData.scoliosis_day1_type = scoliosis.day1.type;
      if (scoliosis.day1.screener) updateData.scoliosis_day1_screener = scoliosis.day1.screener;
      if (scoliosis.day1.date) updateData.scoliosis_day1_date = scoliosis.day1.date;
      if (scoliosis.day1.observations) updateData.scoliosis_day1_observations = scoliosis.day1.observations;
      if (scoliosis.day1.result) updateData.scoliosis_day1_result = scoliosis.day1.result;
    }
    
    let result;
    if (existingScreening) {
      // Update existing
      const { error: updateError } = await supabase
        .from('screening_results')
        .update(updateData)
        .eq('student_id', student.id);
      
      if (updateError) throw updateError;
      result = { success: true, message: 'Screening results updated' };
    } else {
      // Create new
      const { error: insertError } = await supabase
        .from('screening_results')
        .insert({
          ...updateData,
          created_at: new Date().toISOString()
        });
      
      if (insertError) throw insertError;
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
