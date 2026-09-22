import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen, SecondaryButton, SectionTitle } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { useSubscription } from '@/hooks/use-subscription';
import { COMPLETE_LANGUAGES, SUPPORTED_REGIONS, getCountryLabel } from '@/i18n/config';
import type { CompleteLanguageCode, TranslationKey } from '@/i18n/config';
import { AccountDeletionError, requestAccountDeletion } from '@/lib/account-deletion';
import { calendarDisplayDescription, calendarDisplayName } from '@/lib/calendar-labels';
import { supportMailtoUrl } from '@/lib/legal-fields';
import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLocalization } from '@/providers/localization-provider';

/** Mapăm erorile Supabase la mesaje prietenoase în limba română. */
function showAccountAlert(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

function friendlyDbError(error: unknown, t: (key: TranslationKey) => string): string {
  if (!(error instanceof Error)) return t('account.dbErrorRetry');
  const msg = error.message.toLowerCase();
  if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('already exists')) {
    return t('account.dbErrorDuplicate');
  }
  if (msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('permission denied')) {
    return t('account.dbErrorUnauthorized');
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('connection')) {
    return t('account.dbErrorNetwork');
  }
  return t('account.dbErrorGeneric');
}

const LANGUAGE_LABELS: Record<CompleteLanguageCode, string> = {
  ro: 'Română',
  en: 'English',
  el: 'Ελληνικά',
  sr: 'Српски',
  bg: 'Български',
  mk: 'Македонски',
  uk: 'Українська',
  ka: 'ქართული',
  ru: 'Русский',
  sq: 'Shqip',
};

