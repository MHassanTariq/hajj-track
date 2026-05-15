'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

// --- Types ---
interface Profile {
  id: string;
  name: string;
  avatar_url: string;
  current_step_id: number;
}

interface Step {
  id: number;
  major_category: string;
  minor_category: string;
  title: string;
  instruction: string;
  step_type: string;
  color_theme: string;
}

export default function Dashboard() {
  const router = useRouter();

  // --- State ---
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [currentStepTitle, setCurrentStepTitle] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  // --- Initialization ---
  useEffect(() => {
    setIsMounted(true);
    const profileId = localStorage.getItem('hajj_active_profile');
    
    if (!profileId) {
      router.push('/');
      return;
    }

    // 1. Instant Load from Cache
    const cachedProfile = localStorage.getItem(`hajj_profile_cache_${profileId}`);
    const cachedSteps = localStorage.getItem('hajj_all_steps');

    if (cachedProfile) {
      const p = JSON.parse(cachedProfile);
      setProfile(p);
      
      if (cachedSteps) {
        const steps: Step[] = JSON.parse(cachedSteps);
        buildUIFromData(p, steps);
        setLoading(false); // UI becomes interactive instantly
      }
    }

    // 2. Background Sync (Silent)
    syncFreshData(profileId);
  }, [router]);

  // --- Helper: Map Data to UI ---
  const buildUIFromData = (activeProfile: Profile, steps: Step[]) => {
    const uniqueCategories = Array.from(new Set(steps.map(s => s.major_category)));
    setCategories(uniqueCategories);

    const activeStep = steps.find(s => s.id === activeProfile.current_step_id);
    if (activeStep) {
      setCurrentStepTitle(`${activeStep.major_category}: ${activeStep.title}`);
    }
  };

  // --- Background Sync Logic ---
  const syncFreshData = async (pid: string) => {
    try {
      // Fetch Profile & Steps in parallel for speed
      const [profileRes, stepsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', pid).single(),
        supabase.from('steps').select('*').order('id', { ascending: true })
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        localStorage.setItem(`hajj_profile_cache_${pid}`, JSON.stringify(profileRes.data));
      }

      if (stepsRes.data) {
        localStorage.setItem('hajj_all_steps', JSON.stringify(stepsRes.data));
        if (profileRes.data) {
          buildUIFromData(profileRes.data, stepsRes.data);
        }
      }
    } catch (err) {
      console.log("Sync skipped. Running in offline mode.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hajj_active_profile');
    router.push('/');
  };

  const getCategoryTheme = (categoryName: string) => {
    const themes: Record<string, { icon: string, subtitle: string }> = {
      'Umrah': { icon: '🕋', subtitle: 'Tawaf & Sa\'i' },
      '8th Dhul Hijjah': { icon: '⛺', subtitle: 'Movement to Mina' },
      '9th Dhul Hijjah': { icon: '🤲', subtitle: 'Arafat & Muzdalifah' },
      '10th Dhul Hijjah': { icon: '✂️', subtitle: 'Rami, Halq, Tawaf' },
      '11th & 12th Dhul Hijjah': { icon: '🚶', subtitle: 'Ayyam al-Tashreeq' },
    };
    return themes[categoryName] || { icon: '📍', subtitle: 'Hajj Phase' };
  };

  // --- Hydration Guard ---
  if (!isMounted) return null;

  // --- Loading State (Only if no cache exists) ---
  if (loading && !profile) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[10px] tracking-[0.2em] text-slate-400 uppercase font-bold">Loading Journey...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-6 pb-24 font-sans">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto">
        
        {/* Top Bar */}
        <div className="flex justify-between items-center mb-10 mt-4">
          <div className="flex items-center gap-3">
            {profile?.avatar_url && (
              <img 
                src={profile.avatar_url} 
                alt="Avatar" 
                className="w-12 h-12 rounded-full border border-slate-100 object-cover shadow-sm bg-white" 
              />
            )}
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Welcome back</p>
              <h1 className="text-lg font-medium text-slate-800 leading-tight">{profile?.name}</h1>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="text-[10px] font-medium text-slate-400 hover:text-slate-600 uppercase tracking-widest px-4 py-2 bg-white rounded-full shadow-sm border border-slate-100 transition-colors"
          >
            Switch
          </button>
        </div>

        {/* Continue Button */}
        <div className="mb-8">
          <button 
            onClick={() => router.push('/engine')} 
            className="w-full bg-slate-800 text-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] active:scale-95 transition-transform flex flex-col items-start relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-6 opacity-5 text-7xl group-hover:scale-110 transition-transform duration-500">🕋</div>
            <span className="text-[10px] text-slate-300 font-medium uppercase tracking-widest mb-2">Continue Journey</span>
            <span className="text-xl font-light leading-snug">{currentStepTitle || 'Start Journey'}</span>
          </button>
        </div>

        {/* Action Button */}
        <div className="mb-10">
          <button 
            onClick={() => router.push('/locate')} 
            className="w-full bg-white p-5 rounded-3xl shadow-sm border border-slate-50 flex items-center justify-between active:scale-95 transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50/50 text-blue-500 flex items-center justify-center text-xl">📍</div>
              <div className="text-left">
                <h3 className="font-medium text-slate-800">Locate Group</h3>
                <p className="text-xs text-slate-400 mt-0.5">See everyone's current position</p>
              </div>
            </div>
            <span className="text-slate-300 text-xl font-light pr-2">→</span>
          </button>
        </div>

        {/* Categories */}
        <div>
          <h2 className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-4 pl-1">Journey Phases</h2>
          <div className="flex flex-col gap-3">
            {categories.map((catName, index) => {
              const theme = getCategoryTheme(catName);
              return (
                <motion.button
                  key={catName}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => router.push(`/category/${encodeURIComponent(catName)}`)}
                  className="bg-white p-5 rounded-3xl shadow-sm border border-slate-50 flex items-center gap-4 active:scale-95 transition-all hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-slate-50/80">
                    {theme.icon}
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="font-medium text-slate-800 text-base">{catName}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{theme.subtitle}</p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

      </motion.div>
    </div>
  );
}