import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Card, PageHeader, PrimaryButton, Screen } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import type { TranslationKey } from '@/i18n/config';
import { NATIVE_PASSWORD_RECOVERY_REDIRECT_URL } from '@/lib/native-password-recovery';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLocalization } from '@/providers/localization-provider';

/** Mapăm erorile Supabase la mesaje prietenoase în limba română. */
function friendlyAuthError(error: unknown, t: (key: TranslationKey) => string): string {
  if (!(error instanceof Error)) return t('auth.errorGeneric');
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login') || msg.includes('email or password') || msg.includes('invalid credentials')) {
    return t('auth.errorInvalidCredentials');
  }
  if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already')) {
    return t('auth.errorAlreadyRegistered');
  }
  if (msg.includes('not confirmed') || msg.includes('email not confirmed')) {
    return t('auth.errorNotConfirmed');
  }
  if (msg.includes('password')) {
    return t('auth.errorPasswordRequirements');
  }
  if (msg.includes('expired')) {
    return t('auth.errorResetExpired');
  }
  if (msg.includes('invalid') || msg.includes('token')) {
    return t('auth.errorResetInvalid');
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return t('auth.errorNetwork');
  }
  return t('auth.errorGeneric');
}

function hasRecoveryRedirect() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return searchParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
}

function showAuthAlert(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}

