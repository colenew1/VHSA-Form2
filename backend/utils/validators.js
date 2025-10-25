export function validateDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

export function validateRequired(fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (!value || (typeof value === 'string' && !value.trim())) {
      return `Missing required field: ${key}`;
    }
  }
  return null;
}

export function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
}

export function validateGrade(grade) {
  const validGrades = ['PK', 'K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
  return validGrades.includes(grade);
}

export function validateGender(gender) {
  const validGenders = ['Male', 'Female', 'Other'];
  return validGenders.includes(gender);
}

export function validateStatus(status) {
  const validStatuses = ['New', 'Returning'];
  return validStatuses.includes(status);
}
