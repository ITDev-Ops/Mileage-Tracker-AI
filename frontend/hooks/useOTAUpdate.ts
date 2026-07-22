import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';

export function useOTAUpdate() {
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Only run OTA checks in compiled/production native apps
    if (__DEV__) {
      console.log('[OTA] Dev mode detected. Skipping OTA update check.');
      return;
    }

    async function checkAndApplyUpdate() {
      try {
        setIsChecking(true);
        setError(null);
        console.log('[OTA] Checking for over-the-air updates...');
        
        const updateCheck = await Updates.checkForUpdateAsync();
        
        if (updateCheck.isAvailable) {
          setIsDownloading(true);
          console.log('[OTA] New update available, downloading update bundle...');
          
          await Updates.fetchUpdateAsync();
          
          console.log('[OTA] Update downloaded successfully. Force-reloading app immediately...');
          // Force reload the app immediately to apply the update
          await Updates.reloadAsync();
        } else {
          console.log('[OTA] App is up to date.');
        }
      } catch (e: any) {
        console.warn('[OTA] Error during OTA check/update:', e);
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setIsChecking(false);
        setIsDownloading(false);
      }
    }

    checkAndApplyUpdate();
  }, []);

  return { isChecking, isDownloading, error };
}
