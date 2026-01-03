
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fatfqieorrbwamvqtrsk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdGZxaWVvcnJid2FtdnF0cnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjQzNzEsImV4cCI6MjA4MzAwMDM3MX0.K6ayQZYQGXbQO6_CXaSvI9BODQCPdDkQudoM9HHbPPQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
