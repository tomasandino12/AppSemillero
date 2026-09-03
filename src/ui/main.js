import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { toast } from './nav.js';

console.log('xlsx cargado:', typeof XLSX.read === 'function');
console.log('supabase-js cargado:', typeof createClient === 'function');
toast('Scaffold cargado — ver consola');
