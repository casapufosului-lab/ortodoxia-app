import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen, SecondaryButton, SectionTitle } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { useSubscription } from '@/hooks/use-subscription';
import { COMPLETE_LANGUAGES, SUPPORTED_REGIONS } from '@/i18n/config';
import type { CompleteLanguageCode, TranslationKey } from '@/i18n/config';
import { AccountDeletionError, requestAccountDeletion } from '@/lib/account-deletion';
import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLocalization } from '@/providers/localization-provider';

/** Mapăm erorile Supabase la mesaje prietenoase în limba română. */
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

  useEffect(() => {
    if (!user) return;
    let active = true;

    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) Alert.alert(t('account.profileUnavailableTitle'), friendlyDbError(error, t));
        else setDisplayName(data?.display_name ?? '');
      });

    return () => { active = false; };
  }, [user, t]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          Alert.alert(t('account.notificationsUnavailableTitle'), friendlyDbError(error, t));
        } else {
          setNotificationsEnabled(Boolean(data?.enabled));
        }
      });
    return () => { active = false; };
  }, [user, t]);

  const saveProfile = async () => {
    if (!user || saving || isSavingRef.current) return;
    isSavingRef.current = true;
    setSaveMessage(null);
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', user.id);
      if (error) {
        setSaveMessage({ type: 'error', text: t('account.profileSaveFailedMessage') });
        Alert.alert(t('account.profileSaveFailedTitle'), friendlyDbError(error, t));
      } else {
        setSaveMessage({ type: 'success', text: t('account.profileSavedMessage') });
        Alert.alert(t('account.profileSavedTitle'));
      }
    } catch {
      setSaveMessage({ type: 'error', text: t('account.unexpectedError') });
      Alert.alert(t('account.errorTitle'), t('account.unexpectedError'));
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (isSignOutRef.current) return;
    isSignOutRef.current = true;
    try {
      await signOut();
    } catch (error) {
      Alert.alert(t('account.signOutErrorTitle'), friendlyDbError(error, t));
    } finally {
      isSignOutRef.current = false;
    }
  };

  const handleDeleteAccount = () => {
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
      // Account deleted — sign out locally and navigate away.
      await signOut();
      router.replace('/');
    } catch (error) {
      let message: string;
      if (error instanceof AccountDeletionError) {
        const codeToKey: Record<string, TranslationKey> = {
          AUTH_REQUIRED: 'account.deleteAuthRequired',
          SERVICE_UNAVAILABLE: 'account.deleteServiceUnavailable',
          DELETE_FAILED: 'account.deleteFailedFallback',
        };
        message = t(codeToKey[error.code] ?? 'account.deleteFailedFallback');
      } else {
        message = error instanceof Error ? error.message : t('account.deleteFailedFallback');
      }
      setDeleteError(message);
      Alert.alert(t('account.errorTitle'), message);
    } finally {
      // Only reset busy state if we didn't sign out (signOut triggers re-render).
      isDeleteRef.current = false;
      setDeleteBusy(false);
    }
  };

  const enableNotifications = async () => {
    if (!user || notificationBusy || isNotificationRef.current) return;
    isNotificationRef.current = true;
    setNotificationMessage('');
    setNotificationBusy(true);
    try {
      const registration = await registerForPushNotificationsAsync(t('account.notificationChannelName'));
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || region.timeZone;
      const preferenceResult = await supabase.from('notification_preferences').upsert({
        user_id: user.id,
        enabled: true,
        daily_time: '10:00',
        timezone,
        country_code: countryCode,
        language_code: region.languageCode,
        calendar_code: calendarCode,
      });
      if (preferenceResult.error) throw preferenceResult.error;
      const deviceResult = await supabase.rpc('claim_notification_device', {
        p_expo_push_token: registration.token,
        p_platform: registration.platform,
        p_timezone: timezone,
      });
      if (deviceResult.error) throw deviceResult.error;
      setNotificationsEnabled(true);
      setNotificationMessage(t('account.notificationsActiveMessage'));
    } catch (error) {
      setNotificationMessage(t('account.notificationsActivateFailedPrefix') + friendlyDbError(error, t));
    } finally {
      isNotificationRef.current = false;
      setNotificationBusy(false);
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
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              setSaveMessage(null);
            }}
            placeholder={t('account.displayNamePlaceholder')}
            placeholderTextColor={palette.muted}
            style={styles.input}
          />
          <PrimaryButton label={saving ? t('account.saving') : t('account.saveProfileButton')} onPress={saveProfile} />
          {saveMessage ? (
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
                <Text style={[styles.regionOptionTitle, isSelected && styles.regionOptionTitleSelected]}>{option.countryLabel}</Text>
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
        <Text style={styles.bodyLeft}>{countryCode === 'MD' ? t('account.calendarDescription') : calendar?.description}</Text>
        {countryCode === 'MD' ? (
          <>
            {!calendarCode ? <Text style={styles.calendarRequired}>{t('account.calendarRequired')}</Text> : null}
            <View style={styles.calendarOptions}>
              {availableCalendars.map((option) => {
                const isSelected = option.calendarCode === calendarCode;
                return (
                  <Pressable
                    accessibilityLabel={`${t('account.chooseCalendarAccessibility')} ${option.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    disabled={isRegionLoading}
                    key={option.calendarCode}
                    onPress={() => void setCalendarCode(option.calendarCode)}
                    style={[styles.calendarOption, isSelected && styles.calendarOptionSelected]}>
                    <Text style={[styles.calendarOptionTitle, isSelected && styles.calendarOptionTitleSelected]}>{option.label}</Text>
                    <Text style={[styles.calendarOptionMeta, isSelected && styles.calendarOptionMetaSelected]}>{option.jurisdictionLabel}</Text>
                    <Text style={[styles.calendarOptionDescription, isSelected && styles.calendarOptionMetaSelected]}>{option.description}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <Text style={styles.regionSummary}>{calendar?.label}</Text>
        )}
      </Card>
      <SectionTitle>{t('account.notificationsSectionTitle')}</SectionTitle>
      <Card>
        <Text style={styles.bodyLeft}>{t('account.notificationsDescription')}</Text>
        <Text style={notificationsEnabled ? styles.notificationActive : styles.notificationInactive}>
          {notificationsEnabled ? t('account.notificationsStatusActive') : t('account.notificationsStatusInactive')}
        </Text>
        {user ? (
          <PrimaryButton label={notificationBusy ? t('account.notificationsConfiguring') : t('account.enableNotificationsButton')} onPress={() => void enableNotifications()} />
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
        <Text style={styles.row}>{t('account.helpRow')}</Text>
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
  regionOptionMetaSelected: { color: '#D7E0EA' },
  regionSummary: { color: palette.goldDark, fontSize: 13, fontWeight: '800' },
  calendarDivider: { backgroundColor: palette.line, height: 1, marginVertical: 4 },
  calendarRequired: { color: palette.danger, fontSize: 13, fontWeight: '700' },
  calendarOptions: { gap: 10 },
  calendarOption: { borderColor: palette.line, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  calendarOptionSelected: { backgroundColor: palette.blue, borderColor: palette.blue },
  calendarOptionTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  calendarOptionTitleSelected: { color: '#FFFFFF' },
  calendarOptionMeta: { color: palette.goldDark, fontSize: 12, fontWeight: '700', marginTop: 3 },
  calendarOptionMetaSelected: { color: '#D7E0EA' },
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
