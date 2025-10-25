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

// Search students by name
app.get('/api/students/search', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    const { lastName, school } = req.query;
    
    console.log('Search params:', { lastName, school }); // DEBUG
    
    if (!lastName || !school) {
      return res.status(400).json({ error: 'lastName and school are required' });
    }
    
    // Debug: Log the exact query being built
    console.log('Building query with:', {
      lastName: `%${lastName}%`,
      school: `%${school}%`
    });
    
    // Use ilike for case-insensitive search with partial matching
    const { data: students, error } = await supabase
      .from('students')
      .select('*')
      .ilike('last_name', `%${lastName}%`)  // Case-insensitive, partial match
      .ilike('school', `%${school}%`)       // Case-insensitive, partial match for school too
      .order('last_name', { ascending: true });
    
    console.log('Query results:', students?.length || 0, 'students found'); // DEBUG
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    if (students.length === 0) {
      return res.json({ found: false, message: 'No students found' });
    }
    
    if (students.length === 1) {
      // Calculate required screenings based on grade/gender/status
      const requiredScreenings = {
        vision: true,
        hearing: true,
        acanthosis: false,
        scoliosis: false
      };
      
      return res.json({
        found: true,
        student: students[0],
        requiredScreenings: requiredScreenings
      });
    }
    
    return res.json({
      found: true,
      multiple: true,
      students: students
    });
    
  } catch (error) {
    console.error('Search error:', error);
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

// Submit screening results
app.post('/api/screenings', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    const payload = req.body;
    
    // Get student UUID
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('unique_id', payload.uniqueId)
      .single();
    
    if (studentError || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Build screening data (simplified - you'll need full logic)
    const screeningData = {
      student_id: student.id,
      school: payload.uniqueId,
      screening_year: new Date().getFullYear(),
      screening_event_date: payload.screeningDate,
      absent: payload.absent || false,
      notes: payload.notes
    };
    
    // Upsert screening results
    const { data, error } = await supabase
      .from('screening_results')
      .upsert(screeningData, { onConflict: 'student_id' })
      .select();
    
    if (error) throw error;
    
    res.json({ success: true, message: 'Screening results saved' });
  } catch (error) {
    console.error('Error saving screening:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export handler
exports.handler = serverless(app);
