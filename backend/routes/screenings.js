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
    console.log('Received payload structure:', JSON.stringify({ vision, hearing }, null, 2));
    
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
    
    // Vision screening - handle both day1 and initial/rescreen structures
    const visionData = vision?.day1 || vision?.initial || vision?.rescreen;
    if (visionData) {
      if (visionData.type) updateData.vision_day1_type = visionData.type;
      if (visionData.screener) updateData.vision_day1_screener = visionData.screener;
      if (visionData.date) updateData.vision_day1_date = visionData.date;
      if (visionData.glasses !== undefined) updateData.vision_day1_glasses = visionData.glasses === 'yes';
      if (visionData.rightEye) updateData.vision_day1_right_eye = visionData.rightEye;
      if (visionData.leftEye) updateData.vision_day1_left_eye = visionData.leftEye;
      if (visionData.result) updateData.vision_day1_result = visionData.result;
      
      // Capture vision_overall (screener's explicit pass/fail determination)
      // Convert 'pass' to 'PASS', 'fail' to 'FAIL' (all caps)
      if (visionData.result) {
        const result = String(visionData.result).toLowerCase().trim();
        console.log('Vision result received:', result, 'from visionData:', visionData);
        if (result === 'pass') {
          updateData.vision_overall = 'PASS';
        } else if (result === 'fail') {
          updateData.vision_overall = 'FAIL';
        } else {
          updateData.vision_overall = null;
          console.warn('Unexpected vision result value:', visionData.result);
        }
      } else {
        console.log('No vision result found in visionData:', visionData);
      }
    } else {
      console.log('No vision data found. vision object:', vision);
    }
    
    // Hearing screening - handle both day1 and initial/rescreen structures
    const hearingData = hearing?.day1 || hearing?.initial || hearing?.rescreen;
    if (hearingData) {
      if (hearingData.type) updateData.hearing_day1_type = hearingData.type;
      if (hearingData.screener) updateData.hearing_day1_screener = hearingData.screener;
      if (hearingData.date) updateData.hearing_day1_date = hearingData.date;
      if (hearingData.result) updateData.hearing_day1_result = hearingData.result;
      
      // Capture hearing_overall (screener's explicit pass/fail determination)
      // Convert 'pass' to 'PASS', 'fail' to 'FAIL' (all caps)
      if (hearingData.result) {
        const result = String(hearingData.result).toLowerCase().trim();
        console.log('Hearing result received:', result, 'from hearingData:', hearingData);
        if (result === 'pass') {
          updateData.hearing_overall = 'PASS';
        } else if (result === 'fail') {
          updateData.hearing_overall = 'FAIL';
        } else {
          updateData.hearing_overall = null;
          console.warn('Unexpected hearing result value:', hearingData.result);
        }
      } else {
        console.log('No hearing result found in hearingData:', hearingData);
      }
    } else {
      console.log('No hearing data found. hearing object:', hearing);
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
    
    // Log the final updateData to show what's being stored
    console.log('Storing vision_overall:', updateData.vision_overall);
    console.log('Storing hearing_overall:', updateData.hearing_overall);
    
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
