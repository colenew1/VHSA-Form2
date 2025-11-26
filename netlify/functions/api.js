const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// ============================================================================
// SHARED LOGIC (inlined because Netlify can't resolve paths outside functions)
// If you update this, also update shared/screening-logic.js
// ============================================================================

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

function calculateRequirements(gradeOrStudent, gender, status, dob) {
  let grade, genderValue, statusValue, dobValue;
  
  if (arguments.length === 1 && typeof gradeOrStudent === 'object') {
    const student = gradeOrStudent;
    grade = student.grade;
    genderValue = student.gender;
    statusValue = student.status;
    dobValue = student.dob;
  } else {
    grade = gradeOrStudent;
    genderValue = gender;
    statusValue = status;
    dobValue = dob;
  }
  
  const requirements = { vision: false, hearing: false, acanthosis: false, scoliosis: false };
  const gradeStr = (grade || '').toLowerCase();
  const isNewStudent = statusValue?.toLowerCase() === 'new';
  
  if (gradeStr.includes('pre-k (3)') || gradeStr === 'pk3') return requirements;
  
  if (gradeStr.includes('pre-k (4)') || gradeStr === 'pk4') {
    if (dobValue) {
      const birthDate = new Date(dobValue);
      const septFirst = new Date(birthDate.getFullYear(), 8, 1);
      if (birthDate <= septFirst) {
        requirements.vision = true;
        requirements.hearing = true;
      }
    }
    return requirements;
  }
  
  if (gradeStr.includes('kindergarten') || gradeStr === 'k' || 
      ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'].includes(gradeStr)) {
    requirements.vision = true;
    requirements.hearing = true;
  }
  
  if (['1st', '3rd', '5th', '7th'].includes(gradeStr)) requirements.acanthosis = true;
  if (isNewStudent && ['2nd', '4th', '6th', '8th', '9th', '10th', '11th', '12th'].includes(gradeStr)) requirements.acanthosis = true;
  
  const isFemale = genderValue?.toLowerCase() === 'female';
  const isMale = genderValue?.toLowerCase() === 'male';
  
  if (gradeStr === '5th' && isFemale) requirements.scoliosis = true;
  if (gradeStr === '7th' && isFemale) requirements.scoliosis = true;
  if (gradeStr === '8th' && isMale && !isNewStudent) requirements.scoliosis = true;
  if (gradeStr === '8th' && isNewStudent) requirements.scoliosis = true;
  
  return requirements;
}

function calculateCompletionStatus(screeningRecord) {
  const completion = { vision: false, hearing: false, acanthosis: false, scoliosis: false };
  if (!screeningRecord) return completion;
  
  const visionInitialResult = screeningRecord.vision_initial_result?.toLowerCase();
  if (visionInitialResult === 'pass' || screeningRecord.vision_rescreen_result) completion.vision = true;
  
  const hearingInitialResult = screeningRecord.hearing_initial_result?.toLowerCase();
  if (hearingInitialResult === 'pass' || screeningRecord.hearing_rescreen_result) completion.hearing = true;
  
  const acanthosisInitialResult = screeningRecord.acanthosis_initial_result?.toLowerCase();
  if (acanthosisInitialResult === 'pass' || screeningRecord.acanthosis_rescreen_result) completion.acanthosis = true;
  
  const scoliosisInitialResult = screeningRecord.scoliosis_initial_result?.toLowerCase();
  if (scoliosisInitialResult === 'pass' || screeningRecord.scoliosis_rescreen_result) completion.scoliosis = true;
  
  return completion;
}

function extractOverallResults(payload) {
  const results = { vision_overall: null, hearing_overall: null };
  
  if (payload.vision) {
    const visionResult = payload.vision.initial?.result || payload.vision.rescreen?.result;
    if (visionResult) {
      const result = String(visionResult).toLowerCase().trim();
      if (result === 'pass') results.vision_overall = 'PASS';
      else if (result === 'fail') results.vision_overall = 'FAIL';
    }
  }
  
  if (payload.hearing) {
    const hearingResult = payload.hearing.initial?.result || payload.hearing.rescreen?.result;
    if (hearingResult) {
      const result = String(hearingResult).toLowerCase().trim();
      if (result === 'pass') results.hearing_overall = 'PASS';
      else if (result === 'fail') results.hearing_overall = 'FAIL';
    }
  }
  
  return results;
}

