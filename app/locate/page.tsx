'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

interface Step {
  id: number;
  major_category: string;
  title: string;
}

interface Profile {
  id: string;
  name: string;
  avatar_url: string;
  current_step_id: number;
  lat: number | null; // UPDATED to match schema
  lng: number | null; // UPDATED to match schema
  last_location_update: string | null;
}

export default function LocateGroup() {
  const router = useRouter();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stepsCache, setStepsCache] = useState<Step[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [locationError, setLocationError] = useState('');
  
  // Ref to hold the interval ID for cleanup
  const syncInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const pid = localStorage.getItem('hajj_active_profile');
    if (!pid) return router.push('/');
    setViewerId(pid);

    // 1. Instant UI: Load steps and profiles from local storage
    const cachedSteps = localStorage.getItem('hajj_all_steps');
    if (cachedSteps) setStepsCache(JSON.parse(cachedSteps));

    const cachedProfiles = localStorage.getItem('hajj_group_locations');
    if (cachedProfiles) setProfiles(JSON.parse(cachedProfiles));

    // 2. Initial fetch and start sync loop
    fetchGroupData();
    
    // Poll every 15 seconds
    syncInterval.current = setInterval(() => {
      fetchGroupData();
    }, 15000);

    return () => {
      if (syncInterval.current) clearInterval(syncInterval.current);
    };
  }, [router]);

  // --- Location Sync Logic ---
  const fetchGroupData = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('name');
      if (data && !error) {
        setProfiles(data);
        localStorage.setItem('hajj_group_locations', JSON.stringify(data));
      }
    } catch (err) {
      console.log("Offline: Using cached group locations.");
    }
  };

  const updateMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

    setIsSharing(true);
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // Map browser standard to your custom schema names
        const { latitude: lat, longitude: lng } = position.coords; 
        const timestamp = new Date().toISOString();

        // Optimistic UI Update for self
        setProfiles(prev => prev.map(p => 
          p.id === viewerId 
            ? { ...p, lat, lng, last_location_update: timestamp } 
            : p
        ));

        // Sync to Supabase
        try {
          await supabase.from('profiles').update({
            lat,
            lng,
            last_location_update: timestamp
          }).eq('id', viewerId);
        } catch (err) {
          console.log("Offline: Could not push location to cloud.");
        }
        setIsSharing(false);
      },
      (error) => {
        setLocationError("Ensure location permissions are allowed.");
        setIsSharing(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // --- Math & Format Helpers ---
  const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
  };

  const formatDistance = (distanceKm: number) => {
    if (distanceKm < 1) return `${Math.round(distanceKm * 1000)}m away`;
    return `${distanceKm.toFixed(1)}km away`;
  };

  const formatTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((new Date().getTime() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return 'Over 1d ago';
  };

  const getStepDetails = (stepId: number) => {
    const step = stepsCache.find(s => s.id === stepId);
    if (!step) return "Preparation / Offline";
    return `${step.major_category}: ${step.title}`;
  };

  // --- UI Renderers ---
  const viewerProfile = profiles.find(p => p.id === viewerId);
  const otherProfiles = profiles.filter(p => p.id !== viewerId);

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-6 pb-24 font-sans flex flex-col">
      
      {/* HEADER */}
      <div className="flex justify-between items-start mb-8 mt-4">
        <button 
          onClick={() => router.push('/dashboard')} 
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
        >
          ←
        </button>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">Group Sync</p>
          <h1 className="text-xl font-medium text-slate-800">Family Locator</h1>
        </div>
      </div>

      {/* MY LOCATION CARD */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 rounded-[2rem] p-6 mb-8 shadow-xl text-white relative overflow-hidden"
      >
        <div className="absolute -right-4 -top-4 text-8xl opacity-10">📍</div>
        <div className="relative z-10 flex justify-between items-end">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">My Status</p>
            <h2 className="text-lg font-medium">{viewerProfile?.name || 'Loading...'}</h2>
            <p className="text-xs text-slate-400 mt-2 max-w-[200px] leading-relaxed">
              {getStepDetails(viewerProfile?.current_step_id || 0)}
            </p>
            {locationError && <p className="text-[10px] text-red-400 mt-2">{locationError}</p>}
          </div>
          <button 
            onClick={updateMyLocation} disabled={isSharing}
            className={`shrink-0 px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-colors ${isSharing ? 'bg-slate-800 text-slate-500' : 'bg-white text-slate-900 active:scale-95'}`}
          >
            {isSharing ? 'Syncing...' : 'Broadcast'}
          </button>
        </div>
      </motion.div>

      {/* OTHERS LIST */}
      <div className="flex-1">
        <h3 className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-4 pl-2">Family Members</h3>
        
        <div className="flex flex-col gap-3">
          {otherProfiles.map((person, index) => {
            // Calculate distance if both viewer and person have locations
            let distanceStr = 'Unknown distance';
            if (viewerProfile?.lat && viewerProfile?.lng && person.lat && person.lng) {
              const dist = getDistanceFromLatLonInKm(
                viewerProfile.lat, viewerProfile.lng,
                person.lat, person.lng
              );
              distanceStr = formatDistance(dist);
            }

            const stepDetails = getStepDetails(person.current_step_id);
            const timeAgo = formatTimeAgo(person.last_location_update);
            // Universal Google Maps search URL based on lat/lng coordinates
            const mapUrl = person.lat && person.lng 
              ? `https://www.google.com/maps/search/?api=1&query=${person.lat},${person.lng}` 
              : '#';

            return (
              <motion.div 
                key={person.id}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}
                className="bg-white p-5 rounded-3xl shadow-sm border border-slate-50 flex items-center gap-4"
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <img src={person.avatar_url} alt={person.name} className="w-14 h-14 rounded-full bg-slate-100 object-cover" />
                  <div className={`absolute bottom-0 right-0 w-4 h-4 border-2 border-white rounded-full ${timeAgo === 'Just now' || timeAgo.includes('m ago') ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h4 className="font-medium text-slate-800 truncate">{person.name}</h4>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest shrink-0 ml-2">{timeAgo}</span>
                  </div>
                  
                  {/* Step Progress */}
                  <p className="text-[11px] text-slate-500 font-medium truncate mb-1 bg-slate-50 inline-block px-2 py-0.5 rounded-md">
                    {stepDetails}
                  </p>
                  
                  {/* Distance */}
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <span className="opacity-70">🚶</span> {distanceStr}
                  </p>
                </div>

                {/* Map Action */}
                <a 
                  href={mapUrl} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => { if (!person.lat) e.preventDefault(); }}
                  className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-transform active:scale-90 ${person.lat ? 'bg-blue-50 text-blue-500 hover:bg-blue-100' : 'bg-slate-50 text-slate-300'}`}
                >
                  <span className="text-xl">📍</span>
                </a>
              </motion.div>
            );
          })}
          
          {otherProfiles.length === 0 && (
            <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-3xl">
              <p className="text-sm text-slate-400">Waiting for family members to join the journey.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}