# VHSA School Health Screening System

A complete Node.js + Express backend API and HTML frontend for managing school health screenings, built for Vision & Hearing Screening of Austin.

## Features

- ✅ Student roster management with auto-generated unique IDs
- ✅ Student search by ID or name
- ✅ Screening requirements based on Texas state law (grade, gender, DOB)
- ✅ Multiple screening types: Vision, Hearing, Acanthosis Nigricans, Scoliosis
- ✅ Checkbox-based scoliosis observations
- ✅ Screener management
- ✅ Responsive, mobile-friendly design
- ✅ Real-time validation and submission

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: Supabase (PostgreSQL)
- **Frontend**: HTML5, CSS3, Tailwind CSS (CDN), Vanilla JavaScript
- **Hosting**: Netlify (frontend)

## Project Structure

```
VHSA-Form 2/
├── backend/
│   ├── routes/
│   │   ├── schools.js
│   │   ├── students.js
│   │   ├── screenings.js
│   │   └── screeners.js
│   ├── utils/
│   │   ├── supabase.js
│   │   ├── screening-rules.js
│   │   └── validators.js
│   ├── package.json
│   ├── server.js
│   └── .env (not in repo)
├── frontend/
│   └── screening-form.html
├── netlify.toml
└── README.md
```

## Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/colenew1/VHSA-Form2.git
   cd VHSA-Form2
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Configure environment variables**
   
   Create `backend/.env` file:
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   PORT=3000
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Access the application**
   - Frontend: http://localhost:3000/
   - Health check: http://localhost:3000/health
   - API base: http://localhost:3000/api

## Deployment to Netlify

The frontend is configured for deployment to Netlify:

1. **Connect your repository to Netlify**
   - Go to [Netlify Dashboard](https://app.netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub repository

2. **Configure build settings** (already set in `netlify.toml`)
   - Build command: `cd backend && npm install`
   - Publish directory: `frontend`

3. **Set environment variables** (optional, for backend API)
   - Add your Supabase credentials in Netlify's environment variables section

4. **Deploy**
   - Netlify will automatically deploy on every push to the main branch

## API Endpoints

### Schools
- `GET /api/schools` - Get all active schools

### Students
- `GET /api/students` - Get all students with screening status
- `GET /api/students/:uniqueId` - Get student by ID
- `POST /api/students/search` - Search by last name and school
- `POST /api/students/quick-add` - Create new student

### Screenings
- `POST /api/screenings` - Submit screening results

### Screeners
- `GET /api/screeners` - Get all active screeners

## Screening Requirements Logic

Based on Texas state law, screenings are required as follows:

- **Vision & Hearing**: All grades (Pre-K through 12)
- **Acanthosis Nigricans**: Grades 1, 3, 5, 7
- **Scoliosis**: Grade 5, Female students only

## License

ISC

## Author

Vision & Hearing Screening of Austin
