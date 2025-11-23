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
    console.log('=== FULL REQUEST BODY ===');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('=== VISION OBJECT ===');
    console.log('vision:', JSON.stringify(vision, null, 2));
    console.log('vision?.day1:', vision?.day1);
    console.log('vision?.initial:', vision?.initial);
    console.log('vision?.rescreen:', vision?.rescreen);
    console.log('=== HEARING OBJECT ===');
    console.log('hearing:', JSON.stringify(hearing, null, 2));
    console.log('hearing?.day1:', hearing?.day1);
    console.log('hearing?.initial:', hearing?.initial);
    console.log('hearing?.rescreen:', hearing?.rescreen);
    
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
    // Get the actual data object, checking explicitly for null (frontend sends null, not undefined)
    let visionDataObj = null;
    if (vision?.day1 && vision.day1 !== null) {
      visionDataObj = vision.day1;
    } else if (vision?.initial && vision.initial !== null) {
      visionDataObj = vision.initial;
    } else if (vision?.rescreen && vision.rescreen !== null) {
      visionDataObj = vision.rescreen;
    }
    
    if (visionDataObj) {
      if (visionDataObj.type) updateData.vision_day1_type = visionDataObj.type;
      if (visionDataObj.screener) updateData.vision_day1_screener = visionDataObj.screener;
      if (visionDataObj.date) updateData.vision_day1_date = visionDataObj.date;
      if (visionDataObj.glasses !== undefined) updateData.vision_day1_glasses = visionDataObj.glasses === 'yes';
      if (visionDataObj.rightEye) updateData.vision_day1_right_eye = visionDataObj.rightEye;
      if (visionDataObj.leftEye) updateData.vision_day1_left_eye = visionDataObj.leftEye;
      if (visionDataObj.result) updateData.vision_day1_result = visionDataObj.result;
      
      // Capture vision_overall (screener's explicit pass/fail determination)
      // Convert 'pass' to 'PASS', 'fail' to 'FAIL' (all caps)
      if (visionDataObj.result) {
        const result = String(visionDataObj.result).toLowerCase().trim();
        console.log('Vision result received:', result, 'from visionDataObj:', visionDataObj);
        if (result === 'pass') {
          updateData.vision_overall = 'PASS';
        } else if (result === 'fail') {
          updateData.vision_overall = 'FAIL';
        } else {
          updateData.vision_overall = null;
          console.warn('Unexpected vision result value:', visionDataObj.result);
        }
      } else {
        console.log('No vision result found in visionDataObj:', visionDataObj);
      }
    } else {
      console.log('No vision data found. vision object:', vision);
    }
    
    // Hearing screening - handle both day1 and initial/rescreen structures
    // Get the actual data object, checking explicitly for null (frontend sends null, not undefined)
    let hearingDataObj = null;
    if (hearing?.day1 && hearing.day1 !== null) {
      hearingDataObj = hearing.day1;
    } else if (hearing?.initial && hearing.initial !== null) {
      hearingDataObj = hearing.initial;
    } else if (hearing?.rescreen && hearing.rescreen !== null) {
      hearingDataObj = hearing.rescreen;
    }
    
    if (hearingDataObj) {
      if (hearingDataObj.type) updateData.hearing_day1_type = hearingDataObj.type;
      if (hearingDataObj.screener) updateData.hearing_day1_screener = hearingDataObj.screener;
      if (hearingDataObj.date) updateData.hearing_day1_date = hearingDataObj.date;
      if (hearingDataObj.result) updateData.hearing_day1_result = hearingDataObj.result;
      
      // Capture hearing_overall (screener's explicit pass/fail determination)
      // Convert 'pass' to 'PASS', 'fail' to 'FAIL' (all caps)
      if (hearingDataObj.result) {
        const result = String(hearingDataObj.result).toLowerCase().trim();
        console.log('Hearing result received:', result, 'from hearingDataObj:', hearingDataObj);
        if (result === 'pass') {
          updateData.hearing_overall = 'PASS';
        } else if (result === 'fail') {
          updateData.hearing_overall = 'FAIL';
        } else {
          updateData.hearing_overall = null;
          console.warn('Unexpected hearing result value:', hearingDataObj.result);
        }
      } else {
        console.log('No hearing result found in hearingDataObj:', hearingDataObj);
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
    console.log('=== FINAL UPDATE DATA ===');
    console.log('vision_overall:', updateData.vision_overall);
    console.log('hearing_overall:', updateData.hearing_overall);
    console.log('Full updateData keys:', Object.keys(updateData));
    console.log('Full updateData:', JSON.stringify(updateData, null, 2));
    
    // Ensure vision_overall and hearing_overall are explicitly set (even if null)
    // This ensures they're included in the database update
    if (!('vision_overall' in updateData)) {
      updateData.vision_overall = null;
      console.log('WARNING: vision_overall not set, defaulting to null');
    }
    if (!('hearing_overall' in updateData)) {
      updateData.hearing_overall = null;
      console.log('WARNING: hearing_overall not set, defaulting to null');
    }
    
    let result;
    if (existingScreening) {
      // Update existing
      console.log('Updating existing screening with updateData:', JSON.stringify(updateData, null, 2));
      const { data: updateResult, error: updateError } = await supabase
        .from('screening_results')
        .update(updateData)
        .eq('student_id', student.id)
        .select();
      
      if (updateError) {
        console.error('Supabase update error:', updateError);
        throw updateError;
      }
      console.log('Update successful, returned data:', JSON.stringify(updateResult, null, 2));
      result = { success: true, message: 'Screening results updated' };
    } else {
      // Create new
      console.log('Inserting new screening with updateData:', JSON.stringify(updateData, null, 2));
      const { data: insertResult, error: insertError } = await supabase
        .from('screening_results')
        .insert({
          ...updateData,
          created_at: new Date().toISOString()
        })
        .select();
      
      if (insertError) {
        console.error('Supabase insert error:', insertError);
        throw insertError;
      }
      console.log('Insert successful, returned data:', JSON.stringify(insertResult, null, 2));
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
