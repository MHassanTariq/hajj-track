import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// The '!' tells TypeScript we are confident these environment variables exist
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(req: Request) {
  try {
    const data = await req.json();

    if (data._type === 'location') {
      const { lat, lon, tid, tst } = data;

      const { error } = await supabase
        .from('profiles') // ⚠️ Change this to your actual table name
        .update({
          lat: lat,
          lng: lon, 
          last_location_update: new Date(tst * 1000).toISOString(),
        })
        .eq('id', tid);

      if (error) {
        console.error('Supabase Update Error:', error);
      }
    }

    // Next.js standard way to return a JSON response
    return NextResponse.json([]);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json([]);
  }
}