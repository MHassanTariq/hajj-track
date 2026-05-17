import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// The '!' tells TypeScript we are confident these environment variables exist
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function mapTidToSupabaseId(tid: "ZH" | "DZ" | "SA" | "MA" | "IZ" | "HT" | "AT") {
    const data = {
        "ZH": "ace7c7d0-a7d8-42c3-96da-95c3e10af195",
        "DZ": "c88c3be7-ace6-4015-8ad7-cbf87166a2f1",
        "SA": "3c7a07c8-3720-4599-8d7e-cd60400855b6",
        "MA": "203c05e5-c0e3-46d8-a426-26ed49be081e",
        "IZ": "587a3287-23cd-4571-90ae-1ef4222d48eb",
        "HT": "298ed83e-8ca4-478a-9e81-60b7db1c0731",
        "AT": "83f27cbd-a703-4f68-a166-db7920299a46"
    }
    return data[tid]
}

export async function POST(req: Request) {
    try {
        const data = await req.json();
        console.log('received request: ', data)

        if (data._type === 'location') {
            const { lat, lon, tid, tst } = data;

            const { error } = await supabase
                .from('profiles') // ⚠️ Change this to your actual table name
                .update({
                    lat: lat,
                    lng: lon,
                    last_location_update: new Date(tst * 1000).toISOString(),
                })
                .eq('id', mapTidToSupabaseId(tid));

            if (error) {
                console.error('Supabase Update Error:', error);
            }
        }

        // Next.js standard way to return a JSON response
        console.log('returning response')
        return NextResponse.json([]);

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json([]);
    }
}