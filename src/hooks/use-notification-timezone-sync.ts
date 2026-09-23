import { useEffect } from 'react';
import { AppState } from 'react-native';

import { DAILY_NOTIFICATION_CHANNEL_ID, currentTimezone } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLocalization } from '@/providers/localization-provider';

/**
 * Keep the stored notification timezone current.
 *
 * WHY
 * ---
 * `notification_preferences.timezone` was written only inside the "enable
 * notifications" handler, so after moving country or travelling the daily push
 * kept arriving at the old local time until the user pressed the button again.
 * Nothing else in the app ever updated that column.
 *
 * This effect re-syncs the timezone on mount and whenever the app returns to the
 * foreground (the app can be backgrounded across a flight or a DST change), but
 * only when the value actually differs, so it does not write needlessly. It never
 * creates a preference row: a user who never enabled notifications must not be
 * opted in as a side effect.
 */
export function useNotificationTimezoneSync() {
  const { user } = useAuth();
  const { region } = useLocalization();

  useEffect(() => {
    if (!user) return;
    let active = true;

    const sync = async () => {
      const timezone = currentTimezone(region.timeZone);
      try {
        const { data, error } = await supabase
          .from('notification_preferences')
          .select('enabled, timezone')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!active || error || !data?.enabled) return;
        if (data.timezone === timezone) return;
        await supabase
          .from('notification_preferences')
          .update({ timezone })
          .eq('user_id', user.id);
      } catch (error) {
        // Best effort: a stale timezone is far better than a crash or a write loop.
        console.warn('Notification timezone sync failed:', error);
      }
    };

    void sync();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });

    return () => {
      active = false;
      listener.remove();
    };
  }, [region.timeZone, user]);
}

/** Channel id exported so the registration helper and tests agree on one value. */
export { DAILY_NOTIFICATION_CHANNEL_ID };
