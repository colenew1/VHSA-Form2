/**
 * Shared screening logic used by both:
 * - netlify/functions/api.js (production)
 * - backend/routes/screenings.js (local development)
 * 
 * IMPORTANT: Any changes here affect BOTH backends.
 * Test thoroughly before deploying.
 */

/**
 * Convert string to Title Case
 * @param {string} str - Input string
 * @returns {string} Title cased string
 */
function toTitleCase(str) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (word.length === 0) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Calculate which screening tests are required based on student demographics
 * @param {Object|string} gradeOrStudent - Either a student object or grade string
 * @param {string} [gender] - Gender if passing separate args
 * @param {string} [status] - Status if passing separate args
 * @param {string} [dob] - DOB if passing separate args
 * @returns {Object} Object with vision, hearing, acanthosis, scoliosis boolean flags
 */
function calculateRequirements(gradeOrStudent, gender, status, dob) {
  // Support both calling signatures: calculateRequirements(student) or calculateRequirements(grade, gender, status, dob)
  let grade, genderValue, statusValue, dobValue;
  
  if (arguments.length === 1 && typeof gradeOrStudent === 'object') {
    // Called with student object: calculateRequirements(student)
    const student = gradeOrStudent;
    grade = student.grade;
    genderValue = student.gender;
    statusValue = student.status;
    dobValue = student.dob;
  } else {
    // Called with separate arguments: calculateRequirements(grade, gender, status, dob)
    grade = gradeOrStudent;
    genderValue = gender;
    statusValue = status;
    dobValue = dob;
  }
  
  const requirements = {
    vision: false,
    hearing: false,
    acanthosis: false,
    scoliosis: false
  };
  
  // Parse grade
  const gradeStr = (grade || '').toLowerCase();
  const isNewStudent = statusValue?.toLowerCase() === 'new';
  
  // Pre-K 3: NO requirements
  if (gradeStr.includes('pre-k (3)') || gradeStr === 'pk3') {
    return requirements; // All false
  }
  
  // Pre-K 4: Vision & Hearing ONLY if DOB on/before Sept 1
  if (gradeStr.includes('pre-k (4)') || gradeStr === 'pk4') {
    if (dobValue) {
      const birthDate = new Date(dobValue);
      const birthYear = birthDate.getFullYear();
      const septFirst = new Date(birthYear, 8, 1); // Sept 1 of birth year
      
      // If born on or before Sept 1, they're "old" 4s - screening required
      if (birthDate <= septFirst) {
        requirements.vision = true;
        requirements.hearing = true;
      }
    }
    return requirements;
  }
  
  // Kindergarten through 12th: Vision & Hearing always required
  if (gradeStr.includes('kindergarten') || gradeStr === 'k' || 
      ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'].includes(gradeStr)) {
    requirements.vision = true;
    requirements.hearing = true;
  }
  
  // Acanthosis requirements
  // Always required: 1st, 3rd, 5th, 7th
  if (['1st', '3rd', '5th', '7th'].includes(gradeStr)) {
    requirements.acanthosis = true;
  }
  
  // NEW students only: 2nd, 4th, 6th, 8th, 9th-12th
  if (isNewStudent && ['2nd', '4th', '6th', '8th', '9th', '10th', '11th', '12th'].includes(gradeStr)) {
    requirements.acanthosis = true;
  }
  
  // Scoliosis requirements
  const isFemale = genderValue?.toLowerCase() === 'female';
  const isMale = genderValue?.toLowerCase() === 'male';
  
  // 5th grade females
  if (gradeStr === '5th' && isFemale) {
    requirements.scoliosis = true;
  }
  
  // 7th grade females
  if (gradeStr === '7th' && isFemale) {
    requirements.scoliosis = true;
  }
  
  // 8th grade males (RETURNING only based on image)
  if (gradeStr === '8th' && isMale && !isNewStudent) {
    requirements.scoliosis = true;
  }
  
  // 8th grade NEW students (both genders)
  if (gradeStr === '8th' && isNewStudent) {
    requirements.scoliosis = true;
  }
  
  return requirements;
}

/**
 * Calculate which screenings are already complete based on existing results
 * Complete means: initial passed OR rescreen has any result
 * @param {Object|null} screeningRecord - Existing screening_results record from database
 * @returns {Object} Object with vision, hearing, acanthosis, scoliosis boolean flags
 */
