import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Card, PageHeader, PrimaryButton, Screen } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import type { TranslationKey } from '@/i18n/config';
import {
  isProviderEnabled,
  loadAuthProviderAvailability,
  type AuthProviderAvailability,
} from '@/lib/auth-providers';
import {
  markPasswordRecoveryRequested,
  NATIVE_AUTH_REDIRECT_URL,
  NATIVE_PASSWORD_RECOVERY_REDIRECT_URL,
} from '@/lib/native-password-recovery';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLocalization } from '@/providers/localization-provider';

WebBrowser.maybeCompleteAuthSession();

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

/**
 * Utilizatorul a inchis foaia "Sign in with Apple" fara sa se autentifice.
 *
 * Nu e o eroare si nu are voie sa produca o alerta: exact ca la anularea fluxului
 * Google. Codul vine de la sistem prin `expo-apple-authentication`
 * (`ERR_REQUEST_CANCELED`), deci se verifica `code`, nu textul mesajului - un mesaj
 * localizat s-ar putea schimba, codul nu.
 */
function isAppleSignInCancelled(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === 'ERR_REQUEST_CANCELED';
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

/**
 * B-08: ceiling for the OAuth start request.
 *
 * `signInWithOAuth` had no timeout, so a stalled connection left `loading` true
 * forever: the provider buttons stayed disabled with no spinner explanation and no
 * retry. The message contains "network" so `friendlyAuthError` maps it to the
 * existing connection-error string instead of the generic one.
 */
const OAUTH_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Upper bound for the e-mail + password sign-in.
 *
 * WHY THIS EXISTS
 * ---------------
 * `signInWithPassword` was the only network call in this screen without a bound. If the
 * request never settled (captive portal, dropped connection, a stalled write) the button
 * kept spinning and no message was ever shown - the user saw a form that "did nothing".
 * The bound converts that into the ordinary alert on the existing error path.
 */
const SIGN_IN_TIMEOUT_MS = 30_000;

/**
 * B9 din audit: versiunea documentelor legale acceptate la creare de cont.
 *
 * Se salveaza in metadatele utilizatorului (`terms_accepted_at` + `terms_version`), ca
 * sa se poata dovedi CE s-a acceptat si CAND. Cand textul termenilor se schimba
 * semnificativ, valoarea se incrementeaza si acceptarea poate fi ceruta din nou.
 */
const TERMS_VERSION = '2026-10-08';

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function clearRecoveryRedirect() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function getAuthRedirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth`;
  }

  // B2: the native return address is the constant, not `Linking.createURL('auth')`.
  //
  // `createURL` resolves to `ortodoxia://auth` only in a production build; under Expo
  // Go or a development build it returns `exp://…`, which is not a scheme registered
  // in the manifest and therefore never a target Supabase can redirect to. Pinning the
  // constant removes that difference and gives the OAuth flow and the auth e-mails one
  // source of truth (see src/lib/native-password-recovery.ts).
  return NATIVE_AUTH_REDIRECT_URL;
}

function authErrorFromUrl(url: string) {
  const parsed = new URL(url);
  const searchParams = parsed.searchParams;
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  return searchParams.get('error_description')
    ?? hashParams.get('error_description')
    ?? searchParams.get('error')
    ?? hashParams.get('error');
}

async function completeNativeOAuthSession(url: string) {
  const parsed = new URL(url);
  const searchParams = parsed.searchParams;
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const code = searchParams.get('code') ?? hashParams.get('code');
  const accessToken = hashParams.get('access_token') ?? searchParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') ?? searchParams.get('refresh_token');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }

  const oauthError = authErrorFromUrl(url);
  if (oauthError) throw new Error(oauthError);
  throw new Error('OAuth session could not be completed.');
}

