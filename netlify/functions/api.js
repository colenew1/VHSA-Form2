const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

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
    
    if (!lastName || !school) {
      return res.status(400).json({ error: 'lastName and school are required' });
    }
    
    const { data: students, error } = await supabase
      .from('students')
      .select('*')
      .ilike('last_name', `%${lastName}%`)
      .eq('school', school)
      .order('last_name', { ascending: true });
    
    if (error) throw error;
    
    if (students.length === 0) {
      return res.json({ found: false });
    }
    
    if (students.length === 1) {
      const requiredScreenings = { vision: true, hearing: true, acanthosis: false, scoliosis: false };
      return res.json({
        found: true,
        student: students[0],
        requiredScreenings: requiredScreenings
      });
    }
    
    res.json({
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
    
    const { firstName, lastName, grade, gender, school, teacher, dob, status } = req.body;
    
    if (!firstName || !lastName || !grade || !gender || !school || !dob || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Generate unique_id (simplified - you'll need proper logic)
    const schoolCode = school.substring(0, 2).toLowerCase();
    const uniqueId = `${schoolCode}${Date.now().toString().slice(-4)}`;
    
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
    
    const requiredScreenings = { vision: true, hearing: true, acanthosis: false, scoliosis: false };
    
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