function calculateCompletionStatus(screeningRecord) {
  const completion = {
    vision: false,
    hearing: false,
    acanthosis: false,
    scoliosis: false
  };
  
  if (!screeningRecord) {
    return completion;
  }
  
  // Vision: complete if initial passed OR rescreen has result
  const visionInitialResult = screeningRecord.vision_initial_result?.toLowerCase();
  const visionRescreenResult = screeningRecord.vision_rescreen_result;
  if (visionInitialResult === 'pass' || visionRescreenResult) {
    completion.vision = true;
  }
  
  // Hearing: complete if initial passed OR rescreen has result
  const hearingInitialResult = screeningRecord.hearing_initial_result?.toLowerCase();
  const hearingRescreenResult = screeningRecord.hearing_rescreen_result;
  if (hearingInitialResult === 'pass' || hearingRescreenResult) {
    completion.hearing = true;
  }
  
  // Acanthosis: complete if initial passed OR rescreen has result
  const acanthosisInitialResult = screeningRecord.acanthosis_initial_result?.toLowerCase();
  const acanthosisRescreenResult = screeningRecord.acanthosis_rescreen_result;
  if (acanthosisInitialResult === 'pass' || acanthosisRescreenResult) {
    completion.acanthosis = true;
  }
  
  // Scoliosis: complete if initial passed OR rescreen has result
  const scoliosisInitialResult = screeningRecord.scoliosis_initial_result?.toLowerCase();
  const scoliosisRescreenResult = screeningRecord.scoliosis_rescreen_result;
  if (scoliosisInitialResult === 'pass' || scoliosisRescreenResult) {
    completion.scoliosis = true;
  }
  
  return completion;
}

/**
 * Extract overall pass/fail results from payload
 * Converts lowercase 'pass'/'fail' to uppercase 'PASS'/'FAIL'
 * @param {Object} payload - The screening payload
 * @returns {Object} Object with vision_overall and hearing_overall values
 */
function extractOverallResults(payload) {
  const results = {
    vision_overall: null,
    hearing_overall: null
  };
  
  // Vision overall - check initial first, then rescreen
  if (payload.vision) {
    const visionResult = payload.vision.initial?.result || payload.vision.rescreen?.result;
    if (visionResult) {
      const result = String(visionResult).toLowerCase().trim();
      if (result === 'pass') {
        results.vision_overall = 'PASS';
      } else if (result === 'fail') {
        results.vision_overall = 'FAIL';
      }
    }
  }
  
  // Hearing overall - check initial first, then rescreen
  if (payload.hearing) {
    const hearingResult = payload.hearing.initial?.result || payload.hearing.rescreen?.result;
    if (hearingResult) {
      const result = String(hearingResult).toLowerCase().trim();
      if (result === 'pass') {
        results.hearing_overall = 'PASS';
      } else if (result === 'fail') {
        results.hearing_overall = 'FAIL';
      }
    }
  }
  
  return results;
}

/**
 * Build screening data object from payload for database storage
 * @param {Object} payload - The screening submission payload
 * @param {Object|null} existingRecord - Existing screening record if updating
 * @param {Object} student - Student record with id and school
 * @returns {Object} Screening data ready for database insert/update
 */
