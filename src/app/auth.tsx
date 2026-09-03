import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Card, PageHeader, PrimaryButton, Screen } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/** Mapăm erorile Supabase la mesaje prietenoase în limba română. */
function friendlyAuthError(error: unknown): string {
  if (!(error instanceof Error)) return 'A apărut o eroare. Încearcă din nou.';
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login') || msg.includes('email or password') || msg.includes('invalid credentials')) {
    return 'Email sau parolă incorectă.';
  }
  if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already')) {
    return 'Există deja un cont cu acest email.';
  }
  if (msg.includes('not confirmed') || msg.includes('email not confirmed')) {
    return 'Emailul nu a fost confirmat. Verifică mesajul primit pe email.';
  }
  if (msg.includes('password')) {
    return 'Parola nu îndeplinește cerințele minime.';
  }
  if (msg.includes('expired')) {
    return 'Link-ul de resetare a expirat. Te rugăm să ceri unul nou.';
  }
  if (msg.includes('invalid') || msg.includes('token')) {
    return 'Link-ul de resetare este invalid. Te rugăm să ceri unul nou.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Eroare de conexiune. Verifică internetul și încearcă din nou.';
  }
  return 'A apărut o eroare. Încearcă din nou.';
}

function hasRecoveryRedirect() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return searchParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
}

function clearRecoveryRedirect() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

export default function AuthScreen() {
  const { isPasswordRecovery, signOut, user } = useAuth();
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
        Alert.alert('Parolă prea scurtă', 'Parola trebuie să aibă cel puțin 6 caractere.');
        return false;
      }
      if (resetPassword !== confirmResetPassword) {
        Alert.alert('Parole diferite', 'Cele două parole nu sunt identice.');
        return false;
      }
      return true;
    }

    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Email invalid', 'Introdu o adresă de email validă.');
      return false;
    }
    if (password.length < 6) {
      Alert.alert('Parolă prea scurtă', 'Parola trebuie să aibă cel puțin 6 caractere.');
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
        Alert.alert('Parolă schimbată', 'Parola nouă a fost salvată. Te poți autentifica acum.');
        return;
      }

      if (activeMode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (error) throw error;

        if (!data.session) {
          Alert.alert('Verifică emailul', 'Ți-am trimis un mesaj pentru confirmarea contului. După confirmare, revino și autentifică-te.');
          setMode('sign-in');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }

      router.replace(destination);
    } catch (error) {
      Alert.alert('Autentificarea nu a reușit', friendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const sendResetEmail = async () => {
    if (loading) return; // FIX: Prevent duplicate submit
    setResetMessage(null);
    if (!email.trim() || !email.includes('@')) {
      setResetMessage({ type: 'error', text: 'Introdu mai întâi o adresă de email validă.' });
      Alert.alert('Email necesar', 'Introdu mai întâi adresa ta de email.');
      return;
    }

    setLoading(true);
    try {
      const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/auth`
        : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), redirectTo ? { redirectTo } : undefined);
      if (error) {
        setResetMessage({ type: 'error', text: 'Nu am putut trimite mesajul: ' + friendlyAuthError(error) });
        Alert.alert('Nu am putut trimite mesajul', friendlyAuthError(error));
      } else {
        setResetMessage({ type: 'success', text: 'Mesaj trimis. Verifică emailul pentru instrucțiunile de resetare.' });
        router.replace('/reset-confirmation' as never);
      }
    } catch (error) {
      const message = friendlyAuthError(error);
      setResetMessage({ type: 'error', text: `Nu am putut trimite mesajul: ${message}` });
      Alert.alert('Nu am putut trimite mesajul', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        title={activeMode === 'reset-password' ? 'Alege o parolă nouă' : activeMode === 'sign-in' ? 'Bine ai revenit' : 'Creează contul'}
        subtitle="Contul păstrează favoritele și conversațiile tale."
      />
      <Card>
        {activeMode === 'sign-up' ? (
          <>
            <Text style={styles.label}>Nume afișat</Text>
            <TextInput autoCapitalize="words" value={displayName} onChangeText={setDisplayName} placeholder="Numele tău" placeholderTextColor={palette.muted} style={styles.input} />
          </>
        ) : null}
        {activeMode !== 'reset-password' ? (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="nume@email.ro" placeholderTextColor={palette.muted} style={styles.input} />
            <Text style={styles.label}>Parolă</Text>
            <TextInput autoCapitalize="none" autoComplete="password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Parola ta" placeholderTextColor={palette.muted} style={styles.input} />
          </>
        ) : (
          <>
            <Text style={styles.label}>Parolă nouă</Text>
            <TextInput autoCapitalize="none" autoComplete="new-password" secureTextEntry value={resetPassword} onChangeText={setResetPassword} placeholder="Parola nouă" placeholderTextColor={palette.muted} style={styles.input} />
            <Text style={styles.label}>Confirmă parola nouă</Text>
            <TextInput autoCapitalize="none" autoComplete="new-password" secureTextEntry value={confirmResetPassword} onChangeText={setConfirmResetPassword} placeholder="Repetă parola nouă" placeholderTextColor={palette.muted} style={styles.input} />
          </>
        )}
        <PrimaryButton label={loading ? 'Se procesează…' : activeMode === 'reset-password' ? 'Salvează parola nouă' : activeMode === 'sign-in' ? 'Autentificare' : 'Creează cont'} onPress={submit} />
        {resetMessage ? <Text accessibilityLiveRegion="polite" style={[styles.message, resetMessage.type === 'success' ? styles.success : styles.error]}>{resetMessage.text}</Text> : null}
        {activeMode === 'sign-in' ? <Pressable accessibilityRole="button" accessibilityLabel="Am uitat parola" onPress={sendResetEmail}><Text style={styles.link}>Am uitat parola</Text></Pressable> : null}
        {activeMode === 'reset-password' ? (
          <Pressable onPress={() => setMode('sign-in')}><Text style={styles.link}>Înapoi la autentificare</Text></Pressable>
        ) : (
          <View style={styles.switchRow}>
            <Text style={styles.note}>{activeMode === 'sign-in' ? 'Nu ai cont?' : 'Ai deja cont?'}</Text>
            <Pressable onPress={() => setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in')}>
              <Text style={styles.link}>{activeMode === 'sign-in' ? 'Creează cont' : 'Autentificare'}</Text>
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