export default function AccountScreen() {
  const { isLoading, user, signOut } = useAuth();
  const { dailyAiLimit, error: planError, isLoading: isPlanLoading, isPremium, planLabel } = useSubscription();
  const {
    availableCalendars,
    calendar,
    calendarCode,
    countryCode,
    isLoading: isRegionLoading,
    languageCode,
    region,
    setCalendarCode,
    setCountryCode,
    setLanguageCode,
    t,
  } = useLocalization();
  const [displayName, setDisplayName] = useState('');
  const [profileOwnerId, setProfileOwnerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const isSavingRef = useRef(false);
  const isNotificationRef = useRef(false);
  const isSignOutRef = useRef(false);
  const isDeleteRef = useRef(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // L-05: every mutation handler below awaits a network round-trip and then writes
  // state. `executeDeleteAccount` in particular navigates away while its `finally`
  // block still runs, so the last writes landed on an unmounted tree. React 18 no
  // longer warns about that, which is exactly why the guard has to be explicit
  // rather than relying on a console warning to surface it.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    const userId = user?.id ?? null;

    if (!userId) return;
    let active = true;

    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        setSaveMessage(null);

        if (error) {
          showAccountAlert(t('account.profileUnavailableTitle'), friendlyDbError(error, t));
        } else {
          setDisplayName(data?.display_name ?? '');
          setProfileOwnerId(userId);
        }
      });

    return () => { active = false; };
  }, [user?.id, t]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    // Status is derived from BOTH the preference flag and a live device row. The
    // screen previously trusted `enabled` alone, so after Expo reported
    // DeviceNotRegistered (or another account claimed the token) the user still
    // read "Notifications are active" while the server was skipping them for
    // having no active device.
    Promise.all([
      supabase
        .from('notification_preferences')
        .select('enabled')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('notification_devices')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true),
    ]).then(([preferenceResult, deviceResult]) => {
      if (!active) return;
      if (preferenceResult.error) {
        showAccountAlert(t('account.notificationsUnavailableTitle'), friendlyDbError(preferenceResult.error, t));
        return;
      }
      const preferenceEnabled = Boolean(preferenceResult.data?.enabled);
      const hasActiveDevice = (deviceResult.data ?? []).length > 0;
      // Active only when the server would actually deliver: preference on AND a
      // live device registered.
      setNotificationsEnabled(preferenceEnabled && hasActiveDevice);
    });
    return () => { active = false; };
  }, [user, t]);

  const hasCurrentProfile = Boolean(user && profileOwnerId === user.id);

  // Support contact is configuration, not prose: a mailto link only exists once the
  // operator supplies an address, so the app never fabricates one.
  const supportMailto = supportMailtoUrl();

  const saveProfile = async () => {
    if (!user || !hasCurrentProfile || saving || isSavingRef.current) return;
    isSavingRef.current = true;
    setSaveMessage(null);
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', user.id);
      if (error) {
        setSaveMessage({ type: 'error', text: t('account.profileSaveFailedMessage') });
        showAccountAlert(t('account.profileSaveFailedTitle'), friendlyDbError(error, t));
      } else {
        setSaveMessage({ type: 'success', text: t('account.profileSavedMessage') });
        showAccountAlert(t('account.profileSavedTitle'));
      }
    } catch {
      setSaveMessage({ type: 'error', text: t('account.unexpectedError') });
      showAccountAlert(t('account.errorTitle'), t('account.unexpectedError'));
    } finally {
      isSavingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (isSignOutRef.current) return;
    isSignOutRef.current = true;
    try {
      await signOut();
    } catch (error) {
      showAccountAlert(t('account.signOutErrorTitle'), friendlyDbError(error, t));
    } finally {
      isSignOutRef.current = false;
    }
  };

  const handleDeleteAccount = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const firstConfirmed = window.confirm(
        t('account.deleteAccountTitle') + '\n\n' + t('account.deleteAccountMessage'),
      );
      if (!firstConfirmed) return;

      const finalConfirmed = window.confirm(
        t('account.deleteConfirmTitle') + '\n\n' + t('account.deleteConfirmMessage'),
      );
      if (finalConfirmed) void executeDeleteAccount();
      return;
    }
    // First confirmation — explain what will happen.
    Alert.alert(
      t('account.deleteAccountTitle'),
      t('account.deleteAccountMessage'),
      [
        { text: t('account.cancelButton'), style: 'cancel' },
        {
          text: t('account.continueButton'),
          style: 'destructive',
          // Second confirmation — explicit final step.
          onPress: () => {
            Alert.alert(
              t('account.deleteConfirmTitle'),
              t('account.deleteConfirmMessage'),
              [
                { text: t('account.cancelButton'), style: 'cancel' },
                {
                  text: t('account.deleteButton'),
                  style: 'destructive',
                  onPress: () => void executeDeleteAccount(),
                },
              ],
            );
          },
        },
      ],
    );
  };

  const executeDeleteAccount = async () => {
    if (deleteBusy || isDeleteRef.current) return; // prevent double-submit
    isDeleteRef.current = true;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await requestAccountDeletion();
      // The account and all its rows are gone server-side at this point. Local
      // teardown is therefore BEST EFFORT: if signOut() fails (network loss, or a
      // token whose user no longer exists) the user must still be navigated away,
      // otherwise they stay on an authenticated screen holding a session for a
      // deleted account and every later query fails.
      try {
        await signOut();
      } catch (signOutError) {
        console.warn('Local sign-out failed after account deletion:', signOutError);
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch (localSignOutError) {
          console.warn('Local session cleanup failed after account deletion:', localSignOutError);
        }
      }
      router.replace('/');
    } catch (error) {
      let message: string;
      if (error instanceof AccountDeletionError) {
        const codeToKey: Record<string, TranslationKey> = {
          AUTH_REQUIRED: 'account.deleteAuthRequired',
          SERVICE_UNAVAILABLE: 'account.deleteServiceUnavailable',
          TIMEOUT: 'account.deleteTimeout',
          DELETE_FAILED: 'account.deleteFailedFallback',
        };
        message = t(codeToKey[error.code] ?? 'account.deleteFailedFallback');
      } else {
        message = error instanceof Error ? error.message : t('account.deleteFailedFallback');
      }
      setDeleteError(message);
      showAccountAlert(t('account.errorTitle'), message);
    } finally {
      // Only reset busy state if we didn't sign out (signOut triggers re-render).
      isDeleteRef.current = false;
      if (mountedRef.current) setDeleteBusy(false);
    }
  };

  const enableNotifications = async () => {
    if (!user || notificationBusy || isNotificationRef.current) return;
    isNotificationRef.current = true;
    setNotificationMessage('');
    setNotificationBusy(true);
    let preferenceWasWritten = false;
    try {
      const registration = await registerForPushNotificationsAsync(t('account.notificationChannelName'));
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || region.timeZone;
      const preferenceResult = await supabase.from('notification_preferences').upsert({
        user_id: user.id,
        enabled: true,
        daily_time: '10:00',
        timezone,
        country_code: countryCode,
        language_code: languageCode,
        calendar_code: calendarCode,
      });
      if (preferenceResult.error) throw preferenceResult.error;
      preferenceWasWritten = true;
      const deviceResult = await supabase.rpc('claim_notification_device', {
        p_expo_push_token: registration.token,
        p_platform: registration.platform,
        p_timezone: timezone,
      });
      if (deviceResult.error) throw deviceResult.error;
      setNotificationsEnabled(true);
      setNotificationMessage(t('account.notificationsActiveMessage'));
    } catch (error) {
      // Roll back a half-enabled state. Previously the preference row kept
      // enabled=true with no device registered, so the cron iterated that user on
      // every run and counted them as skipped, while the UI showed inactive.
      if (preferenceWasWritten) {
        try {
          await supabase
            .from('notification_preferences')
            .update({ enabled: false })
            .eq('user_id', user.id);
        } catch (rollbackError) {
          console.warn('Failed to roll back the notification preference:', rollbackError);
        }
      }
      setNotificationsEnabled(false);
      setNotificationMessage(t('account.notificationsActivateFailedPrefix') + friendlyDbError(error, t));
    } finally {
      isNotificationRef.current = false;
      if (mountedRef.current) setNotificationBusy(false);
    }
  };

  /**
   * Turn the daily notification off.
   *
   * The app previously had no way to stop it: the only write to
   * `notification_preferences` set `enabled: true`, so a user who wanted the
   * notifications to stop kept receiving them. The device rows are deactivated too
   * so the server stops selecting them.
   */
  const disableNotifications = async () => {
    if (!user || notificationBusy || isNotificationRef.current) return;
    isNotificationRef.current = true;
    setNotificationMessage('');
    setNotificationBusy(true);
    try {
      const preferenceResult = await supabase
        .from('notification_preferences')
        .update({ enabled: false })
        .eq('user_id', user.id);
      if (preferenceResult.error) throw preferenceResult.error;

      const deviceResult = await supabase
        .from('notification_devices')
        .update({ is_active: false })
        .eq('user_id', user.id);
      if (deviceResult.error) throw deviceResult.error;

      setNotificationsEnabled(false);
      setNotificationMessage(t('account.notificationsDisabledMessage'));
    } catch (error) {
      setNotificationMessage(t('account.notificationsDisableFailedPrefix') + friendlyDbError(error, t));
    } finally {
      isNotificationRef.current = false;
      if (mountedRef.current) setNotificationBusy(false);
    }
  };

  if (isLoading) {
    return <Screen><PageHeader title={t('account.loading')} /></Screen>;
  }

  return (
    <Screen>
      <PageHeader eyebrow={t('account.eyebrow')} title={t('account.pageTitle')} subtitle={t('account.pageSubtitle')} />
      {user ? (
        <Card>
          <Text style={styles.avatar}>●</Text>
          <Text style={styles.title}>{t('account.activeTitle')}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <Text style={styles.label}>{t('account.displayNameLabel')}</Text>
          <TextInput
            accessibilityLabel={t('account.displayNameLabel')}
            value={hasCurrentProfile ? displayName : ''}
          editable={hasCurrentProfile && !saving}
            onChangeText={(value) => {
              setDisplayName(value);
              setSaveMessage(null);
            }}
            placeholder={t('account.displayNamePlaceholder')}
            placeholderTextColor={palette.muted}
            style={styles.input}
          />
          <PrimaryButton label={saving ? t('account.saving') : t('account.saveProfileButton')} onPress={saveProfile} />
          {hasCurrentProfile && saveMessage ? (
            <Text accessibilityLiveRegion="polite" style={saveMessage.type === 'success' ? styles.saveSuccess : styles.saveError}>
              {saveMessage.text}
            </Text>
          ) : null}
          <SecondaryButton label={t('account.signOutButton')} onPress={handleSignOut} />
        </Card>
      ) : (
        <Card style={styles.guestCard}>
          <Text style={styles.avatar}>○</Text>
          <Text style={styles.title}>{t('account.guestTitle')}</Text>
          <Text style={styles.body}>{t('account.guestBody')}</Text>
          <PrimaryButton label={t('account.guestAuthButton')} onPress={() => router.push('/auth')} />
        </Card>
      )}
      <SectionTitle>{t('account.regionTitle')}</SectionTitle>
      <Card>
        <Text style={styles.bodyLeft}>{t('account.regionDescription')}</Text>
        <Text style={styles.regionLabel}>{t('account.country')}</Text>
        <View style={styles.regionOptions}>
          {SUPPORTED_REGIONS.map((option) => {
            const isSelected = option.countryCode === countryCode;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                disabled={isRegionLoading}
                key={option.countryCode}
                onPress={() => void setCountryCode(option.countryCode)}
                style={[styles.regionOption, isSelected && styles.regionOptionSelected]}>
                <Text style={[styles.regionOptionTitle, isSelected && styles.regionOptionTitleSelected]}>{getCountryLabel(option.countryCode, languageCode)}</Text>
                <Text style={[styles.regionOptionMeta, isSelected && styles.regionOptionMetaSelected]}>{option.locale}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.regionLabel}>{t('account.language')}</Text>
        <View style={styles.regionOptions}>
          {COMPLETE_LANGUAGES.map((language) => {
            const isSelected = languageCode === language;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                disabled={isRegionLoading}
                key={language}
                onPress={() => void setLanguageCode(language)}
                style={[styles.regionOption, isSelected && styles.regionOptionSelected]}>
                <Text style={[styles.regionOptionTitle, isSelected && styles.regionOptionTitleSelected]}>{LANGUAGE_LABELS[language]}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.calendarDivider} />
        <Text style={styles.regionLabel}>{t('account.calendar')}</Text>
        <Text style={styles.bodyLeft}>{countryCode === 'MD' || !calendar ? t('account.calendarDescription') : calendarDisplayDescription(calendar.calendarCode, calendar.description, t)}</Text>
        {countryCode === 'MD' ? (
          <>
            {!calendarCode ? <Text style={styles.calendarRequired}>{t('account.calendarRequired')}</Text> : null}
            <View style={styles.calendarOptions}>
              {availableCalendars.map((option) => {
                const isSelected = option.calendarCode === calendarCode;
                return (
                  <Pressable
                    accessibilityLabel={`${t('account.chooseCalendarAccessibility')} ${calendarDisplayName(option.calendarCode, option.label, t)}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    disabled={isRegionLoading}
                    key={option.calendarCode}
                    onPress={() => void setCalendarCode(option.calendarCode)}
                    style={[styles.calendarOption, isSelected && styles.calendarOptionSelected]}>
                    <Text style={[styles.calendarOptionTitle, isSelected && styles.calendarOptionTitleSelected]}>{calendarDisplayName(option.calendarCode, option.label, t)}</Text>
                    <Text style={[styles.calendarOptionMeta, isSelected && styles.calendarOptionMetaSelected]}>{calendarDisplayName(option.calendarCode, option.jurisdictionLabel, t)}</Text>
                    <Text style={[styles.calendarOptionDescription, isSelected && styles.calendarOptionMetaSelected]}>{calendarDisplayDescription(option.calendarCode, option.description, t)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <Text style={styles.regionSummary}>{calendar ? calendarDisplayName(calendar.calendarCode, calendar.label, t) : ''}</Text>
        )}
      </Card>
      <SectionTitle>{t('account.notificationsSectionTitle')}</SectionTitle>
      <Card>
        <Text style={styles.bodyLeft}>{t('account.notificationsDescription')}</Text>
        <Text style={notificationsEnabled ? styles.notificationActive : styles.notificationInactive}>
          {notificationsEnabled ? t('account.notificationsStatusActive') : t('account.notificationsStatusInactive')}
        </Text>
        {user ? (
          notificationsEnabled ? (
            <SecondaryButton
              disabled={notificationBusy}
              label={notificationBusy ? t('account.notificationsConfiguring') : t('account.disableNotificationsButton')}
              onPress={() => void disableNotifications()}
            />
          ) : (
            <PrimaryButton disabled={notificationBusy} label={notificationBusy ? t('account.notificationsConfiguring') : t('account.enableNotificationsButton')} onPress={() => void enableNotifications()} />
          )
        ) : (
          <SecondaryButton label={t('account.loginForNotificationsButton')} onPress={() => router.push('/auth')} />
        )}
        {notificationMessage ? <Text style={styles.notificationMessage}>{notificationMessage}</Text> : null}
      </Card>
      <SectionTitle>{t('account.subscriptionSectionTitle')}</SectionTitle>
      <Card>
        <Text style={styles.plan}>{isPlanLoading ? t('account.planChecking') : planLabel}</Text>
        <Text style={styles.body}>{isPremium ? t('account.aiMessagesPerDay').replace('{count}', String(dailyAiLimit)) : t('account.freeMessagesPerDay')}</Text>
        {planError ? <Text style={styles.planError}>{planError}</Text> : null}
        <SecondaryButton label={isPremium ? t('account.viewSubscriptionButton') : t('account.viewPremiumButton')} onPress={() => router.push('/premium')} />
        <PrimaryButton label={t('account.openAiChatButton')} onPress={() => router.replace('/chat')} />
      </Card>
      <SectionTitle>{t('account.aboutSectionTitle')}</SectionTitle>
      <Card>
        <Pressable accessibilityRole="button" onPress={() => router.push('/privacy')}>
          <Text style={styles.rowLink}>{t('account.privacyPolicyLink')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/terms')}>
          <Text style={styles.rowLink}>{t('account.termsLink')}</Text>
        </Pressable>
        <Text style={styles.row}>{t('account.sourcesRow')}</Text>
        {supportMailto ? (
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(supportMailto)}>
            <Text style={styles.rowLink}>{t('account.helpRow')}</Text>
          </Pressable>
        ) : (
          // No support address configured yet. Say so explicitly rather than
          // rendering a row that looks actionable but does nothing — and rather
          // than inventing an address. The release gate fails until it is set.
          <Text style={styles.row}>{t('account.helpUnavailable')}</Text>
        )}
      </Card>
      {user ? (
        <>
          <SectionTitle>{t('account.dangerZoneTitle')}</SectionTitle>
          <Card style={styles.dangerCard}>
            <Text style={styles.dangerDescription}>
              {t('account.deleteAccountDescription')}
            </Text>
            {deleteBusy ? (
              <View style={styles.dangerLoadingRow}>
                <ActivityIndicator color={palette.danger} size="small" />
                <Text style={styles.dangerLoadingText}>{t('account.deleting')}</Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={deleteBusy}
                onPress={() => void handleDeleteAccount()}
                style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
              >
                <Text style={styles.dangerButtonText}>{t('account.deleteButton')}</Text>
              </Pressable>
            )}
            {deleteError ? (
              <Text accessibilityLiveRegion="polite" style={styles.dangerError}>{deleteError}</Text>
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  guestCard: { alignItems: 'center' },
  avatar: { color: palette.goldDark, fontSize: 48 },
  title: { color: palette.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  body: { color: palette.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  bodyLeft: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  email: { color: palette.muted, fontSize: 14, textAlign: 'center' },
  label: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  input: { minHeight: 50, borderColor: palette.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, color: palette.ink, backgroundColor: '#FFFFFF' },
  plan: { color: palette.goldDark, fontSize: 18, fontWeight: '800' },
  planError: { color: palette.danger, fontSize: 13, textAlign: 'center' },
  saveSuccess: { color: palette.success, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  saveError: { color: palette.danger, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  regionLabel: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  regionOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  regionOption: { borderColor: palette.line, borderRadius: 12, borderWidth: 1, flexGrow: 1, minWidth: 140, paddingHorizontal: 14, paddingVertical: 12 },
  regionOptionSelected: { backgroundColor: palette.blue, borderColor: palette.blue },
  regionOptionTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  regionOptionTitleSelected: { color: '#FFFFFF' },
  regionOptionMeta: { color: palette.muted, fontSize: 11, marginTop: 3 },
  regionOptionMetaSelected: { color: palette.sky },
  regionSummary: { color: palette.goldDark, fontSize: 13, fontWeight: '800' },
  calendarDivider: { backgroundColor: palette.line, height: 1, marginVertical: 4 },
  calendarRequired: { color: palette.danger, fontSize: 13, fontWeight: '700' },
  calendarOptions: { gap: 10 },
  calendarOption: { borderColor: palette.line, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  calendarOptionSelected: { backgroundColor: palette.blue, borderColor: palette.blue },
  calendarOptionTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  calendarOptionTitleSelected: { color: '#FFFFFF' },
  calendarOptionMeta: { color: palette.goldDark, fontSize: 12, fontWeight: '700', marginTop: 3 },
  calendarOptionMetaSelected: { color: palette.sky },
  calendarOptionDescription: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  row: { color: palette.ink, fontSize: 15, paddingVertical: 6 },
  rowLink: { color: palette.blue, fontSize: 15, paddingVertical: 6 },
  notificationActive: { color: palette.success, fontSize: 13, fontWeight: '700' },
  notificationInactive: { color: palette.muted, fontSize: 13, fontWeight: '700' },
  notificationMessage: { color: palette.blue, fontSize: 13, lineHeight: 19 },
  dangerCard: { borderColor: palette.danger },
  dangerDescription: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  dangerButton: { backgroundColor: palette.danger, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  dangerButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  dangerLoadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dangerLoadingText: { color: palette.danger, fontSize: 13, fontWeight: '700' },
  dangerError: { color: palette.danger, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
