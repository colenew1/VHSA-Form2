const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Helper function for title case formatting
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
    console.error('SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING');
    console.error('SUPABASE_ANON_KEY:', supabaseAnonKey ? 'SET' : 'MISSING');
    throw new Error('Missing Supabase credentials');
  }
  
  supabase = createClient(supabaseUrl, supabaseAnonKey);
  console.log('Supabase client initialized successfully');
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
    console.error('Debug schools error:', error);
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
    console.error('Error fetching schools:', error);
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
    console.error('Error fetching screeners:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search students by name - MUST come BEFORE /:uniqueId route
app.get('/api/students/search', async (req, res) => {
  const { lastName, school } = req.query;
  
  console.log('Search params:', { lastName, school });
  
  if (!supabase) {
    console.log('ERROR: Supabase client not available');
    return res.json({ found: false, error: 'Database not available' });
  }
  
  if (!lastName || !school) {
    return res.json({ found: false, error: 'Missing params' });
  }
  
  try {
    // Simple query - just find students
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .ilike('last_name', `%${lastName}%`)
      .ilike('school', `%${school}%`);
    
    console.log('Results:', data?.length || 0);
    
    if (error || !data || data.length === 0) {
      return res.json({ found: false });
    }
    
    if (data.length === 1) {
      return res.json({
        found: true,
        student: data[0],
        requiredScreenings: { vision: true, hearing: true, acanthosis: false, scoliosis: false }
      });
    }
    
    return res.json({
      found: true,
      multiple: true,
      students: data
    });
    
  } catch (err) {
    console.error(err);
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
    
    // Calculate required screenings (simplified logic)
    const requiredScreenings = {
      vision: true,
      hearing: true,
      acanthosis: false,
      scoliosis: false
    };
    
    res.json({
      found: true,
      student: student,
      requiredScreenings: requiredScreenings
    });
  } catch (error) {
    console.error('Error fetching student:', error);
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
    
    // Only update provided fields with title case for names
    if (req.body.firstName) updates.first_name = toTitleCase(req.body.firstName);
    if (req.body.lastName) updates.last_name = toTitleCase(req.body.lastName);
    if (req.body.grade) updates.grade = req.body.grade;
    if (req.body.gender) updates.gender = req.body.gender;
    if (req.body.school) updates.school = req.body.school;
    if (req.body.teacher !== undefined) updates.teacher = toTitleCase(req.body.teacher);
    if (req.body.dob) updates.dob = req.body.dob;
    if (req.body.status) updates.status = req.body.status;
    
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
    console.error('Error updating student:', error);
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
    
    // Generate unique_id with better logic
    const schoolCode = school.replace(/[^\w\s]/g, '').trim().split(/\s+/)[0].substring(0, 2).toLowerCase();
    
    // Get max ID for this school
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
    
    const newNumber = maxNumber + 1;
    const uniqueId = `${schoolCode}${String(newNumber).padStart(4, '0')}`;
    
    // Insert with formatted names
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
    
    // Calculate required screenings
    const requiredScreenings = {
      vision: true,
      hearing: true,
      acanthosis: false,
      scoliosis: false
    };
    
    res.status(201).json({
      success: true,
      student: data,
      requiredScreenings: requiredScreenings
    });
  } catch (error) {
    console.error('Error creating student:', error);
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
    console.log('Screening payload received:', JSON.stringify(payload, null, 2));
    
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
    const { data: existingRecord, error: fetchError } = await supabase
      .from('screening_results')
      .select('*')
      .eq('student_id', student.id)
      .single();
    
    // Build screening data, merging with existing data for selective updates
    const screeningData = {
      student_id: student.id,
      unique_id: payload.uniqueId,
      school: student.school,
      screening_year: new Date().getFullYear(),
      initial_screening_date: payload.screeningDate || new Date().toISOString().split('T')[0],
      was_absent: payload.was_absent || false,
      notes: payload.notes || null
    };
    
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
    
    // SELECTIVE UPDATE: Merge with existing record, only updating non-null values
    let finalData;
    if (existingRecord && existingRecord.id) {
      // Merge existing data with new data, only updating non-null fields
      finalData = {
        ...existingRecord,
        ...Object.fromEntries(
          Object.entries(screeningData).filter(([key, value]) => value !== null && value !== undefined)
        )
      };
      
      // Update the record
      const { data, error } = await supabase
        .from('screening_results')
        .update(finalData)
        .eq('id', existingRecord.id)
        .select()
        .single();
      
      if (error) throw error;
      
      console.log('Updated existing screening record');
      res.json({ success: true, message: 'Screening results updated', data });
    } else {
      // Create new record
      const { data, error } = await supabase
        .from('screening_results')
        .insert(screeningData)
        .select()
        .single();
      
      if (error) throw error;
      
      console.log('Created new screening record');
      res.json({ success: true, message: 'Screening results saved', data });
    }
  } catch (error) {
    console.error('Error saving screening:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export handler
exports.handler = serverless(app);