function buildScreeningData(payload, existingRecord, student) {
  const screeningData = {
    student_id: student.id,
    unique_id: payload.uniqueId,
    
    // Student demographic fields (from payload)
    student_first_name: payload.student_first_name || null,
    student_last_name: payload.student_last_name || null,
    student_grade: payload.student_grade || null,
    student_gender: payload.student_gender || null,
    student_school: payload.student_school || student.school,
    student_teacher: payload.student_teacher || null,
    student_dob: payload.student_dob || null,
    student_status: payload.student_status || null,
    
    screening_year: new Date().getFullYear(),
    initial_screening_date: payload.screeningDate || new Date().toISOString().split('T')[0],
    was_absent: payload.was_absent || false
  };
  
  // Route notes to correct column based on screening type
  if (payload.notes) {
    if (payload.screeningType === 'initial') {
      screeningData.initial_notes = payload.notes;
    } else if (payload.screeningType === 'rescreen') {
      screeningData.rescreen_notes = payload.notes;
    }
  }
  
  // Only set required flags when creating NEW records (not on updates)
  if (!existingRecord || !existingRecord.id) {
    const studentForCalc = {
      grade: payload.student_grade || 'Unknown',
      gender: payload.student_gender || 'Unknown',
      status: payload.student_status || 'New',
      dob: payload.student_dob || null
    };
    
    const requiredScreenings = calculateRequirements(studentForCalc);
    
    screeningData.vision_required = requiredScreenings.vision;
    screeningData.hearing_required = requiredScreenings.hearing;
    screeningData.acanthosis_required = requiredScreenings.acanthosis;
    screeningData.scoliosis_required = requiredScreenings.scoliosis;
  }
  
  // Add vision data if provided
  if (payload.vision) {
    if (payload.vision.initial) {
      screeningData.vision_initial_screener = payload.vision.initial.screener || null;
      screeningData.vision_initial_date = payload.vision.initial.date || null;
      screeningData.vision_initial_glasses = payload.vision.initial.glasses || null;
      screeningData.vision_initial_right_eye = payload.vision.initial.rightEye || null;
      screeningData.vision_initial_left_eye = payload.vision.initial.leftEye || null;
      screeningData.vision_initial_result = payload.vision.initial.result || null;
    }
    if (payload.vision.rescreen) {
      screeningData.vision_rescreen_screener = payload.vision.rescreen.screener || null;
      screeningData.vision_rescreen_date = payload.vision.rescreen.date || null;
      screeningData.vision_rescreen_glasses = payload.vision.rescreen.glasses || null;
      screeningData.vision_rescreen_right_eye = payload.vision.rescreen.rightEye || null;
      screeningData.vision_rescreen_left_eye = payload.vision.rescreen.leftEye || null;
      screeningData.vision_rescreen_result = payload.vision.rescreen.result || null;
    }
  }
  
  // Add hearing data if provided
  if (payload.hearing) {
    if (payload.hearing.initial) {
      screeningData.hearing_initial_screener = payload.hearing.initial.screener || null;
      screeningData.hearing_initial_date = payload.hearing.initial.date || null;
      screeningData.hearing_initial_result = payload.hearing.initial.result || null;
      screeningData.hearing_initial_right_1000 = payload.hearing.initial.right1000 || null;
      screeningData.hearing_initial_right_2000 = payload.hearing.initial.right2000 || null;
      screeningData.hearing_initial_right_4000 = payload.hearing.initial.right4000 || null;
      screeningData.hearing_initial_left_1000 = payload.hearing.initial.left1000 || null;
      screeningData.hearing_initial_left_2000 = payload.hearing.initial.left2000 || null;
      screeningData.hearing_initial_left_4000 = payload.hearing.initial.left4000 || null;
    }
    if (payload.hearing.rescreen) {
      screeningData.hearing_rescreen_screener = payload.hearing.rescreen.screener || null;
      screeningData.hearing_rescreen_date = payload.hearing.rescreen.date || null;
      screeningData.hearing_rescreen_result = payload.hearing.rescreen.result || null;
      screeningData.hearing_rescreen_right_1000 = payload.hearing.rescreen.right1000 || null;
      screeningData.hearing_rescreen_right_2000 = payload.hearing.rescreen.right2000 || null;
      screeningData.hearing_rescreen_right_4000 = payload.hearing.rescreen.right4000 || null;
      screeningData.hearing_rescreen_left_1000 = payload.hearing.rescreen.left1000 || null;
      screeningData.hearing_rescreen_left_2000 = payload.hearing.rescreen.left2000 || null;
      screeningData.hearing_rescreen_left_4000 = payload.hearing.rescreen.left4000 || null;
    }
  }
  
  // Add overall results (screener's explicit pass/fail determination)
  const overallResults = extractOverallResults(payload);
  screeningData.vision_overall = overallResults.vision_overall;
  screeningData.hearing_overall = overallResults.hearing_overall;
  
  // Add acanthosis data if provided
  if (payload.acanthosis) {
    if (payload.acanthosis.initial) {
      screeningData.acanthosis_initial_screener = payload.acanthosis.initial.screener || null;
      screeningData.acanthosis_initial_date = payload.acanthosis.initial.date || null;
      screeningData.acanthosis_initial_result = payload.acanthosis.initial.result || null;
    }
    if (payload.acanthosis.rescreen) {
      screeningData.acanthosis_rescreen_screener = payload.acanthosis.rescreen.screener || null;
      screeningData.acanthosis_rescreen_date = payload.acanthosis.rescreen.date || null;
      screeningData.acanthosis_rescreen_result = payload.acanthosis.rescreen.result || null;
    }
  }
  
  // Add scoliosis data if provided
  if (payload.scoliosis) {
    if (payload.scoliosis.initial) {
      screeningData.scoliosis_initial_screener = payload.scoliosis.initial.screener || null;
      screeningData.scoliosis_initial_date = payload.scoliosis.initial.date || null;
      screeningData.scoliosis_initial_observations = payload.scoliosis.initial.observations || null;
      screeningData.scoliosis_initial_result = payload.scoliosis.initial.result || null;
    }
    if (payload.scoliosis.rescreen) {
      screeningData.scoliosis_rescreen_screener = payload.scoliosis.rescreen.screener || null;
      screeningData.scoliosis_rescreen_date = payload.scoliosis.rescreen.date || null;
      screeningData.scoliosis_rescreen_observations = payload.scoliosis.rescreen.observations || null;
      screeningData.scoliosis_rescreen_result = payload.scoliosis.rescreen.result || null;
    }
  }
  
  return screeningData;
}

/**
 * Merge new screening data with existing record, only updating non-null values
 * @param {Object} existingRecord - Existing database record
 * @param {Object} screeningData - New screening data
 * @returns {Object} Merged data ready for database update
 */
function mergeScreeningData(existingRecord, screeningData) {
  // Exclude generated columns that shouldn't be updated
  const { 
    vision_complete, 
    hearing_complete, 
    acanthosis_complete, 
    scoliosis_complete, 
    ...existingDataWithoutGenerated 
  } = existingRecord;
  
  return {
    ...existingDataWithoutGenerated,
    ...Object.fromEntries(
      Object.entries(screeningData).filter(([key, value]) => value !== null && value !== undefined)
    )
  };
}

// Export for CommonJS (Netlify functions)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toTitleCase,
    calculateRequirements,
    calculateCompletionStatus,
    extractOverallResults,
    buildScreeningData,
    mergeScreeningData
  };
}

// Export for ES modules (backend routes)
export {
  toTitleCase,
  calculateRequirements,
  calculateCompletionStatus,
  extractOverallResults,
  buildScreeningData,
  mergeScreeningData
};

