<!-- cb056966-388e-417c-bde2-9693f0e3d08f 007a06cb-1721-4423-b32b-3c156f9036ec -->
# Fix Dynamic Requirements UI

## Problem Summary

**Issue 1:** When clicking "New Student" tab, the previous student's information window remains visible, causing confusion.

**Issue 2:** Backend is returning hardcoded requirements instead of using the `calculateRequirements()` function. This causes incorrect "Required" badges and accordion behavior.

## Changes Required

### 1. Hide Student Info When Switching to "New Student" Tab

**File:** `frontend/screening-form.html`

**Location:** `switchTab()` function (line ~900)

**Current code:**
```javascript
function switchTab(tabName) {
  // Update tab buttons
  document.getElementById('searchTabBtn').classList.remove('active');
  document.getElementById('newTabBtn').classList.remove('active');
  
  if (tabName === 'search') {
    document.getElementById('searchTabBtn').classList.add('active');
    document.getElementById('searchTab').classList.remove('hidden');
    document.getElementById('newTab').classList.add('hidden');
  } else {
    document.getElementById('newTabBtn').classList.add('active');
    document.getElementById('searchTab').classList.add('hidden');
    document.getElementById('newTab').classList.remove('hidden');
  }
  
  // Clear search results
  document.getElementById('searchResults').classList.add('hidden');
  document.getElementById('multipleResults').classList.add('hidden');
}
```

**Add after line 917 (before closing brace):**
```javascript
  // Hide student info and screening sections when switching to new student tab
  if (tabName === 'new') {
    document.getElementById('studentInfo').classList.add('hidden');
    document.getElementById('absentSection').classList.add('hidden');
    document.getElementById('screeningTests').classList.add('hidden');
    document.getElementById('notesSection').classList.add('hidden');
    document.getElementById('submitSection').classList.add('hidden');
  }
```

### 2. Fix Backend to Use calculateRequirements()

**File:** `netlify/functions/api.js`

**Problem:** Two endpoints are returning hardcoded requirements instead of calling `calculateRequirements()`.

#### A. Fix GET /api/students/:uniqueId (line ~298)

**Current code (lines 316-322):**
```javascript
// Calculate required screenings (simplified logic)
const requiredScreenings = {
  vision: true,
  hearing: true,
  acanthosis: false,
  scoliosis: false
};
```

**Replace with:**
```javascript
// Calculate required screenings based on student data
const requiredScreenings = calculateRequirements(
  student.grade,
  student.gender,
  student.status,
  student.dob
);
```

#### B. Fix GET /api/students/search (line ~273)

**Current code (lines 278-282):**
```javascript
if (data.length === 1) {
  return res.json({
    found: true,
    student: data[0],
    requiredScreenings: { vision: true, hearing: true, acanthosis: false, scoliosis: false }
  });
}
```

**Replace with:**
```javascript
if (data.length === 1) {
  const requiredScreenings = calculateRequirements(
    data[0].grade,
    data[0].gender,
    data[0].status,
    data[0].dob
  );
  
  return res.json({
    found: true,
    student: data[0],
    requiredScreenings: requiredScreenings
  });
}
```

## Verification

After these changes:

1. **Tab switching:** Clicking "New Student" should hide all student info and screening sections
2. **Pre-K 3:** No required badges should show, no accordions should auto-open
3. **Pre-K 4 (born before Sept 1):** Vision & Hearing badges show, those accordions auto-open
4. **Pre-K 4 (born after Sept 1):** No required badges, no auto-open
5. **5th grade female:** Vision, Hearing, Acanthosis, Scoliosis badges show and auto-open
6. **8th grade male NEW:** All four badges show and auto-open
7. **8th grade male RETURNING:** Vision, Hearing, Acanthosis badges show (not Scoliosis)

## Files to Modify

- `frontend/screening-form.html` (1 change in switchTab function)
- `netlify/functions/api.js` (2 changes in GET endpoints)
