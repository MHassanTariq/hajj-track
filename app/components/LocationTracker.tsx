'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function LocationTracker() {
  const isUpdating = useRef(false);

  useEffect(() => {
    // The core function to fetch and sync location
    const broadcastLocation = () => {
      // Prevent overlapping updates if one is already running
      if (isUpdating.current) return;
      
      const pid = localStorage.getItem('hajj_active_profile');
      if (!pid || !navigator.geolocation) return;

      isUpdating.current = true;

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude: lat, longitude: lng } = position.coords;
          const timestamp = new Date().toISOString();

          try {
            // 1. Optimistic Local Update
            const cached = localStorage.getItem('hajj_group_locations');
            if (cached) {
              const parsed = JSON.parse(cached);
              const updated = parsed.map((p: any) => 
                p.id === pid ? { ...p, lat, lng, last_location_update: timestamp } : p
              );
              localStorage.setItem('hajj_group_locations', JSON.stringify(updated));
            }

            // 2. Silent Cloud Sync
            await supabase.from('profiles').update({
              lat,
              lng,
              last_location_update: timestamp
            }).eq('id', pid);

          } catch (err) {
            console.log("Offline: Background location sync delayed.");
          } finally {
            isUpdating.current = false;
          }
        },
        (error) => {
          console.log("Location access denied or unavailable.");
          isUpdating.current = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    };

    // 1. Trigger immediately when the component mounts
    broadcastLocation();

    // 2. Trigger every 2 minutes (120,000 milliseconds)
    const intervalId = setInterval(broadcastLocation, 120000);

    // 3. Trigger every time the user brings the app back to the screen
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        broadcastLocation();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup listeners when component unmounts
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // This component is entirely invisible
  return null;
}