export default function AuthScreen() {
  const { isPasswordRecovery, recoveryLinkError, clearRecoveryLinkError, signOut, user } = useAuth();
  const { t } = useLocalization();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  // B9 din audit: pana acum contul se crea fara sa existe dovada ca utilizatorul a
  // vazut termenii. Bifa e ceruta doar la creare de cont, nu si la autentificare.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [loading, setLoading] = useState(false);
  // B1: `null` cât timp verificarea nu a răspuns → butoanele se afișează (fail-open).
  const [providerAvailability, setProviderAvailability] = useState<AuthProviderAvailability>(null);
  /*
    Sign in with Apple se arata doar daca SISTEMUL il are (`isAvailableAsync()`), nu
    dupa numele platformei: pe iOS e adevarat, oriunde altundeva modulul raspunde
    `false` singur. Pana la raspuns starea e `false` - un buton care nu poate functiona
    nu are ce cauta pe ecran; daca verificarea pica, la fel.
  */
  const [appleAvailable, setAppleAvailable] = useState(false);
  // Synchronous in-flight guard shared by submit() and sendResetEmail(). React state
  // cannot prevent a second dispatch that arrives before the re-render.
  const submitInFlightRef = useRef(false);
  const [resetMessage, setResetMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const recoveryRedirect = hasRecoveryRedirect();
  const activeMode = isPasswordRecovery || recoveryRedirect ? 'reset-password' : mode;
  const destination = returnTo === '/chat' ? '/chat' : returnTo === '/premium' ? '/premium' : '/account';

  // A recovery deep link that could not be consumed (expired, already used or
  // malformed) used to fail completely silently: the user was shown the ordinary
  // sign-in form with no explanation and no way to request a new link.
  //
  // Mesajul se citește direct din starea providerului, fără setState într-un effect (care ar
  // produce randări în cascadă). Rămâne vizibil până când omul cere un link nou sau revine la
  // autentificare — în ambele locuri se golește eroarea din provider.
  const recoveryMessage = recoveryLinkError
    ? {
        type: 'error' as const,
        text: recoveryLinkError === 'malformed_link'
          ? t('auth.errorResetInvalid')
          : t('auth.errorResetExpired'),
      }
    : null;
  const visibleResetMessage = resetMessage ?? recoveryMessage;

  useEffect(() => {
    if (!user || isPasswordRecovery || recoveryRedirect) return;

    // Când utilizatorul s-a autentificat din Chat, îl trimitem înapoi acolo.
    // Altfel, autentificarea deschisă din cont rămâne pe pagina Contul meu.
    router.replace(destination);
  }, [destination, isPasswordRecovery, recoveryRedirect, user]);

  // B1: un singur GET /auth/v1/settings pe rulare de aplicație (memorat în modul).
  // Rezultatul e doar informativ pentru randare: dacă verificarea pică, starea rămâne
  // `null`, iar `isProviderEnabled` întoarce `true` — un buton care funcționează nu are
  // voie să dispară din cauza unui hop de rețea.
  useEffect(() => {
    let active = true;
    void loadAuthProviderAvailability().then((availability) => {
      if (active) setProviderAvailability(availability);
    });
    return () => { active = false; };
  }, []);

  /*
    Apple: disponibilitatea se cere o singura data, la montare. `isAvailableAsync()`
    nu ajunge la retea (intreaba sistemul), dar poate arunca pe o platforma fara
    modulul nativ - atunci butonul ramane ascuns, nu crapa ecranul.
  */
  useEffect(() => {
    let active = true;
    void AppleAuthentication.isAvailableAsync()
      .then((available) => { if (active) setAppleAvailable(available); })
      .catch(() => { if (active) setAppleAvailable(false); });
    return () => { active = false; };
  }, []);

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
    // B9 din audit: contul se crea fara nicio dovada ca utilizatorul a citit termenii
    // si politica de confidentialitate. Bifa e obligatorie doar la creare de cont
    // (autentificarea unui cont existent nu poate fi conditionata de ea).
    if (activeMode === 'sign-up' && !termsAccepted) {
      showAuthAlert(t('auth.termsRequiredTitle'), t('auth.termsRequired'));
      return false;
    }
    return true;
  };

  const submit = async () => {
    // A synchronous guard, not just the `loading` state: React state cannot stop a
    // second tap that arrives in the same tick, which produced duplicate signUp and
    // resetPasswordForEmail calls.
    if (submitInFlightRef.current || !validate() || loading) return;
    submitInFlightRef.current = true;
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
        // Momentul acceptarii se trimite ca metadate de utilizator: e singura dovada
        // pe care o putem pastra fara o migratie noua, iar Supabase o retine in
        // `auth.users.raw_user_meta_data`. Versiunea documentelor e salvata o data cu
        // momentul, ca sa se stie CE s-a acceptat.
        const termsAcceptedAt = new Date().toISOString();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim(),
              terms_accepted_at: termsAcceptedAt,
              terms_version: TERMS_VERSION,
            },
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
        // Bounded on purpose, like the OAuth calls above. A request that never settles
        // used to leave the button spinning with no message at all; the timeout turns
        // that into the visible connection-error alert. The message contains "network"
        // so `friendlyAuthError` maps it to `auth.errorNetwork`.
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({ email: email.trim(), password }),
          SIGN_IN_TIMEOUT_MS,
          'Sign-in network request timed out.',
        );
        if (error) throw error;
      }

      router.replace(destination);
    } catch (error) {
      showAuthAlert(t('auth.signInFailedTitle'), friendlyAuthError(error, t));
    } finally {
      // The guard exists to stop a second tap arriving in the SAME tick (see the comment
      // at the top of submit), not to lock the button for the rest of the screen's life.
      // It used to be set here and released only by `sendResetEmail`, so after one failed
      // attempt - wrong password, no network, a refused secure write - every later tap on
      // "Autentificare" returned silently: no alert, no spinner, a form that does nothing.
      // A user who mistyped the password once could never retry without leaving the screen.
      submitInFlightRef.current = false;
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
      clearRecoveryLinkError();
      setMode('sign-in');
    } catch (error) {
      showAuthAlert(t('account.signOutErrorTitle'), friendlyAuthError(error, t));
    } finally {
      setLoading(false);
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    if (loading) return;
    setLoading(true);

    try {
      const redirectTo = getAuthRedirectUrl();

      if (Platform.OS === 'web') {
        const { error } = await withTimeout(
          supabase.auth.signInWithOAuth({ provider, options: { redirectTo } }),
          OAUTH_REQUEST_TIMEOUT_MS,
          'network timeout',
        );
        if (error) throw error;
        return;
      }

      const { data, error } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        }),
        OAUTH_REQUEST_TIMEOUT_MS,
        'network timeout',
      );
      if (error) throw error;
      if (!data.url) throw new Error('OAuth URL missing.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      // B-08: every non-success outcome used to `return` silently. Cancelling the
      // sheet, dismissing it or hitting a locked device left the user staring at the
      // sign-in form with no explanation at all, which reads as a broken button.
      if (result.type !== 'success') {
        showAuthAlert(t('auth.oauthCancelledTitle'), t('auth.oauthCancelledMessage'));
        return;
      }

      await completeNativeOAuthSession(result.url);
      router.replace(destination);
    } catch (error) {
      showAuthAlert(t('auth.signInFailedTitle'), friendlyAuthError(error, t));
    } finally {
      setLoading(false);
    }
  };

  /*
    Sign in with Apple, pe iOS, prin fluxul nativ de IdToken.

    DE CE ASA, SI NU PRIN `signInWithOAuth`
    ----------------------------------------
    Apple cere (ghid de review 4.8) ca o aplicatie care ofera autentificare sociala
    terta - aici Google - sa ofere si Sign in with Apple. Calea corecta pe iOS e cea
    nativa: foaia sistemului se deschide peste aplicatie, iar raspunsul e un
    `identityToken` pe care Supabase il verifica pe server
    (`signInWithIdToken`). Fluxul web cu redirect ar scoate omul in browser si ar avea
    nevoie de un Services ID configurat separat - aici client id-ul din Supabase este
    bundle id-ul aplicatiei, deci calea nativa.

    `nonce` nu se trimite: tokenul e legat de cererea facuta de aplicatie pe dispozitiv
    si e valabil cateva minute, iar Supabase verifica semnatura, emitentul si publicul.
  */
  const signInWithApple = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // `signInAsync` arunca deja daca lipseste tokenul, dar tipul il da `string | null`:
      // fara verificare, TypeScript nu stie ca nu poate fi null.
      if (!credential.identityToken) {
        showAuthAlert(t('auth.signInFailedTitle'), t('auth.errorGeneric'));
        return;
      }

      const { error } = await withTimeout(
        supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken }),
        OAUTH_REQUEST_TIMEOUT_MS,
        'network timeout',
      );
      if (error) throw error;

      router.replace(destination);
    } catch (error) {
      // Inchiderea foii de catre utilizator nu e o eroare: fara alerta (ca la Google).
      if (isAppleSignInCancelled(error)) return;
      showAuthAlert(t('auth.signInFailedTitle'), friendlyAuthError(error, t));
    } finally {
      setLoading(false);
    }
  };

  const sendResetEmail = async () => {
    // Same synchronous guard as submit(): two taps in one tick previously produced two
    // resetPasswordForEmail calls, which counts against Supabase's email rate limit.
    if (submitInFlightRef.current || loading) return;
    submitInFlightRef.current = true;
    setResetMessage(null);
    // Omul cere un link nou: vechea eroare de link nu mai are ce căuta pe ecran.
    clearRecoveryLinkError();
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
        // B8: the PKCE link that comes back carries a code, not the reason it was
        // issued. Record the intent so the returning link opens the reset form.
        await markPasswordRecoveryRequested();
        setResetMessage({ type: 'success', text: t('auth.sendEmailSuccess') });
        // K-01: '/reset-confirmation' is a generated typed route (see
        // .expo/types/router.d.ts), so the 'as never' cast is no longer needed
        // and its removal restores compile-time checking of the destination.
        router.replace('/reset-confirmation');
      }
    } catch (error) {
      const message = friendlyAuthError(error, t);
      setResetMessage({ type: 'error', text: t('auth.sendEmailErrorPrefix') + message });
      showAuthAlert(t('auth.sendEmailErrorTitle'), message);
    } finally {
      submitInFlightRef.current = false;
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
            <TextInput accessibilityLabel={t('auth.displayNameLabel')} autoCapitalize="words" value={displayName} onChangeText={setDisplayName} placeholder={t('auth.displayNamePlaceholder')} placeholderTextColor={palette.muted} style={styles.input} />
          </>
        ) : null}
        {activeMode !== 'reset-password' ? (
          <>
            <Text style={styles.label}>{t('auth.emailLabel')}</Text>
            <TextInput accessibilityLabel={t('auth.emailLabel')} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder={t('auth.emailPlaceholder')} placeholderTextColor={palette.muted} style={styles.input} />
            <Text style={styles.label}>{t('auth.passwordLabel')}</Text>
            <TextInput accessibilityLabel={t('auth.passwordLabel')} autoCapitalize="none" autoComplete="password" secureTextEntry value={password} onChangeText={setPassword} placeholder={t('auth.passwordPlaceholder')} placeholderTextColor={palette.muted} style={styles.input} />
          </>
        ) : (
          <>
            <Text style={styles.label}>{t('auth.newPasswordLabel')}</Text>
            <TextInput accessibilityLabel={t('auth.newPasswordLabel')} autoCapitalize="none" autoComplete="new-password" secureTextEntry value={resetPassword} onChangeText={setResetPassword} placeholder={t('auth.newPasswordPlaceholder')} placeholderTextColor={palette.muted} style={styles.input} />
            <Text style={styles.label}>{t('auth.confirmPasswordLabel')}</Text>
            <TextInput accessibilityLabel={t('auth.confirmPasswordLabel')} autoCapitalize="none" autoComplete="new-password" secureTextEntry value={confirmResetPassword} onChangeText={setConfirmResetPassword} placeholder={t('auth.confirmPasswordPlaceholder')} placeholderTextColor={palette.muted} style={styles.input} />
          </>
        )}
        <PrimaryButton disabled={loading} label={loading ? t('auth.processing') : activeMode === 'reset-password' ? t('auth.saveNewPassword') : activeMode === 'sign-in' ? t('auth.signInButton') : t('auth.signUpButton')} onPress={submit} />
        {activeMode === 'sign-up' ? (
          /*
            B9 din audit: crearea contului nu cerea nicio dovada de acceptare a
            termenilor. Randul e un singur Pressable (nu un checkbox nativ), cu
            accessibilityRole="checkbox" si accessibilityState.checked, ca sa fie
            anuntat corect de TalkBack. Textul complet e eticheta, deci atingerea
            oriunde in rand comuta bifa.
          */
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: termsAccepted, disabled: loading }}
            accessibilityLabel={t('auth.termsCheckbox')}
            disabled={loading}
            onPress={() => setTermsAccepted((current) => !current)}
            style={({ pressed }) => [styles.termsRow, pressed && styles.pressed]}>
            <View style={[styles.termsBox, termsAccepted && styles.termsBoxChecked]}>
              {termsAccepted ? <Text style={styles.termsCheck}>✓</Text> : null}
            </View>
            <Text style={styles.termsText}>{t('auth.termsCheckbox')}</Text>
          </Pressable>
        ) : null}
        {visibleResetMessage ? <Text accessibilityLiveRegion="polite" style={[styles.message, visibleResetMessage.type === 'success' ? styles.success : styles.error]}>{visibleResetMessage.text}</Text> : null}
        {activeMode === 'sign-in' ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading }} disabled={loading} accessibilityLabel={t('auth.forgotPassword')} onPress={sendResetEmail}><Text style={styles.link}>{t('auth.forgotPassword')}</Text></Pressable> : null}
        {activeMode === 'reset-password' ? (
          <Pressable accessibilityLabel={t('auth.backToSignIn')} accessibilityRole="button" onPress={backToSignIn}><Text style={styles.link}>{t('auth.backToSignIn')}</Text></Pressable>
        ) : (
          <View style={styles.switchRow}>
            <Text style={styles.note}>{activeMode === 'sign-in' ? t('auth.noAccount') : t('auth.hasAccount')}</Text>
            <Pressable
              accessibilityLabel={activeMode === 'sign-in' ? t('auth.signUpButton') : t('auth.signInButton')}
              accessibilityRole="button"
              onPress={() => setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in')}>
              <Text style={styles.link}>{activeMode === 'sign-in' ? t('auth.signUpButton') : t('auth.signInButton')}</Text>
            </Pressable>
          </View>
        )}
        {activeMode !== 'reset-password' ? (
          <View style={styles.socialSection}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('auth.orEmail')}</Text>
              <View style={styles.dividerLine} />
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={loading}
              onPress={() => signInWithOAuth('google')}
              style={({ pressed }) => [styles.socialButton, pressed && styles.pressed, loading && styles.disabledButton]}>
              <Text style={styles.socialIcon}>G</Text>
              <Text style={styles.socialButtonText}>{t('auth.continueWithGoogle')}</Text>
            </Pressable>
            {Platform.OS === 'ios' && appleAvailable ? (
              /*
                Butonul OFICIAL al sistemului (`ASAuthorizationAppleIDButton` prin
                `expo-apple-authentication`): arata, se localizeaza si se comporta exact
                cum cere Apple, deci nu iese din stilul impus (HIG). Nu se deseneaza
                manual, iar culorile/colturile se dau prin `buttonStyle`/`cornerRadius`
                - `backgroundColor` si `borderRadius` din `style` nu se folosesc.
                Latimea si inaltimea sunt obligatorii, altfel butonul nu apare.
              */
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                onPress={signInWithApple}
                style={styles.appleButton}
              />
            ) : null}
            {/* Butonul Apple scris manual (flux web OAuth) ramane doar pe non-iOS:
                acolo Apple nu impune nimic, iar butonul oficial nu exista. Apare doar
                daca providerul e activat in Supabase; pe iOS nu se mai randeaza deloc,
                ca sa nu existe doua butoane Apple pe acelasi ecran.
                Azi GET /auth/v1/settings raspunde "apple": false, deci butonul dispare;
                in ziua in care providerul e pornit, reapare singur. Fara verificare
                (stare null) butonul ramane vizibil - fail-open. */}
            {Platform.OS !== 'ios' && isProviderEnabled(providerAvailability, 'apple') ? (
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                onPress={() => signInWithOAuth('apple')}
                style={({ pressed }) => [styles.socialButton, pressed && styles.pressed, loading && styles.disabledButton]}>
                <Text style={styles.socialIcon}></Text>
                <Text style={styles.socialButtonText}>{t('auth.continueWithApple')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  termsBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  termsBoxChecked: { borderColor: palette.goldDark, backgroundColor: '#FFFFFF' },
  termsCheck: { color: palette.goldDark, fontSize: 14, fontWeight: '900', lineHeight: 18 },
  termsText: { flex: 1, color: palette.muted, fontSize: 13, lineHeight: 19 },
  socialSection: { gap: 10, marginBottom: 4 },
  // Butonul Apple nativ are nevoie de latime si inaltime explicite (altfel nu se
  // randeaza deloc); inaltimea o aliniaza cu butonul Google de deasupra.
  appleButton: { width: '100%', height: 50 },
  socialButton: { minHeight: 50, borderColor: palette.line, borderWidth: 1, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 14 },
  pressed: { opacity: 0.82 },
  socialIcon: { color: palette.ink, fontSize: 18, fontWeight: '900', width: 22, textAlign: 'center' },
  socialButtonText: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  disabledButton: { opacity: 0.55 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: palette.line },
  dividerText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
});
