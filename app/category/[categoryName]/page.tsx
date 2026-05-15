'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';

// --- Types ---
interface Step {
  id: number;
  major_category: string;
  minor_category: string;
  title: string;
  color_theme: string;
}

interface MinorPhase {
  title: string;
  firstStepId: number;
  colorTheme: string;
  stepCount: number;
}

export default function CategoryJumpMenu() {
  const params = useParams();
  const router = useRouter();
  
  const categoryName = params?.categoryName 
    ? decodeURIComponent(params.categoryName as string) 
    : '';

  const [phases, setPhases] = useState<MinorPhase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cachedStepsText = localStorage.getItem('hajj_all_steps');
    if (!cachedStepsText) {
      router.push('/dashboard');
      return;
    }

    try {
      const allSteps: Step[] = JSON.parse(cachedStepsText);
      const categorySteps = allSteps.filter(s => s.major_category === categoryName);

      const groupedPhases: Record<string, MinorPhase> = {};
      
      categorySteps.forEach(step => {
        if (!groupedPhases[step.minor_category]) {
          groupedPhases[step.minor_category] = {
            title: step.minor_category,
            firstStepId: step.id,
            colorTheme: step.color_theme,
            stepCount: 1
          };
        } else {
          groupedPhases[step.minor_category].stepCount++;
        }
      });

      setPhases(Object.values(groupedPhases));
    } catch (e) {
      console.error("Cache parsing error", e);
    } finally {
      setLoading(false);
    }
  }, [categoryName, router]);

  const handleJumpToPhase = (stepId: number) => {
    const profileId = localStorage.getItem('hajj_active_profile');
    
    if (profileId) {
        const cachedProfileData = localStorage.getItem(`hajj_profile_cache_${profileId}`);
        if (cachedProfileData) {
            const updatedProfile = { ...JSON.parse(cachedProfileData), current_step_id: stepId };
            localStorage.setItem(`hajj_profile_cache_${profileId}`, JSON.stringify(updatedProfile));
            // Let the app know we just manually shifted gears so it doesn't overwrite it immediately
            localStorage.setItem('hajj_profile_last_modified', Date.now().toString());
        }
        
        const syncJump = async () => {
            try {
                await supabase.from('profiles').update({ current_step_id: stepId }).eq('id', profileId);
            } catch (e) {}
        };
        syncJump();
    }
    
    // THE FIX: Passing the step ID and a timestamp forces Next.js to ignore the router cache and load fresh!
    router.push(`/engine?jump=${stepId}&t=${Date.now()}`);
  };

  const getThemeClasses = (theme: string) => {
    const themes: Record<string, { bg: string, border: string, titleText: string, accentText: string }> = {
      'sand':  { bg: 'bg-[#FCFBF8]', border: 'border-amber-100', titleText: 'text-amber-900', accentText: 'text-amber-500' },
      'sage':  { bg: 'bg-[#F7FBF9]', border: 'border-emerald-100', titleText: 'text-emerald-900', accentText: 'text-emerald-500' },
      'sky':   { bg: 'bg-[#F7FAFD]', border: 'border-sky-100', titleText: 'text-sky-900', accentText: 'text-sky-500' },
      'slate': { bg: 'bg-[#F8F9FA]', border: 'border-slate-100', titleText: 'text-slate-900', accentText: 'text-slate-500' },
    };
    return themes[theme] || themes['slate'];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-6 pb-24 font-sans flex flex-col">
      <div className="flex justify-between items-start mb-8 mt-4">
        <button onClick={() => router.push('/dashboard')} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 active:scale-90 transition-transform">
          ←
        </button>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">Phase Details</p>
          <h1 className="text-xl font-medium text-slate-800">{categoryName}</h1>
        </div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 max-w-md mx-auto w-full pl-4 border-l-2 border-slate-100/60 mt-4 relative">
        <div className="flex flex-col gap-8">
          {phases.map((phase, index) => {
            const theme = getThemeClasses(phase.colorTheme);
            return (
              <motion.div key={phase.title} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }} className="relative">
                <div className={`absolute -left-[23px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full ${theme.bg} border-2 ${theme.border} ring-4 ring-[#FAFAFA]`} />
                <button
                  onClick={() => handleJumpToPhase(phase.firstStepId)}
                  className={`w-full text-left p-6 rounded-[2rem] border shadow-sm transition-all active:scale-95 hover:shadow-md ${theme.bg} ${theme.border}`}
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <h3 className={`text-xl font-medium tracking-tight ${theme.titleText}`}>{phase.title}</h3>
                    <span className={`text-xl font-light opacity-50 ${theme.titleText}`}>→</span>
                  </div>
                  <p className={`text-xs uppercase tracking-widest font-semibold ${theme.accentText}`}>
                    {phase.stepCount} {phase.stepCount === 1 ? 'Action' : 'Actions'}
                  </p>
                </button>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}