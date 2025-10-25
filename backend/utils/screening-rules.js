export function calculateRequirements(student) {
  const { grade, gender, dob, status } = student;
  const gradeNum = parseInt(grade) || 0;
  
  const requirements = {
    vision: false,
    hearing: false,
    acanthosis: false,
    scoliosis: false
  };
  
  // Vision and Hearing: All grades (Pre-K through 12)
  if (gradeNum >= 0 && gradeNum <= 12) {
    requirements.vision = true;
    requirements.hearing = true;
  }
  
  // Acanthosis Nigricans: Grades 1, 3, 5, 7
  if ([1, 3, 5, 7].includes(gradeNum)) {
    requirements.acanthosis = true;
  }
  
  // Scoliosis: Grade 5, Female students only
  if (gradeNum === 5 && gender?.toLowerCase() === 'female') {
    requirements.scoliosis = true;
  }
  
  return requirements;
}
