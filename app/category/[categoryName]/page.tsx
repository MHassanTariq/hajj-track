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
  
  // Safely decode the category name from the URL
  const categoryName = params.categoryName 
    ? decodeURIComponent(params.categoryName as string) 
    : '';

  const [phases, setPhases] = useState<MinorPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    // 1. Get steps from cache
    const cachedStepsText = localStorage.getItem('hajj_all_steps');
    if (!cachedStepsText) {
      router.push('/dashboard');
      return;
    }

    const allSteps: Step[] = JSON.parse(cachedStepsText);

    // 2. Filter for this specific major category
    const categorySteps = allSteps.filter(s => s.major_category === categoryName);

    // 3. Group by Minor Category and find the starting ID for each
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
        groupedPhases[step.minor_category].stepCount += 1;
        // Ensure we keep the absolute lowest ID as the starting point
        if (step.id < groupedPhases[step.minor_category].firstStepId) {
          groupedPhases[step.minor_category].firstStepId = step.id;
        }
      }
    });

    // Convert the object to an array and sort by starting ID to maintain chronological order
    const phasesArray = Object.values(groupedPhases).sort((a, b) => a.firstStepId - b.firstStepId);
    
    setPhases(phasesArray);
    setLoading(false);
  }, [categoryName, router]);

  // --- Handlers ---
  const handleJumpToPhase = async (firstStepId: number) => {
    setUpdating(true);
    const profileId = localStorage.getItem('hajj_active_profile');
    
    if (profileId) {
      // 1. Update the database so the rest of the group sees where you jumped
      await supabase
        .from('profiles')
        .update({ current_step_id: firstStepId })
        .eq('id', profileId);
        
      // 2. Go to the engine
      router.push('/engine');
    }
  };

  // --- UI Helpers ---
  // Guaranteed high-contrast text with soft backgrounds
  const getThemeClasses = (theme: string) => {
    const themes: Record<string, { bg: string, border: string, titleText: string, accentText: string }> = {
      'sand':  { bg: 'bg-amber-50/70',    border: 'border-amber-200',   titleText: 'text-slate-800', accentText: 'text-amber-700' },
      'sage':  { bg: 'bg-emerald-50/70',  border: 'border-emerald-200', titleText: 'text-slate-800', accentText: 'text-emerald-700' },
      'sky':   { bg: 'bg-sky-50/70',      border: 'border-sky-200',     titleText: 'text-slate-800', accentText: 'text-sky-700' },
      'slate': { bg: 'bg-slate-50/70',    border: 'border-slate-200',   titleText: 'text-slate-800', accentText: 'text-slate-600' },
    };
    return themes[theme] || themes['slate'];
  };

  if (loading) {
    return <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center text-slate-400 tracking-widest text-sm uppercase">Loading Phases...</div>;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-6 pb-24 font-sans relative">
      
      {/* Loading Overlay when jumping */}
      {updating && (
        <div className="absolute inset-0 z-50 bg-[#FAFAFA]/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-slate-800 font-medium animate-pulse tracking-widest uppercase text-sm">Syncing Journey...</div>
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto">
        
        {/* Navigation Bar */}
        <div className="flex items-center gap-4 mb-10 mt-4">
          <button 
            onClick={() => router.push('/dashboard')}
            className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            ←
          </button>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">Jump-In Menu</p>
            <h1 className="text-xl font-medium text-slate-800 leading-tight">{categoryName}</h1>
          </div>
        </div>

        {/* Timeline Layout */}
        <div className="relative pl-4 border-l-2 border-slate-200 ml-4 space-y-6">
          {phases.map((phase, index) => {
            const theme = getThemeClasses(phase.colorTheme);
            
            return (
              <motion.div
                key={phase.title}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                {/* Timeline Dot matching the theme */}
                <div className={`absolute -left-[23px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full ${theme.bg} border-2 ${theme.border} ring-4 ring-[#FAFAFA]`} />
                
                {/* Clickable Card */}
                <button
                  onClick={() => handleJumpToPhase(phase.firstStepId)}
                  className={`w-full text-left p-6 rounded-[2rem] border shadow-sm transition-all active:scale-95 hover:shadow-md ${theme.bg} ${theme.border}`}
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <h3 className={`text-xl font-medium tracking-tight ${theme.titleText}`}>
                      {phase.title}
                    </h3>
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