function buildScreeningData(payload, existingRecord, student) {
  const screeningData = {
    student_id: student.id,
    unique_id: payload.uniqueId,
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
  
  if (payload.notes) {
    if (payload.screeningType === 'initial') screeningData.initial_notes = payload.notes;
    else if (payload.screeningType === 'rescreen') screeningData.rescreen_notes = payload.notes;
  }
  
  if (!existingRecord || !existingRecord.id) {
    const requiredScreenings = calculateRequirements({
      grade: payload.student_grade || 'Unknown',
      gender: payload.student_gender || 'Unknown',
      status: payload.student_status || 'New',
      dob: payload.student_dob || null
    });
    screeningData.vision_required = requiredScreenings.vision;
    screeningData.hearing_required = requiredScreenings.hearing;
    screeningData.acanthosis_required = requiredScreenings.acanthosis;
    screeningData.scoliosis_required = requiredScreenings.scoliosis;
  }
  
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
  
  const overallResults = extractOverallResults(payload);
  screeningData.vision_overall = overallResults.vision_overall;
  screeningData.hearing_overall = overallResults.hearing_overall;
  
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

function mergeScreeningData(existingRecord, screeningData) {
  const { vision_complete, hearing_complete, acanthosis_complete, scoliosis_complete, ...existingDataWithoutGenerated } = existingRecord;
  return {
    ...existingDataWithoutGenerated,
    ...Object.fromEntries(Object.entries(screeningData).filter(([key, value]) => value !== null && value !== undefined))
  };
}

// ============================================================================
// EXPRESS APP
// ============================================================================

const app = express();

// Middleware
app.use(cors({
  origin: ['https://vhsa-form.netlify.app', 'http://localhost:8888', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Supabase client - handle missing environment variables gracefully
let supabase;
try {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials in environment variables');
    throw new Error('Missing Supabase credentials');
  }
  
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} catch (error) {
  console.error('Failed to initialize Supabase client:', error.message);
  supabase = null;
}

// Handle CORS preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: supabase ? 'connected' : 'not connected'
  });
});

// Debug endpoint to see all schools in database
app.get('/api/debug/schools', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    const { data: schools, error } = await supabase
      .from('students')
      .select('school')
      .order('school');
    
    if (error) throw error;
    
    // Get unique schools
    const uniqueSchools = [...new Set(schools.map(s => s.school))];
    
    res.json({
      totalStudents: schools.length,
      uniqueSchools: uniqueSchools,
      allSchools: schools.map(s => s.school)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add diagnostic endpoint to list students
app.get('/api/debug/list-students', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    const { data: students, error } = await supabase
      .from('students')
      .select('unique_id, first_name, last_name, school')
      .limit(20);
    
    if (error) {
      return res.json({ error: error.message, details: error });
    }
    
    const distinctSchools = students ? [...new Set(students.map(s => s.school))] : [];
    
    return res.json({
      count: students ? students.length : 0,
      students: students || [],
      distinctSchools: distinctSchools
    });
  } catch (error) {
    return res.json({ error: error.message });
  }
});

// Get schools
app.get('/api/schools', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get screeners
app.get('/api/screeners', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    const { data, error } = await supabase
      .from('screeners')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search students by name - MUST come BEFORE /:uniqueId route
app.get('/api/students/search', async (req, res) => {
  const { lastName, school } = req.query;
  
  if (!supabase) {
    return res.json({ found: false, error: 'Database not available' });
  }
  
  if (!lastName || !school) {
    return res.json({ found: false, error: 'Missing params' });
  }
  
  try {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .ilike('last_name', `%${lastName}%`)
      .ilike('school', `%${school}%`);
    
    if (error || !data || data.length === 0) {
      return res.json({ found: false });
    }
    
    if (data.length === 1) {
      const student = data[0];
      const requiredScreenings = calculateRequirements(
        student.grade,
        student.gender,
        student.status,
        student.dob
      );
      
      // Fetch existing screening results to determine completion status
      const { data: screeningRecord } = await supabase
        .from('screening_results')
        .select('*')
        .eq('student_id', student.id)
        .single();
      
      // Calculate which screenings are already complete
      const completedScreenings = calculateCompletionStatus(screeningRecord);
      
      return res.json({
        found: true,
        student: student,
        requiredScreenings: requiredScreenings,
        completedScreenings: completedScreenings
      });
    }
    
    return res.json({
      found: true,
      multiple: true,
      students: data
    });
    
  } catch (err) {
    return res.json({ found: false, error: err.message });
  }
});

// Get student by ID
app.get('/api/students/:uniqueId', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    const { uniqueId } = req.params;
    
    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .eq('unique_id', uniqueId)
      .single();
    
    if (error || !student) {
      return res.json({ found: false });
    }
    
    // Calculate required screenings based on student data
    const requiredScreenings = calculateRequirements(
      student.grade,
      student.gender,
      student.status,
      student.dob
    );
    
    // Fetch existing screening results to determine completion status
    const { data: screeningRecord } = await supabase
      .from('screening_results')
      .select('*')
      .eq('student_id', student.id)
      .single();
    
    // Calculate which screenings are already complete
    const completedScreenings = calculateCompletionStatus(screeningRecord);
    
    res.json({
      found: true,
      student: student,
      requiredScreenings: requiredScreenings,
      completedScreenings: completedScreenings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update student information
app.put('/api/students/:uniqueId', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    const { uniqueId } = req.params;
    const updates = {};
    
    // Update fields if provided (including null values for clearing)
    if (req.body.firstName !== undefined) {
      updates.first_name = req.body.firstName ? toTitleCase(req.body.firstName) : null;
    }
    if (req.body.lastName !== undefined) {
      updates.last_name = req.body.lastName ? toTitleCase(req.body.lastName) : null;
    }
    if (req.body.grade !== undefined) updates.grade = req.body.grade || null;
    if (req.body.gender !== undefined) updates.gender = req.body.gender || null;
    if (req.body.school !== undefined) updates.school = req.body.school || null;
    if (req.body.teacher !== undefined) {
      updates.teacher = req.body.teacher ? toTitleCase(req.body.teacher) : null;
    }
    if (req.body.dob !== undefined) updates.dob = req.body.dob || null;
    if (req.body.status !== undefined) updates.status = req.body.status || null;
    
    const { data, error } = await supabase
      .from('students')
      .update(updates)
      .eq('unique_id', uniqueId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      student: data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new student
app.post('/api/students/quick-add', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    // Get and format input with title case
    const firstName = toTitleCase(req.body.firstName);
    const lastName = toTitleCase(req.body.lastName);
    const grade = req.body.grade;
    const gender = req.body.gender;
    const school = req.body.school;
    const teacher = toTitleCase(req.body.teacher || '');
    const dob = req.body.dob;
    const status = req.body.status;
    
    if (!firstName || !lastName || !grade || !gender || !school || !dob || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check for duplicate student (same first name + last name + school)
    const { data: existingStudent } = await supabase
      .from('students')
      .select('*')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .eq('school', school)
      .maybeSingle();
    
    if (existingStudent) {
      return res.status(409).json({
        duplicate: true,
        existingStudent: existingStudent,
        message: 'A student with this name already exists at this school'
      });
    }
    
    // Generate unique_id with collision checking
    const schoolCode = school.replace(/[^\w\s]/g, '').trim().split(/\s+/)[0].substring(0, 2).toLowerCase();
    
    let uniqueId;
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
      const { data: existingStudents } = await supabase
        .from('students')
        .select('unique_id')
        .ilike('unique_id', `${schoolCode}%`)
        .order('unique_id', { ascending: false })
        .limit(1);
      
      let maxNumber = 0;
      if (existingStudents && existingStudents.length > 0) {
        const lastId = existingStudents[0].unique_id;
        const numPart = lastId.substring(2);
        maxNumber = parseInt(numPart, 10) || 0;
      }
      
      const newNumber = maxNumber + 1 + attempts;
      const candidateId = `${schoolCode}${String(newNumber).padStart(4, '0')}`;
      
      const { data: collision } = await supabase
        .from('students')
        .select('unique_id')
        .eq('unique_id', candidateId)
        .maybeSingle();
      
      if (!collision) {
        uniqueId = candidateId;
        break;
      }
      
      attempts++;
    }
    
    if (!uniqueId) {
      return res.status(500).json({ 
        error: 'Unable to generate unique student ID after multiple attempts' 
      });
    }
    
    // Insert student with verified unique ID
    const { data, error } = await supabase
      .from('students')
      .insert({
        unique_id: uniqueId,
        first_name: firstName,
        last_name: lastName,
        grade,
        gender,
        school,
        teacher,
        dob,
        status
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Calculate required screenings based on student data
    const requiredScreenings = calculateRequirements(
      data.grade,
      data.gender,
      data.status,
      data.dob
    );
    
    res.status(201).json({
      success: true,
      student: data,
      requiredScreenings: requiredScreenings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit screening results with selective update support
app.post('/api/screenings', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    const payload = req.body;
    
    // Get student UUID
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, school')
      .eq('unique_id', payload.uniqueId)
      .single();
    
    if (studentError || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Get existing screening record if it exists
    const { data: existingRecord } = await supabase
      .from('screening_results')
      .select('*')
      .eq('student_id', student.id)
      .single();
    
    // Build screening data using shared logic
    const screeningData = buildScreeningData(payload, existingRecord, student);
    
    // SELECTIVE UPDATE: Merge with existing record, only updating non-null values
    if (existingRecord && existingRecord.id) {
      const finalData = mergeScreeningData(existingRecord, screeningData);
      
      const { data, error } = await supabase
        .from('screening_results')
        .update(finalData)
        .eq('id', existingRecord.id)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json({ success: true, message: 'Screening results updated', data });
    } else {
      // Create new record
      const { data, error } = await supabase
        .from('screening_results')
        .insert(screeningData)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json({ success: true, message: 'Screening results saved', data });
    }
  } catch (error) {
    console.error('Error saving screening:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export handler
exports.handler = serverless(app);
