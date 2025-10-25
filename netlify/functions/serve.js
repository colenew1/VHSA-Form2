import { handler as expressHandler } from '../../backend/netlify.js';

export const handler = async (event, context) => {
  // Ensure the path includes /api prefix for Express routing
  if (!event.path.startsWith('/api')) {
    event.path = '/api' + event.path;
  }
  
  return expressHandler(event, context);
};
