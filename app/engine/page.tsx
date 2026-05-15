'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { uploadToCloudinary } from '@/lib/cloudinary'; // Import the helper we created
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
interface Dua {
  arabic: string;
  translation: string;
}

interface Step {
  id: number;
  major_category: string;
  minor_category: string;
  title: string;
  instruction: string;
  step_type: string;
  color_theme: string;
  counter_max: number;
  next_step_id: number;
  option_a_label: string;
  option_a_next_id: number;
  option_b_label: string;
  option_b_next_id: number;
  recommended_duas: Dua[]; 
}

interface Note {
  id: string;
  content: string;
  updated_at: string;
  image_url?: string; // NEW: Added image_url to Note type
}

export default function SingleStepEngine() {
  const router = useRouter();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true); 
  const [isMounted, setIsMounted] = useState(false); // Hydration guard for mobile
  
  // State Machine Variables
  const [counterCount, setCounterCount] = useState(1);
  const [historyStack, setHistoryStack] = useState<number[]>([]);
  
  // Phase Shift Transition State
  const [phaseShiftState, setPhaseShiftState] = useState<'idle' | 'centered' | 'flying'>('idle');
  const [nextPhaseData, setNextPhaseData] = useState<{name: string, theme: string, type: 'major' | 'minor'} | null>(null);

  // Notes & Duas Drawer State
  const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'duas' | 'notes'>('duas'); 
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [isUploading, setIsUploading] = useState(false); // NEW: State for Cloudinary upload
  const [imagePreview, setImagePreview] = useState<string | null>(null); // NEW: Local preview
  
  // Edit Note State
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState('');

  // --- Haptics Helper ---
  const triggerVibration = (type: 'tap' | 'success' | 'phase_complete') => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'tap') navigator.vibrate(40);
      if (type === 'success') navigator.vibrate([40, 60, 40]);
      if (type === 'phase_complete') navigator.vibrate([50, 100, 50, 100, 200]);
    }
  };

  // --- Initialization ---
  useEffect(() => {
    setIsMounted(true);
    const pid = localStorage.getItem('hajj_active_profile');
    if (!pid) return router.push('/');
    setProfileId(pid);

    const savedHistory = localStorage.getItem('hajj_history_stack');
    if (savedHistory) setHistoryStack(JSON.parse(savedHistory));

    loadUserAndStep(pid);
  }, []);

  const loadUserAndStep = async (pid: string) => {
    const { data: profileData } = await supabase.from('profiles').select('current_step_id').eq('id', pid).single();

    if (profileData) {
      const cachedStepsText = localStorage.getItem('hajj_all_steps');
      const stepsArray: Step[] = cachedStepsText ? JSON.parse(cachedStepsText) : [];
      
      const currentStep = stepsArray.find(s => s.id === profileData.current_step_id);
      
      if (currentStep) {
        if (!currentStep.recommended_duas) currentStep.recommended_duas = [];
        
        setStep(currentStep);
        if (currentStep.step_type === 'counter') setCounterCount(1);
        
        const savedHistory = localStorage.getItem('hajj_history_stack');
        let currentStack: number[] = savedHistory ? JSON.parse(savedHistory) : [];
        
        if (currentStep.step_type !== 'decision' && currentStack[currentStack.length - 1] !== currentStep.id) {
          currentStack = [...currentStack, currentStep.id];
          localStorage.setItem('hajj_history_stack', JSON.stringify(currentStack));
        }
        setHistoryStack(currentStack);

        if (currentStep.recommended_duas.length === 0) {
          setActiveTab('notes');
        } else {
          setActiveTab('duas');
        }

        fetchUserNotes(pid, currentStep.id);
      }
    }
    setIsInitialLoad(false); 
  };

  const fetchUserNotes = async (pid: string, stepId: number) => {
    const { data, error } = await supabase
      .from('user_notes')
      .select('id, content, updated_at, image_url') // NEW: Fetching image_url
      .eq('profile_id', pid)
      .eq('step_id', stepId)
      .order('updated_at', { ascending: true }); 
    
    if (error) console.error("Error fetching notes:", error);
    setNotes(data || []);
  };

  // --- Note Actions ---
  const handleSaveNewNote = async () => {
    if (!profileId || !step || (!newNoteText.trim() && !imagePreview)) return;
    triggerVibration('tap');
    setIsUploading(true);

    let uploadedImageUrl = '';

    // Handle Cloudinary upload if an image was picked
    const fileInput = document.getElementById('imagePicker') as HTMLInputElement;
    if (fileInput?.files?.[0]) {
      try {
        uploadedImageUrl = await uploadToCloudinary(fileInput.files[0]);
      } catch (err) {
        alert("Upload failed. Check your connection.");
        setIsUploading(false);
        return;
      }
    }
    
    const newNote = { 
      profile_id: profileId, 
      step_id: step.id, 
      content: newNoteText,
      image_url: uploadedImageUrl // NEW: Saving image_url to Supabase
    };
    
    await supabase.from('user_notes').insert([newNote]);
    
    setNewNoteText('');
    setImagePreview(null);
    setIsUploading(false);
    fetchUserNotes(profileId, step.id); 
  };

  const handleStartEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditNoteText(note.content);
  };

  const handleSaveEdit = async () => {
    if (!editingNoteId || !profileId || !step) return;
    triggerVibration('tap');
    
    await supabase.from('user_notes').update({ content: editNoteText, updated_at: new Date().toISOString() }).eq('id', editingNoteId);
    
    setEditingNoteId(null);
    fetchUserNotes(profileId, step.id);
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Are you sure you want to delete this note?")) return;
    triggerVibration('tap');
    
    const { error } = await supabase.from('user_notes').delete().eq('id', noteId);
    if (error) console.error("Delete failed:", error);
    else fetchUserNotes(profileId!, step!.id);
  };

  // --- State Machine Actions ---
  const advanceToStep = async (nextStepId: number) => {
    if (!profileId || !step) return;

    if (nextStepId === 999 || (nextStepId === 100 && step.id === 602)) {
      router.push('/dashboard');
      return;
    }

    const cachedStepsText = localStorage.getItem('hajj_all_steps');
    const freshCache: Step[] = cachedStepsText ? JSON.parse(cachedStepsText) : [];
    const nextStepInfo = freshCache.find(s => s.id === nextStepId);

    if (!nextStepInfo) {
      await supabase.from('profiles').update({ current_step_id: nextStepId }).eq('id', profileId);
      loadUserAndStep(profileId);
      return;
    }

    const isMajorTransition = nextStepInfo.major_category !== step.major_category;
    const isMinorTransition = !isMajorTransition && nextStepInfo.minor_category !== step.minor_category;

    if (isMajorTransition || isMinorTransition) {
      triggerVibration('phase_complete');
      
      const transitionType = isMajorTransition ? 'major' : 'minor';
      const transitionName = isMajorTransition ? nextStepInfo.major_category : nextStepInfo.minor_category;
      
      setNextPhaseData({ name: transitionName, theme: nextStepInfo.color_theme, type: transitionType });
      setPhaseShiftState('centered');

      const centerDuration = isMajorTransition ? 3500 : 2000;
      const totalDuration = isMajorTransition ? 5000 : 3000;

      setTimeout(() => {
        setPhaseShiftState('flying');
      }, centerDuration);

      setTimeout(async () => {
        await supabase.from('profiles').update({ current_step_id: nextStepId }).eq('id', profileId);
        await loadUserAndStep(profileId); 
        setPhaseShiftState('idle'); 
      }, totalDuration);

    } else {
      triggerVibration('success');
      await supabase.from('profiles').update({ current_step_id: nextStepId }).eq('id', profileId);
      loadUserAndStep(profileId);
    }
  };

  const handleNext = () => {
    if (!step) return;
    if (step.step_type === 'counter') {
      if (counterCount < step.counter_max) {
        triggerVibration('tap');
        setCounterCount(prev => prev + 1);
      } else {
        advanceToStep(step.next_step_id); 
      }
    } else if (step.step_type === 'linear') {
      advanceToStep(step.next_step_id);
    }
  };

  const handlePrevious = async () => {
    const savedHistory = localStorage.getItem('hajj_history_stack');
    const currentStack = savedHistory ? JSON.parse(savedHistory) : [];
    
    if (currentStack.length <= 1 || !profileId) return;
    
    triggerVibration('tap');
    const newStack = [...currentStack];
    newStack.pop(); 
    const previousStepId = newStack[newStack.length - 1]; 
    
    setHistoryStack(newStack);
    localStorage.setItem('hajj_history_stack', JSON.stringify(newStack));
    
    await supabase.from('profiles').update({ current_step_id: previousStepId }).eq('id', profileId);
    loadUserAndStep(profileId);
  };

  // --- UI Helpers ---
  const getThemeClasses = (theme: string) => {
    const themes: Record<string, { bg: string, ring: string, text: string, button: string }> = {
      'sand':  { bg: 'bg-[#FCFBF8]', ring: 'text-amber-500', text: 'text-amber-800', button: 'bg-amber-700 hover:bg-amber-800' },
      'sage':  { bg: 'bg-[#F7FBF9]', ring: 'text-emerald-500', text: 'text-emerald-800', button: 'bg-emerald-700 hover:bg-emerald-800' },
      'sky':   { bg: 'bg-[#F7FAFD]', ring: 'text-sky-500', text: 'text-sky-800', button: 'bg-sky-700 hover:bg-sky-800' },
      'slate': { bg: 'bg-[#F8F9FA]', ring: 'text-slate-500', text: 'text-slate-800', button: 'bg-slate-700 hover:bg-slate-800' },
    };
    return themes[theme] || themes['slate'];
  };

  if (!isMounted) return null; // Hydration protection
  if (isInitialLoad || !step) return <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center text-slate-400 uppercase tracking-widest text-sm">Loading Engine...</div>;

  const activeThemeClasses = phaseShiftState !== 'idle' && nextPhaseData ? getThemeClasses(nextPhaseData.theme) : getThemeClasses(step.color_theme);
  const strokeOffset = step.step_type === 'counter' ? (2 * Math.PI * 40) - (counterCount / step.counter_max) * (2 * Math.PI * 40) : 0;
  
  const duasCount = step.recommended_duas?.length || 0;

  return (
    <div className={`min-h-screen ${activeThemeClasses.bg} font-sans relative overflow-hidden transition-colors duration-1000 flex flex-col`}>
      
      {/* PHASE SHIFT CENTRAL OVERLAY */}
      <AnimatePresence>
        {phaseShiftState !== 'idle' && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none">
            <motion.p 
              initial={{ y: 20, opacity: 0 }} 
              animate={{ y: 0, opacity: phaseShiftState === 'flying' ? 0 : 0.5 }} 
              exit={{ opacity: 0 }} 
              transition={{ duration: 0.8 }}
              className={`text-xs uppercase tracking-[0.3em] font-semibold mb-4 ${activeThemeClasses.text}`}
            >
              {nextPhaseData?.type === 'major' ? 'Phase Complete' : 'Next Step'}
            </motion.p>
            
            <AnimatePresence>
              {phaseShiftState === 'centered' && (
                <motion.div 
                  layoutId={nextPhaseData?.type === 'major' ? "major-category-badge" : "minor-category-badge"} 
                  className="flex items-center justify-center"
                >
                  <h1 className={`text-3xl font-light tracking-wide text-center px-6 ${activeThemeClasses.text}`}>
                    {nextPhaseData?.name}
                  </h1>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>

      {/* --- TOP NAVIGATION --- */}
      <div className="flex justify-between items-start p-6 pb-0 z-20 min-h-[80px]">
        <button 
          onClick={() => router.push('/dashboard')} 
          className="w-10 h-10 shrink-0 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 transition-transform active:scale-90"
        >
          ✕
        </button>
        <div className="text-right flex flex-col items-end">
          
          {/* MAJOR CATEGORY BADGE */}
          {phaseShiftState === 'centered' && nextPhaseData?.type === 'major' ? (
            <div className="h-[15px]" /> 
          ) : (
            <motion.div layoutId="major-category-badge" className="origin-top-right">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">
                {phaseShiftState === 'flying' && nextPhaseData?.type === 'major' ? nextPhaseData.name : step.major_category}
              </p>
            </motion.div>
          )}

          {/* MINOR CATEGORY BADGE */}
          {phaseShiftState === 'centered' && nextPhaseData?.type === 'minor' ? (
            <div className="h-[20px]" /> 
          ) : (
            <AnimatePresence>
              {(phaseShiftState === 'idle' || (phaseShiftState === 'flying' && nextPhaseData?.type === 'minor')) && (
                <motion.h1 
                  layoutId="minor-category-badge"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className={`text-sm font-semibold uppercase tracking-wider ${activeThemeClasses.text}`}
                >
                  {phaseShiftState === 'flying' && nextPhaseData?.type === 'minor' ? nextPhaseData.name : step.minor_category}
                </motion.h1>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* --- MAIN ENGINE UI --- */}
      <div className={`flex-1 flex flex-col px-6 pb-24 ${phaseShiftState !== 'idle' ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity duration-700`}>
        
        <AnimatePresence mode="wait">
          <motion.div 
            key={step.id}
            initial={{ opacity: 0, scale: 0.98, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -15 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex-1 flex flex-col w-full max-w-md mx-auto"
          >
            {/* The Main Card */}
            <div className="flex-1 flex flex-col justify-center z-10">
              <div className="bg-white rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] p-8 border border-slate-50 relative">
                
                {step.step_type === 'counter' && (
                  <div className="flex justify-center mb-8 relative">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle cx="64" cy="64" r="40" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-100" />
                      <motion.circle 
                        cx="64" cy="64" r="40" stroke="currentColor" strokeWidth="6" fill="transparent"
                        strokeDasharray={2 * Math.PI * 40} strokeDashoffset={strokeOffset}
                        transition={{ duration: 0.5, ease: "easeOut" }} strokeLinecap="round" className={activeThemeClasses.ring}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-4xl font-light ${activeThemeClasses.text}`}>{counterCount}</span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">of {step.counter_max}</span>
                    </div>
                  </div>
                )}

                <h2 className="text-3xl font-medium text-slate-800 mb-4 leading-tight">{step.title}</h2>
                <p className="text-slate-500 text-lg leading-relaxed">{step.instruction}</p>

                {/* Combined Trigger Button */}
                <div className="mt-8 pt-6 border-t border-slate-100">
                  <button 
                    onClick={() => setIsNotesDrawerOpen(true)}
                    className="w-full bg-slate-50/50 hover:bg-slate-50 p-4 rounded-2xl flex items-center justify-between transition-colors border border-slate-100/50 text-left active:scale-95 group"
                  >
                    <div>
                      <span className={`text-sm font-medium ${activeThemeClasses.text}`}>Duas & Notes</span>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                        {duasCount > 0 && <span>🕌 {duasCount} Recommended</span>}
                        {duasCount > 0 && notes.length > 0 && <span className="text-slate-200">•</span>}
                        {notes.length > 0 && <span>📝 {notes.length} Personal</span>}
                        {duasCount === 0 && notes.length === 0 && <span>Add personal notes</span>}
                      </p>
                    </div>
                    <span className="text-slate-300 group-hover:text-slate-400 text-xl font-light transition-colors">↑</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Actions Area */}
            <div className="w-full mt-8 flex gap-3 z-10">
              {historyStack.length > 1 && (
                <button onClick={handlePrevious} className="bg-white text-slate-500 w-16 rounded-[1.5rem] shadow-sm flex items-center justify-center text-xl active:scale-95 transition-all">←</button>
              )}

              {step.step_type === 'decision' ? (
                <div className="flex-1 flex flex-col gap-3">
                  <button onClick={() => advanceToStep(step.option_a_next_id)} className={`w-full text-white p-5 rounded-[1.5rem] font-medium shadow-[0_8px_20px_rgb(0,0,0,0.1)] active:scale-95 transition-all ${activeThemeClasses.button}`}>{step.option_a_label}</button>
                  <button onClick={() => advanceToStep(step.option_b_next_id)} className="w-full bg-white text-slate-700 p-5 rounded-[1.5rem] font-medium shadow-sm border border-slate-100 active:scale-95 transition-all">{step.option_b_label}</button>
                </div>
              ) : (
                <button onClick={handleNext} className={`flex-1 text-white p-5 rounded-[1.5rem] font-medium text-lg shadow-[0_8px_20px_rgb(0,0,0,0.1)] active:scale-95 transition-all flex items-center justify-between px-8 ${activeThemeClasses.button}`}>
                  <span>{step.step_type === 'counter' && counterCount < step.counter_max ? `Complete Round ${counterCount}` : 'Complete & Next'}</span>
                  <span>→</span>
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* --- THE DUAL-TAB DRAWER (Duas & Notes) --- */}
      <AnimatePresence>
        {isNotesDrawerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsNotesDrawerOpen(false)}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-40"
            />
            
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] p-6 pt-6 z-50 shadow-2xl flex flex-col h-[85vh] max-w-md mx-auto"
            >
              {/* Drawer Header & Dismiss */}
              <div className="flex justify-between items-center mb-4 px-2 shrink-0">
                <h3 className="text-xl font-medium text-slate-800">Reading & Reflections</h3>
                <button onClick={() => setIsNotesDrawerOpen(false)} className="text-slate-400 bg-slate-50 w-8 h-8 rounded-full flex items-center justify-center">✕</button>
              </div>

              {/* Segmented Tab Control */}
              <div className="flex p-1 bg-slate-100/70 rounded-xl mb-4 shrink-0">
                <button 
                  onClick={() => setActiveTab('duas')} 
                  className={`flex-1 py-2 text-xs uppercase tracking-wider font-semibold rounded-lg transition-all ${activeTab === 'duas' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Recommended
                </button>
                <button 
                  onClick={() => setActiveTab('notes')} 
                  className={`flex-1 py-2 text-xs uppercase tracking-wider font-semibold rounded-lg transition-all ${activeTab === 'notes' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  My Notes
                </button>
              </div>

              {/* TAB 1: RECOMMENDED DUAS */}
              {activeTab === 'duas' && (
                <div className="flex-1 overflow-y-auto space-y-6 pb-8 px-2 mt-2">
                  {step.recommended_duas?.length > 0 ? (
                    step.recommended_duas.map((dua, i) => (
                      <div key={i} className="bg-[#FAFAFA] p-6 rounded-3xl border border-slate-50">
                        <p dir="rtl" lang="ur" className="text-4xl leading-[2.2] text-right text-slate-800 mb-5" style={{ fontFamily: '"Jameel Noori Nastaleeq", "Noto Naskh Arabic", "Amiri", serif' }}>
                          {dua.arabic}
                        </p>
                        <div className="w-12 h-px bg-slate-200 mb-4 ml-auto" />
                        <p className="text-sm text-slate-600 leading-relaxed text-right">
                          {dua.translation}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-8 opacity-60">
                      <div className="text-4xl mb-4">🤲</div>
                      <p className="text-slate-500 font-medium mb-1">No specific Dua prescribed</p>
                      <p className="text-xs text-slate-400">Make any personal supplications in your own words.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PERSONAL NOTES */}
              {activeTab === 'notes' && (
                <>
                  <div className="flex-1 overflow-y-auto space-y-4 pb-4 px-2 mt-2">
                    {notes.map(n => (
                      <div key={n.id} className="bg-[#FAFAFA] p-4 rounded-2xl border border-slate-50 group">
                        {editingNoteId === n.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea 
                              value={editNoteText} onChange={(e) => setEditNoteText(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-slate-700 outline-none text-sm min-h-[80px] resize-none"
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingNoteId(null)} className="px-3 py-1.5 text-xs text-slate-400 font-medium">Cancel</button>
                              <button onClick={handleSaveEdit} className={`px-4 py-1.5 text-xs text-white rounded-lg font-medium ${activeThemeClasses.button}`}>Save</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-start mb-2">
                              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">
                                {new Date(n.updated_at).toLocaleDateString()}
                              </p>
                              <div className="flex gap-3 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleStartEdit(n)} className="text-[10px] uppercase font-semibold text-slate-400 hover:text-slate-600 tracking-wider">Edit</button>
                                <button onClick={() => handleDeleteNote(n.id)} className="text-[10px] uppercase font-semibold text-red-400 hover:text-red-600 tracking-wider">Delete</button>
                              </div>
                            </div>
                            {/* NEW: Render image if it exists */}
                            {n.image_url && (
                              <img src={n.image_url} alt="note attachment" className="w-full object-cover rounded-2xl mb-3 border border-slate-100" />
                            )}
                            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{n.content}</p>
                          </>
                        )}
                      </div>
                    ))}
                    {notes.length === 0 && (
                      <div className="h-full flex items-center justify-center opacity-60">
                        <p className="text-slate-500 text-sm">No personal notes added yet.</p>
                      </div>
                    )}
                  </div>

                  {/* Input Area anchored to the bottom */}
                  <div className="shrink-0 pt-4 mt-2 border-t border-slate-100 bg-white">
                    {/* NEW: Image preview area */}
                    {imagePreview && (
                      <div className="relative w-20 h-20 mb-3 ml-2">
                        <img src={imagePreview} alt="preview" className="w-full h-full object-cover rounded-2xl border border-slate-200" />
                        <button 
                          onClick={() => setImagePreview(null)}
                          className="absolute -top-2 -right-2 bg-slate-900 text-white w-5 h-5 rounded-full text-[10px] flex items-center justify-center"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    <div className="flex gap-2 mb-2 px-1">
                      <textarea 
                        value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)}
                        placeholder="Type a personal note, reminder, or Dua..."
                        className="flex-1 bg-[#FAFAFA] border border-slate-100 rounded-2xl p-4 text-slate-700 focus:ring-2 focus:ring-slate-200 outline-none text-sm min-h-[80px] resize-none"
                      />
                      
                      {/* NEW: Image Picker Icon */}
                      <label className="shrink-0 w-12 h-12 bg-slate-50 hover:bg-slate-100 border border-slate-100 flex items-center justify-center rounded-2xl cursor-pointer active:scale-90 transition-transform mt-auto mb-1">
                        <input 
                          id="imagePicker"
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setImagePreview(URL.createObjectURL(file));
                          }}
                        />
                        <span className="text-xl">📸</span>
                      </label>
                    </div>

                    <button 
                      onClick={handleSaveNewNote} 
                      disabled={(!newNoteText.trim() && !imagePreview) || isUploading}
                      className={`w-full py-3.5 rounded-2xl font-medium text-white transition-opacity ${(!newNoteText.trim() && !imagePreview) || isUploading ? 'opacity-50 cursor-not-allowed' : 'opacity-100'} ${activeThemeClasses.button}`}
                    >
                      {isUploading ? 'Uploading Image...' : 'Save Note'}
                    </button>
                  </div>
                </>
              )}

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}