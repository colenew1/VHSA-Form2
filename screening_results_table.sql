-- ============================================================
-- COMPLETE SQL TO RECREATE screening_results TABLE
-- Final schema with selective update support
-- ============================================================

-- STEP 1: Drop existing table and all dependent views
DROP TABLE IF EXISTS screening_results CASCADE;
DROP VIEW IF EXISTS daily_screening_summary CASCADE;
DROP VIEW IF EXISTS incomplete_screenings CASCADE;
DROP VIEW IF EXISTS failed_screenings CASCADE;
DROP VIEW IF EXISTS absent_students CASCADE;
DROP VIEW IF EXISTS completed_screenings CASCADE;
DROP VIEW IF EXISTS school_progress CASCADE;
DROP VIEW IF EXISTS state_report_export CASCADE;

-- STEP 2: Create new screening_results table
CREATE TABLE screening_results (
    -- Core fields
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    unique_id VARCHAR(50) NOT NULL,
    
    -- Student demographic fields (from students table)
    student_first_name TEXT,
    student_last_name TEXT,
    student_grade TEXT,
    student_gender TEXT,
    student_school TEXT NOT NULL,
    student_teacher TEXT,  -- Teacher last name
    student_dob DATE,
    student_status TEXT,
    
    screening_year INTEGER NOT NULL,
    initial_screening_date DATE NOT NULL,  -- Date of initial screening (used by all views)
    was_absent BOOLEAN DEFAULT FALSE,
    notes TEXT,  -- ONLY ONE NOTES FIELD AT THE END
    
    -- Vision: Initial Screen
    vision_initial_screener VARCHAR(100),
    vision_initial_date DATE,
    vision_initial_glasses VARCHAR(10),
    vision_initial_right_eye TEXT,
    vision_initial_left_eye TEXT,
    vision_initial_result TEXT,
    
    -- Vision: Rescreen
    vision_rescreen_screener VARCHAR(100),
    vision_rescreen_date DATE,
    vision_rescreen_glasses VARCHAR(10),
    vision_rescreen_right_eye TEXT,
    vision_rescreen_left_eye TEXT,
    vision_rescreen_result TEXT,
    
    -- Hearing: Initial Screen
    hearing_initial_screener VARCHAR(100),
    hearing_initial_date DATE,
    hearing_initial_result TEXT,
    hearing_initial_right_1000 TEXT,
    hearing_initial_right_2000 TEXT,
    hearing_initial_right_4000 TEXT,
    hearing_initial_left_1000 TEXT,
    hearing_initial_left_2000 TEXT,
    hearing_initial_left_4000 TEXT,
    
    -- Hearing: Rescreen
    hearing_rescreen_screener VARCHAR(100),
    hearing_rescreen_date DATE,
    hearing_rescreen_result TEXT,
    hearing_rescreen_right_1000 TEXT,
    hearing_rescreen_right_2000 TEXT,
    hearing_rescreen_right_4000 TEXT,
    hearing_rescreen_left_1000 TEXT,
    hearing_rescreen_left_2000 TEXT,
    hearing_rescreen_left_4000 TEXT,
    
    -- Acanthosis: Initial Screen
    acanthosis_initial_screener VARCHAR(100),
    acanthosis_initial_date DATE,
    acanthosis_initial_result TEXT,
    
    -- Acanthosis: Rescreen
    acanthosis_rescreen_screener VARCHAR(100),
    acanthosis_rescreen_date DATE,
    acanthosis_rescreen_result TEXT,
    
    -- Scoliosis: Initial Screen
    scoliosis_initial_screener VARCHAR(100),
    scoliosis_initial_date DATE,
    scoliosis_initial_observations TEXT,
    scoliosis_initial_result TEXT,
    
    -- Scoliosis: Rescreen
    scoliosis_rescreen_screener VARCHAR(100),
    scoliosis_rescreen_date DATE,
    scoliosis_rescreen_observations TEXT,
    scoliosis_rescreen_result TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STEP 3: Create indexes for performance
CREATE INDEX idx_screening_results_student_id ON screening_results(student_id);
CREATE INDEX idx_screening_results_unique_id ON screening_results(unique_id);
CREATE INDEX idx_screening_results_date ON screening_results(initial_screening_date);
CREATE INDEX idx_screening_results_year ON screening_results(screening_year);
CREATE INDEX idx_screening_results_school ON screening_results(student_school);
CREATE INDEX idx_screening_results_was_absent ON screening_results(was_absent);

-- STEP 4: Create function for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- STEP 5: Create trigger for automatic timestamp updates
CREATE TRIGGER update_screening_results_updated_at 
    BEFORE UPDATE ON screening_results 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- STEP 6: Verify the structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'screening_results'
ORDER BY ordinal_position;
