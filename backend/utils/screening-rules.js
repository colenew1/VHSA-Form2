export function calculateRequirements(student) {
  const { grade, gender, dob, status } = student;
  
  const requirements = {
    vision: false,
    hearing: false,
    acanthosis: false,
    scoliosis: false
  };
  
  // Parse grade
  const gradeStr = (grade || '').toLowerCase();
  const isNewStudent = status?.toLowerCase() === 'new';
  
  // Pre-K 3: NO requirements
  if (gradeStr.includes('pre-k (3)') || gradeStr === 'pk3') {
    return requirements; // All false
  }
  
  // Pre-K 4: Vision & Hearing ONLY if DOB on/before Sept 1
  if (gradeStr.includes('pre-k (4)') || gradeStr === 'pk4') {
    if (dob) {
      const birthDate = new Date(dob);
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
  const isFemale = gender?.toLowerCase() === 'female';
  const isMale = gender?.toLowerCase() === 'male';
  
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
