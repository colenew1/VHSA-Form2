import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import serverless from 'serverless-http';
import path from 'path';
import { fileURLToPath } from 'url';
import schoolsRouter from './routes/schools.js';
import studentsRouter from './routes/students.js';
import screeningsRouter from './routes/screenings.js';
import screenersRouter from './routes/screeners.js';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(frontendDir));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'screening-form.html'));
});

// API routes
app.use('/api/schools', schoolsRouter);
app.use('/api/students', studentsRouter);
app.use('/api/screenings', screeningsRouter);
app.use('/api/screeners', screenersRouter);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Export for Netlify Functions
export const handler = serverless(app);
