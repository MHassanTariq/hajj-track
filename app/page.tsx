'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

// Define the shape of our data for TypeScript
interface Profile {
  id: string;
  name: string;
  avatar_url: string;
  current_step_id: number;
}

export default function ProfileSelector() {
  const router = useRouter();

  // 1. Start with an empty state that matches the Server-Side render
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // 2. Trigger mounting flag to signal we are safe for client-only logic
    setIsMounted(true);

    // Check if a profile is already saved on this device
    const savedProfileId = localStorage.getItem('hajj_active_profile');
    if (savedProfileId) {
      router.push('/dashboard');
      return;
    }

    // Try to load from local cache
    const saved = localStorage.getItem('hajj_profiles_cache');
    if (saved) {
      setProfiles(JSON.parse(saved));
      setLoading(false);
    }

    loadProfiles();
  }, [router]);

  async function loadProfiles() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('id', { ascending: true });
      
      if (!error && data) {
        const profileData = data as Profile[];
        setProfiles(profileData);
        // Save to cache for the next time the app is opened offline
        localStorage.setItem('hajj_profiles_cache', JSON.stringify(profileData));
      }
    } catch (err) {
      console.log("Working offline: Using cached profiles.");
    } finally {
      setLoading(false);
    }
  }

  const handleSelectProfile = (profileId: string) => {
    localStorage.setItem('hajj_active_profile', profileId);
    router.push('/dashboard'); 
  };

  // 3. HYDRATION GUARD: Until the component is mounted, render a consistent loading state
  // This prevents the p-6 class mismatch you see in image_81b2c4.png
  if (!isMounted || loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[10px] tracking-[0.2em] text-slate-400 uppercase font-bold">Syncing Profiles...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full"
      >
        <h1 className="text-3xl font-light text-slate-800 text-center mb-2 tracking-wide">Welcome</h1>
        <p className="text-slate-400 text-center mb-10 text-sm tracking-widest uppercase">Select your profile</p>
        
        <div className="grid grid-cols-2 gap-4">
          {profiles.map((profile, index) => (
            <motion.button 
              key={profile.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSelectProfile(profile.id)}
              className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 flex flex-col items-center gap-4 transition-shadow hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
            >
              <img 
                src={profile.avatar_url} 
                alt={profile.name} 
                className="w-16 h-16 rounded-full bg-slate-50 object-cover"
              />
              <span className="font-medium text-slate-600 text-sm">{profile.name}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}