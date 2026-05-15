'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

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
  image_url?: string;
  recommended_duas?: { image_url?: string }[];
}

export default function Dashboard() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [currentStepTitle, setCurrentStepTitle] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [isOffline, setIsOffline] = useState(false);
  const [showOfflineToast, setShowOfflineToast] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const profileId = localStorage.getItem('hajj_active_profile');
    
    if (!profileId) {
      router.push('/');
      return;
    }

    const handleOffline = () => {
      setIsOffline(true);
      setShowOfflineToast(true);
      setTimeout(() => setShowOfflineToast(false), 30000);
    };
    
    const handleOnline = () => {
      setIsOffline(false);
      setShowOfflineToast(false);
    };

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('offline', handleOffline);
      window.addEventListener('online', handleOnline);
    }

    let p: Profile | null = null;
    try {
      const cachedProfile = localStorage.getItem(`hajj_profile_cache_${profileId}`);
      if (cachedProfile && cachedProfile !== 'undefined') {
        p = JSON.parse(cachedProfile);
      } else {
        const allProfilesCache = localStorage.getItem('hajj_profiles_cache');
        if (allProfilesCache && allProfilesCache !== 'undefined') {
          const allProfiles = JSON.parse(allProfilesCache);
          const profilesArray = Array.isArray(allProfiles) ? allProfiles : (allProfiles.data || []);
          p = profilesArray.find((prof: any) => prof.id === profileId) || null;
          if (p) localStorage.setItem(`hajj_profile_cache_${profileId}`, JSON.stringify(p));
        }
      }
    } catch (e) {
      localStorage.removeItem(`hajj_profile_cache_${profileId}`);
    }

    if (p) setProfile(p);

    try {
      const cachedSteps = localStorage.getItem('hajj_all_steps');
      if (p && cachedSteps && cachedSteps !== 'undefined') {
        const stepsData = JSON.parse(cachedSteps);
        const stepsArray: Step[] = Array.isArray(stepsData) ? stepsData : (stepsData.data || []);
        
        if (stepsArray.length > 0) {
          buildUIFromData(p, stepsArray);
          setLoading(false); 
        }
      }
    } catch (e) {
      console.error("Steps cache corrupted, waiting for network.");
    }

    syncFreshData(profileId, p);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('online', handleOnline);
      }
    };
  }, [router]);

  const buildUIFromData = (activeProfile: Profile | null, steps: Step[]) => {
    if (!steps || !Array.isArray(steps) || !activeProfile) return;

    const uniqueCategories = Array.from(new Set(steps.map(s => s?.major_category).filter(Boolean))) as string[];
    setCategories(uniqueCategories);

    try {
      uniqueCategories.forEach(cat => {
        if (cat) router.prefetch(`/category/${encodeURIComponent(cat)}`);
      });
      router.prefetch('/engine');
      router.prefetch('/locate');
    } catch (e) {}

    const activeStep = steps.find(s => s?.id === activeProfile.current_step_id);
    if (activeStep) {
      setCurrentStepTitle(`${activeStep.major_category}: ${activeStep.title}`);
    }
  };

  // --- THE NEW OFFLINE IMAGE VAULT ---
  const prefetchImagesToCache = async (steps: any[], notes: any[]) => {
    if (!window.caches) return;
    try {
      const cache = await caches.open('hajj-assets-cache');
      const urls: string[] = [];

      // Extract every single image URL from steps and duas
      steps.forEach(step => {
        if (step.image_url) urls.push(step.image_url);
        step.recommended_duas?.forEach((dua: any) => {
          if (dua.image_url) urls.push(dua.image_url);
        });
      });

      // Extract every image from user notes
      notes.forEach(note => {
        if (note.image_url) urls.push(note.image_url);
      });

      const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));

      // Silently download and cache them
      for (const url of uniqueUrls) {
        const exists = await cache.match(url);
        if (!exists) {
          try {
            const response = await fetch(url, { mode: 'cors' });
            if (response.ok) await cache.put(url, response);
          } catch (err) {
            // Fallback for strict CORS domains (like Cloudinary)
            try {
              const opaqueResponse = await fetch(url, { mode: 'no-cors' });
              await cache.put(url, opaqueResponse);
            } catch (e) {}
          }
        }
      }
      console.log("All journey images cached for offline viewing!");
    } catch (e) {
      console.error("Image caching failed:", e);
    }
  };

  const syncFreshData = async (pid: string, fallbackProfile: Profile | null) => {
    try {
      const fetchPromises = Promise.all([
        supabase.from('profiles').select('*').eq('id', pid).single(),
        supabase.from('steps').select('*').order('id', { ascending: true }),
        supabase.from('user_notes').select('*').eq('profile_id', pid) 
      ]);

      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => resolve({ isTimeout: true }), 8000)
      );

      const results = await Promise.race([ fetchPromises, timeoutPromise ]) as any;

      if (results && !results.isTimeout && Array.isArray(results)) {
        const [profileRes, stepsRes, notesRes] = results;
        let updatedProfile = fallbackProfile;

        if (profileRes?.data && !profileRes.error) {
          updatedProfile = profileRes.data;
          setProfile(profileRes.data);
          localStorage.setItem(`hajj_profile_cache_${pid}`, JSON.stringify(profileRes.data));
        }

        if (stepsRes?.data && !stepsRes.error) {
          localStorage.setItem('hajj_all_steps', JSON.stringify(stepsRes.data));
          if (updatedProfile) {
            buildUIFromData(updatedProfile, stepsRes.data);
          }
        }

        if (notesRes?.data && !notesRes.error) {
          localStorage.setItem(`hajj_all_notes_${pid}`, JSON.stringify(notesRes.data));
        }

        // Trigger the image prefetcher in the background
        prefetchImagesToCache(stepsRes?.data || [], notesRes?.data || []);
      }
    } catch (err) {
      console.log("Sync failed fatally. Running in offline mode.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (isOffline) return; 
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

  if (!isMounted) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[10px] tracking-[0.2em] text-slate-400 uppercase font-bold">Loading Journey...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-6 text-center">
        <div className="text-4xl mb-4">📡</div>
        <h2 className="text-xl font-medium text-slate-800 mb-2">No Offline Data</h2>
        <p className="text-sm text-slate-500 max-w-xs mb-8">
          We couldn't reach the server and don't have a local copy of your journey saved yet. Please connect to the internet to download your profile.
        </p>
        <button onClick={() => router.push('/')} className="px-8 py-3 bg-slate-900 text-white rounded-full text-xs font-bold tracking-widest uppercase shadow-md active:scale-95 transition-transform">
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-6 pb-24 font-sans relative">
      <AnimatePresence>
        {showOfflineToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-xl z-50 w-[90%] max-w-sm flex items-center gap-4"
          >
            <span className="text-2xl">📡</span>
            <div>
              <h4 className="text-sm font-bold tracking-wide">You are offline</h4>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">App is running locally. Location sharing and cloud sync are paused.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-10 mt-4">
          <div className="flex items-center gap-3">
            {profile.avatar_url && (
              <img src={profile.avatar_url} alt="Avatar" className="w-12 h-12 rounded-full border border-slate-100 object-cover shadow-sm bg-white" />
            )}
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Welcome back</p>
              <h1 className="text-lg font-medium text-slate-800 leading-tight">{profile.name}</h1>
            </div>
          </div>
          <button 
            onClick={handleLogout} disabled={isOffline}
            className={`text-[10px] font-medium uppercase tracking-widest px-4 py-2 rounded-full shadow-sm border transition-colors ${isOffline ? 'bg-slate-100 text-slate-300 border-transparent cursor-not-allowed opacity-60' : 'text-slate-400 hover:text-slate-600 bg-white border-slate-100 hover:bg-slate-50'}`}
          >
            Switch
          </button>
        </div>

        <div className="mb-8">
          <button onClick={() => router.push('/engine')} className="w-full bg-slate-800 text-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] active:scale-95 transition-transform flex flex-col items-start relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-5 text-7xl group-hover:scale-110 transition-transform duration-500">🕋</div>
            <span className="text-[10px] text-slate-300 font-medium uppercase tracking-widest mb-2">Continue Journey</span>
            <span className="text-xl font-light leading-snug">{currentStepTitle || 'Start Journey'}</span>
          </button>
        </div>

        <div className="mb-10">
          <button onClick={() => router.push('/locate')} className="w-full bg-white p-5 rounded-3xl shadow-sm border border-slate-50 flex items-center justify-between active:scale-95 transition-all hover:shadow-md">
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

        {categories.length > 0 && (
          <div>
            <h2 className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-4 pl-1">Journey Phases</h2>
            <div className="flex flex-col gap-3">
              {categories.map((catName, index) => {
                const theme = getCategoryTheme(catName);
                return (
                  <motion.button
                    key={catName} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
                    onClick={() => router.push(`/category/${encodeURIComponent(catName)}`)}
                    className="bg-white p-5 rounded-3xl shadow-sm border border-slate-50 flex items-center gap-4 active:scale-95 transition-all hover:shadow-md"
                  >
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-slate-50/80">{theme.icon}</div>
                    <div className="text-left flex-1">
                      <h3 className="font-medium text-slate-800 text-base">{catName}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{theme.subtitle}</p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}