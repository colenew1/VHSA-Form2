# Screening Results JSON Signature

## Frontend → Backend JSON Structure

The frontend sends screening results to `POST /api/screenings` with the following structure:

### Example JSON Payload:

```json
{
  "uniqueId": "st0001",
  "screeningDate": "2024-01-15",
  "absent": false,
  "notes": "Optional notes",
  "screenerName": "John Doe",
  "vision": {
    "initial": {  // or "rescreen" depending on screening type
      "screener": "John Doe",
      "date": "2024-01-15",
      "glasses": "yes",  // or "no"
      "rightEye": "20/20",
      "leftEye": "20/25",
      "result": "pass"  // or "fail" - lowercase
    }
  },
  "hearing": {
    "initial": {  // or "rescreen" depending on screening type
      "screener": "John Doe",
      "date": "2024-01-15",
      "result": "pass",  // or "fail" - lowercase
      "right1000": "pass",
      "right2000": "pass",
      "right4000": "pass",
      "left1000": "pass",
      "left2000": "pass",
      "left4000": "pass"
    }
  },
  "acanthosis": {
    "initial": {
      "screener": "John Doe",
      "date": "2024-01-15",
      "result": "pass"  // or "fail"
    }
  },
  "scoliosis": {
    "initial": {
      "screener": "John Doe",
      "date": "2024-01-15",
      "result": "pass",  // or "fail"
      "observations": "observation1, observation2"
    }
  }
}
```

## Backend Processing

The backend extracts the `result` field from `vision.initial.result` (or `vision.rescreen.result`) and `hearing.initial.result` (or `hearing.rescreen.result`).

### Conversion Logic:

- **Input**: `result: "pass"` or `result: "fail"` (lowercase from frontend)
- **Output**: 
  - `vision_overall`: `"PASS"` or `"FAIL"` (all caps, stored in database)
  - `hearing_overall`: `"PASS"` or `"FAIL"` (all caps, stored in database)

### Database Storage:

The backend stores the following in the `screening_results` table:

```javascript
{
  vision_overall: "PASS",  // or "FAIL" or null
  hearing_overall: "PASS", // or "FAIL" or null
  // ... other fields
}
```

## Key Points for Dashboard:

1. **Source of Truth**: The `vision_overall` and `hearing_overall` columns store the screener's explicit Pass/Fail determination
2. **Format**: Values are stored as `"PASS"` or `"FAIL"` (all caps, 4 characters)
3. **Location**: These values come from `vision.initial.result` (or `vision.rescreen.result`) and `hearing.initial.result` (or `hearing.rescreen.result`) in the JSON payload
4. **Conversion**: Frontend sends lowercase `"pass"`/`"fail"`, backend converts to uppercase `"PASS"`/`"FAIL"` before storing

## Testing:

To verify the data is coming through, check the backend logs for:
- `Received payload structure:` - Shows the incoming JSON
- `Storing vision_overall:` - Shows the converted value being stored
- `Storing hearing_overall:` - Shows the converted value being stored