${message}`);
    return;
  }

  Alert.alert(title, message);
}

function clearRecoveryRedirect() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

export default function AuthScreen() {
  const { isPasswordRecovery, signOut, user } = useAuth();
  const { t } = useLocalization();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [loading, setLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const recoveryRedirect = hasRecoveryRedirect();
  const activeMode = isPasswordRecovery || recoveryRedirect ? 'reset-password' : mode;
  const destination = returnTo === '/chat' ? '/chat' : returnTo === '/premium' ? '/premium' : '/account';

  useEffect(() => {
    if (!user || isPasswordRecovery || recoveryRedirect) return;

    // Când utilizatorul s-a autentificat din Chat, îl trimitem înapoi acolo.
    // Altfel, autentificarea deschisă din cont rămâne pe pagina Contul meu.
    router.replace(destination);
  }, [destination, isPasswordRecovery, recoveryRedirect, user]);

  const validate = () => {
    if (activeMode === 'reset-password') {
      if (resetPassword.length < 6) {
        showAuthAlert(t('auth.passwordTooShortTitle'), t('auth.passwordTooShortMessage'));
        return false;
      }
      if (resetPassword !== confirmResetPassword) {
        showAuthAlert(t('auth.passwordMismatchTitle'), t('auth.passwordMismatchMessage'));
        return false;
      }
      return true;
    }

    if (!email.trim() || !email.includes('@')) {
      showAuthAlert(t('auth.emailInvalidTitle'), t('auth.emailInvalidMessage'));
      return false;
    }
    if (password.length < 6) {
      showAuthAlert(t('auth.passwordTooShortTitle'), t('auth.passwordTooShortMessage'));
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!validate() || loading) return;
    setLoading(true);

    try {
      if (activeMode === 'reset-password') {
        const { error } = await supabase.auth.updateUser({ password: resetPassword });
        if (error) throw error;

        clearRecoveryRedirect();
        await signOut();
        setPassword('');
        setResetPassword('');
        setConfirmResetPassword('');
        setMode('sign-in');
        showAuthAlert(t('auth.passwordChangedTitle'), t('auth.passwordChangedMessage'));
        return;
      }

      if (activeMode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: Platform.OS === 'web' && typeof window !== 'undefined'
              ? window.location.origin + '/auth'
              : NATIVE_PASSWORD_RECOVERY_REDIRECT_URL,
          },
        });
        if (error) throw error;

        if (!data.session) {
          showAuthAlert(t('auth.checkEmailTitle'), t('auth.checkEmailMessage'));
          setMode('sign-in');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }

      router.replace(destination);
    } catch (error) {
      showAuthAlert(t('auth.signInFailedTitle'), friendlyAuthError(error, t));
    } finally {
      setLoading(false);
    }
  };

  const backToSignIn = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await signOut();
      clearRecoveryRedirect();
      setPassword('');
      setResetPassword('');
      setConfirmResetPassword('');
      setResetMessage(null);
      setMode('sign-in');
    } catch (error) {
      showAuthAlert(t('account.signOutErrorTitle'), friendlyAuthError(error, t));
    } finally {
      setLoading(false);
    }
  };

  const sendResetEmail = async () => {
    if (loading) return; // FIX: Prevent duplicate submit
    setResetMessage(null);
    if (!email.trim() || !email.includes('@')) {
      setResetMessage({ type: 'error', text: t('auth.emailRequiredMessage') });
      showAuthAlert(t('auth.emailRequiredTitle'), t('auth.emailRequiredAlertMessage'));
      return;
    }

    setLoading(true);
    try {
      const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/auth`
        : NATIVE_PASSWORD_RECOVERY_REDIRECT_URL;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), redirectTo ? { redirectTo } : undefined);
      if (error) {
        setResetMessage({ type: 'error', text: t('auth.sendEmailErrorPrefix') + friendlyAuthError(error, t) });
        showAuthAlert(t('auth.sendEmailErrorTitle'), friendlyAuthError(error, t));
      } else {
        setResetMessage({ type: 'success', text: t('auth.sendEmailSuccess') });
        router.replace('/reset-confirmation' as never);
      }
    } catch (error) {
      const message = friendlyAuthError(error, t);
      setResetMessage({ type: 'error', text: t('auth.sendEmailErrorPrefix') + message });
      showAuthAlert(t('auth.sendEmailErrorTitle'), message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        title={activeMode === 'reset-password' ? t('auth.titleReset') : activeMode === 'sign-in' ? t('auth.titleSignIn') : t('auth.titleSignUp')}
        subtitle={t('auth.subtitle')}
      />
      <Card>
        {activeMode === 'sign-up' ? (
          <>
            <Text style={styles.label}>{t('auth.displayNameLabel')}</Text>
            <TextInput autoCapitalize="words" value={displayName} onChangeText={setDisplayName} placeholder={t('auth.displayNamePlaceholder')} placeholderTextColor={palette.muted} style={styles.input} />
          </>
        ) : null}
        {activeMode !== 'reset-password' ? (
          <>
            <Text style={styles.label}>{t('auth.emailLabel')}</Text>
            <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder={t('auth.emailPlaceholder')} placeholderTextColor={palette.muted} style={styles.input} />
            <Text style={styles.label}>{t('auth.passwordLabel')}</Text>
            <TextInput autoCapitalize="none" autoComplete="password" secureTextEntry value={password} onChangeText={setPassword} placeholder={t('auth.passwordPlaceholder')} placeholderTextColor={palette.muted} style={styles.input} />
          </>
        ) : (
          <>
            <Text style={styles.label}>{t('auth.newPasswordLabel')}</Text>
            <TextInput autoCapitalize="none" autoComplete="new-password" secureTextEntry value={resetPassword} onChangeText={setResetPassword} placeholder={t('auth.newPasswordPlaceholder')} placeholderTextColor={palette.muted} style={styles.input} />
            <Text style={styles.label}>{t('auth.confirmPasswordLabel')}</Text>
            <TextInput autoCapitalize="none" autoComplete="new-password" secureTextEntry value={confirmResetPassword} onChangeText={setConfirmResetPassword} placeholder={t('auth.confirmPasswordPlaceholder')} placeholderTextColor={palette.muted} style={styles.input} />
          </>
        )}
        <PrimaryButton label={loading ? t('auth.processing') : activeMode === 'reset-password' ? t('auth.saveNewPassword') : activeMode === 'sign-in' ? t('auth.signInButton') : t('auth.signUpButton')} onPress={submit} />
        {resetMessage ? <Text accessibilityLiveRegion="polite" style={[styles.message, resetMessage.type === 'success' ? styles.success : styles.error]}>{resetMessage.text}</Text> : null}
        {activeMode === 'sign-in' ? <Pressable accessibilityRole="button" accessibilityLabel={t('auth.forgotPassword')} onPress={sendResetEmail}><Text style={styles.link}>{t('auth.forgotPassword')}</Text></Pressable> : null}
        {activeMode === 'reset-password' ? (
          <Pressable onPress={backToSignIn}><Text style={styles.link}>{t('auth.backToSignIn')}</Text></Pressable>
        ) : (
          <View style={styles.switchRow}>
            <Text style={styles.note}>{activeMode === 'sign-in' ? t('auth.noAccount') : t('auth.hasAccount')}</Text>
            <Pressable onPress={() => setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in')}>
              <Text style={styles.link}>{activeMode === 'sign-in' ? t('auth.signUpButton') : t('auth.signInButton')}</Text>
            </Pressable>
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  input: { minHeight: 50, borderColor: palette.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, color: palette.ink, backgroundColor: '#FFFFFF' },
  note: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  link: { color: palette.goldDark, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  success: { color: palette.success },
  error: { color: palette.danger },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
});
