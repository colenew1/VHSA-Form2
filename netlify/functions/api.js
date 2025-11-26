const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Import shared logic - single source of truth for screening logic
const {
  toTitleCase,
  calculateRequirements,
  calculateCompletionStatus,
  buildScreeningData,
  mergeScreeningData
} = require('../../shared/screening-logic.js');

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
