import express from 'express';
import { supabase } from '../utils/supabase.js';
import { calculateRequirements } from '../utils/screening-rules.js';
import { validateRequired, validateGrade, validateGender, validateStatus } from '../utils/validators.js';

const router = express.Router();

// Get all students
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('*, school:schools(name)')
      .order('last_name');
    
    if (error) throw error;
    
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
});

// Search by last name and school
router.post('/search', async (req, res) => {
  try {
    const { lastName, school } = req.body;
    
    if (!lastName || !school) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: lastName and school' 
      });
    }
    
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .ilike('last_name', `%${lastName}%`)
      .eq('school', school);
    
    if (error) throw error;
    
    res.json(data || []);
  } catch (error) {
    console.error('Error searching students:', error);
    res.status(500).json({ success: false, error: 'Failed to search students' });
  }
});

// Get student by unique ID
router.get('/:uniqueId', async (req, res) => {
  try {
    const { uniqueId } = req.params;
    
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('*')
      .ilike('unique_id', uniqueId)
      .single();
    
    if (studentError || !student) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      });
    }
    
    const requirements = calculateRequirements(student);
    res.json({ student, requiredScreenings: requirements });
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch student',
      message: error.message 
    });
  }
});

// Quick add new student
router.post('/quick-add', async (req, res) => {
  try {
    const { firstName, lastName, grade, gender, school, teacher, dob, status } = req.body;
    
    const validationError = validateRequired({
      firstName, lastName, grade, gender, school, dob, status
    });
    
    if (validationError) {
      return res.status(400).json({ 
        success: false, 
        error: validationError 
      });
    }
    
    if (!validateGrade(grade)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid grade' 
      });
    }
    
    if (!validateGender(gender)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid gender' 
      });
    }
    
    if (!validateStatus(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid status' 
      });
    }
    
    // Generate unique ID
    const { data: lastStudent } = await supabase
      .from('students')
      .select('unique_id')
      .order('unique_id', { ascending: false })
      .limit(1);
    
    let newId = 'st0001';
    if (lastStudent && lastStudent.length > 0) {
      const lastNum = parseInt(lastStudent[0].unique_id.replace('st', ''));
      newId = `st${String(lastNum + 1).padStart(4, '0')}`;
    }
    
    const { data, error } = await supabase
      .from('students')
      .insert({
        unique_id: newId,
        first_name: firstName,
        last_name: lastName,
        grade,
        gender,
        school,
        teacher,
        dob,
        status,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    const requirements = calculateRequirements(data);
    res.json({ 
      success: true, 
      student: data, 
      requiredScreenings: requirements 
    });
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create student',
      message: error.message 
    });
  }
});

export default router;
