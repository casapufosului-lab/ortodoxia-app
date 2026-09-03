import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen, SecondaryButton, SectionTitle } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { useSubscription } from '@/hooks/use-subscription';
import { SUPPORTED_REGIONS } from '@/i18n/config';
import { requestAccountDeletion } from '@/lib/account-deletion';
import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLocalization } from '@/providers/localization-provider';

/** Mapăm erorile Supabase la mesaje prietenoase în limba română. */
function friendlyDbError(error: unknown): string {
  if (!(error instanceof Error)) return 'Încearcă din nou.';
  const msg = error.message.toLowerCase();
  if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('already exists')) {
    return 'Deja există o valoare pentru acest câmp.';
  }
  if (msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('permission denied')) {
    return 'Sesiunea ta a expirat. Autentifică-te din nou.';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('connection')) {
    return 'Verifică conexiunea la internet și încearcă din nou.';
  }
  return 'A apărut o eroare. Încearcă din nou.';
}

export default function AccountScreen() {
  const { isLoading, user, signOut } = useAuth();
  const { dailyAiLimit, error: planError, isLoading: isPlanLoading, isPremium, planLabel } = useSubscription();
  const {
    availableCalendars,
    calendar,
    calendarCode,
    countryCode,
    isLoading: isRegionLoading,
    region,
    setCalendarCode,
    setCountryCode,
    t,
  } = useLocalization();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const isSavingRef = useRef(false);
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
        if (error) Alert.alert('Profil indisponibil', friendlyDbError(error));
        else setDisplayName(data?.display_name ?? '');
      });

    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setNotificationsEnabled(Boolean(data?.enabled)));
  }, [user]);

  const saveProfile = async () => {
    if (!user || saving || isSavingRef.current) return;
    isSavingRef.current = true;
    setSaveMessage(null);
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', user.id);
      if (error) {
        setSaveMessage({ type: 'error', text: 'Profilul nu a fost salvat. Încearcă din nou.' });
        Alert.alert('Profilul nu a fost salvat', friendlyDbError(error));
      } else {
        setSaveMessage({ type: 'success', text: 'Profil salvat.' });
        Alert.alert('Profil salvat');
      }
    } catch {
      setSaveMessage({ type: 'error', text: 'A apărut o eroare neașteptată.' });
      Alert.alert('Eroare', 'A apărut o eroare neașteptată.');
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      Alert.alert('Deconectarea nu a reușit', friendlyDbError(error));
    }
  };

  const handleDeleteAccount = () => {
    // First confirmation — explain what will happen.
    Alert.alert(
      'Șterge contul?',
      'Această acțiune este permanentă și nu poate fi anulată.\n\n• Toate datele contului vor fi șterse\n• Favoritele, conversațiile AI și istoricul vor fi eliminate\n• Contul nu mai poate fi recuperat\n\nAnularea abonamentului se face separat din App Store / Google Play.',
      [
        { text: 'Anulează', style: 'cancel' },
        {
          text: 'Continuă',
          style: 'destructive',
          // Second confirmation — explicit final step.
          onPress: () => {
            Alert.alert(
              'Ești sigur?',
              'Confirmă pentru a șterge definitiv contul și toate datele asociate. Această acțiune nu poate fi anulată.',
              [
                { text: 'Anulează', style: 'cancel' },
                {
                  text: 'Șterge contul',
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
    if (deleteBusy) return; // prevent double-submit
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await requestAccountDeletion();
      // Account deleted — sign out locally and navigate away.
      await signOut();
      router.replace('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Contul nu a putut fi șters. Încearcă din nou.';
      setDeleteError(message);
      Alert.alert('Eroare', message);
    } finally {
      // Only reset busy state if we didn't sign out (signOut triggers re-render).
      setDeleteBusy(false);
    }
  };

  const enableNotifications = async () => {
    if (!user || notificationBusy) return;
    setNotificationMessage('');
    setNotificationBusy(true);
    try {
      const registration = await registerForPushNotificationsAsync();
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
      const deviceResult = await supabase.from('notification_devices').upsert({
        user_id: user.id,
        expo_push_token: registration.token,
        platform: registration.platform,
        timezone,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'expo_push_token' });
      if (deviceResult.error) throw deviceResult.error;
      setNotificationsEnabled(true);
      setNotificationMessage('Notificările zilnice sunt active pentru ora 10:00.');
    } catch (error) {
      setNotificationMessage('Notificările nu au putut fi activate. ' + friendlyDbError(error));
    } finally {
      setNotificationBusy(false);
    }
  };

  if (isLoading) {
    return <Screen><PageHeader title="Se încarcă…" /></Screen>;
  }

  return (
    <Screen>
      <PageHeader eyebrow="Profil" title="Contul meu" subtitle="Salvează favoritele, conversațiile și accesul Premium." />
      {user ? (
        <Card>
          <Text style={styles.avatar}>●</Text>
          <Text style={styles.title}>Cont activ</Text>
          <Text style={styles.email}>{user.email}</Text>
          <Text style={styles.label}>Nume afișat</Text>
          <TextInput
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              setSaveMessage(null);
            }}
            placeholder="Numele tău"
            placeholderTextColor={palette.muted}
            style={styles.input}
          />
          <PrimaryButton label={saving ? 'Se salvează…' : 'Salvează profilul'} onPress={saveProfile} />
          {saveMessage ? (
            <Text accessibilityLiveRegion="polite" style={saveMessage.type === 'success' ? styles.saveSuccess : styles.saveError}>
              {saveMessage.text}
            </Text>
          ) : null}
          <SecondaryButton label="Deconectare" onPress={handleSignOut} />
        </Card>
      ) : (
        <Card style={styles.guestCard}>
          <Text style={styles.avatar}>○</Text>
          <Text style={styles.title}>Folosești aplicația fără cont</Text>
          <Text style={styles.body}>Creează un cont pentru a sincroniza conținutul pe dispozitivele tale.</Text>
          <PrimaryButton label="Autentificare sau cont nou" onPress={() => router.push('/auth')} />
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
        <Text style={styles.regionSummary}>{t('account.language')}: {region.languageLabel}</Text>
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
                    accessibilityLabel={`Alege ${option.label}`}
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
      <SectionTitle>Notificări zilnice</SectionTitle>
      <Card>
        <Text style={styles.bodyLeft}>Primești la ora 10:00 versetul, mesajul zilei și sărbătoarea din calendarul ales.</Text>
        <Text style={notificationsEnabled ? styles.notificationActive : styles.notificationInactive}>
          {notificationsEnabled ? 'Notificările sunt active.' : 'Notificările sunt oprite.'}
        </Text>
        {user ? (
          <PrimaryButton label={notificationBusy ? 'Se configurează…' : 'Activează notificările'} onPress={() => void enableNotifications()} />
        ) : (
          <SecondaryButton label="Conectează-te pentru notificări" onPress={() => router.push('/auth')} />
        )}
        {notificationMessage ? <Text style={styles.notificationMessage}>{notificationMessage}</Text> : null}
      </Card>
      <SectionTitle>Abonament</SectionTitle>
      <Card>
        <Text style={styles.plan}>{isPlanLoading ? 'Se verifică planul…' : planLabel}</Text>
        <Text style={styles.body}>{isPremium ? `Ai ${dailyAiLimit} de mesaje AI pe zi.` : 'Ai 5 mesaje AI pe zi. Conținutul de bază rămâne gratuit.'}</Text>
        {planError ? <Text style={styles.planError}>{planError}</Text> : null}
        <SecondaryButton label={isPremium ? 'Vezi abonamentul' : 'Vezi Premium'} onPress={() => router.push('/premium')} />
        <PrimaryButton label="Deschide Chatul AI" onPress={() => router.replace('/chat')} />
      </Card>
      <SectionTitle>Despre aplicație</SectionTitle>
      <Card>
        <Pressable accessibilityRole="button" onPress={() => router.push('/privacy')}>
          <Text style={styles.rowLink}>Politica de confidențialitate</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/terms')}>
          <Text style={styles.rowLink}>Termeni și condiții</Text>
        </Pressable>
        <Text style={styles.row}>Surse și responsabilitate editorială</Text>
        <Text style={styles.row}>Ajutor și contact</Text>
      </Card>
      {user ? (
        <>
          <SectionTitle>Zona periculoasă</SectionTitle>
          <Card style={styles.dangerCard}>
            <Text style={styles.dangerDescription}>
              Ștergerea contului elimină permanent profilul, favoritele, conversațiile AI și datele asociate. Această acțiune nu poate fi anulată.
            </Text>
            {deleteBusy ? (
              <View style={styles.dangerLoadingRow}>
                <ActivityIndicator color={palette.danger} size="small" />
                <Text style={styles.dangerLoadingText}>Se șterge contul…</Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={deleteBusy}
                onPress={() => void handleDeleteAccount()}
                style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
              >
                <Text style={styles.dangerButtonText}>Șterge contul</Text>
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
