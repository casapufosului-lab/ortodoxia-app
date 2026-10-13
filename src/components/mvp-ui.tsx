import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';
import { contentBoxStyle, screenBottomPadding } from '@/lib/responsive-layout';

/**
 * Containerul comun al ecranelor.
 *
 * Bug-ul din 09.10.2026: conținutul se termina cu un padding de jos FIX (`paddingBottom: 36`)
 * și fără citirea zonei sigure, iar lățimea maximă era aplicată orbește. Acum:
 * - padding-ul de jos = baza + `insets.bottom`, deci ultimul element rămâne deasupra barei
 *   de navigare a sistemului (Android 15 e edge-to-edge obligatoriu la targetSdk 36);
 * - pe ecrane late (≥ `WIDE_SCREEN_MIN_WIDTH`) conținutul se centrează și se limitează la
 *   `CONTENT_MAX_WIDTH`, ca să nu se întindă pe tot ecranul unui foldable/tabletă.
 * Ambele calcule sunt în `@/lib/responsive-layout` și sunt testate direct.
 * `footer` (13.10.2026) este pentru ecranele cu o zonă care NU are voie să deruleze:
 * compozitorul din chat. Dovedit cu artefacte: în starea B a chatului (`chat-quota`, pasul 041)
 * compozitorul ieșea de pe ecran pe măsură ce conversația creștea, deci omul nu mai putea scrie.
 * Când există `footer`, zona derulantă lasă locul de jos footer-ului (care primește zona sigură) —
 * altfel ar rămâne un gol mare între ultimul mesaj și compozitor.
 */
export function Screen({ children, style, contentStyle, footer }: PropsWithChildren<{ style?: ViewStyle; contentStyle?: ViewStyle; footer?: ReactNode }>) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, style]}>
      <ScrollView
        contentContainerStyle={[
          styles.screen,
          contentBoxStyle(width),
          { paddingBottom: footer ? SCREEN_SCROLL_BOTTOM_WITH_FOOTER : screenBottomPadding(insets.bottom) },
          contentStyle,
        ]}>
        {children}
      </ScrollView>
      {/* `footer` (13.10.2026): zona care NU are voie sa deruleze — compozitorul din chat.
          Dovedit in artefacte: in starea B (`chat-quota`, pasul 041) compozitorul iesea de pe ecran
          pe masura ce conversatia crestea, deci omul nu mai putea scrie deloc. */}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: screenBottomPadding(insets.bottom) }]}>{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      {eyebrow ? <Text style={styles.eyrow}>{eyebrow}</Text> : null}
      {/*
        accessibilityRole="header" is what gives VoiceOver a heading rotor entry and
        TalkBack a "headings" navigation stop. Without it a screen-reader user cannot
        jump between the sections of a long screen and must read every element in order.
        RN 0.86 prefers `role="heading"`; `accessibilityRole="header"` still maps to a
        heading on both platforms, so the check accepts either.
      */}
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: PropsWithChildren<{ action?: ReactNode }>) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

/**
 * Shared disabled styling.
 *
 * A disabled button must be visually and functionally inert. The `disabled` prop was
 * previously absent entirely, so a screen showing "processing…" still accepted taps
 * and could dispatch a second request before React re-rendered.
 */
const disabledStyles = StyleSheet.create({
  disabled: { opacity: 0.5 },
});

type ButtonProps = {
  label: string;
  onPress: () => void;
  /**
   * When true the button does not dispatch and is reported as disabled to assistive
   * technology. Callers should combine this with a synchronous in-flight ref guard,
   * because state alone cannot stop a same-tick double tap.
   */
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function PrimaryButton({ label, onPress, disabled = false, accessibilityLabel }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && !disabled && styles.pressed,
        disabled && disabledStyles.disabled,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled = false, accessibilityLabel }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && !disabled && styles.pressed,
        disabled && disabledStyles.disabled,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

/** Cât loc lasă zona derulantă sub ultimul element când jos e un `footer` fixat (compozitorul din chat). */
const SCREEN_SCROLL_BOTTOM_WITH_FOOTER = 12;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.skyLight },
  screen: { width: '100%', padding: 20, gap: 18 },
  /* `footer`: conținut FIXAT sub zona derulantă (compozitorul din chat). Aceeași margine
     laterală ca `screen` (20), ca să nu se vadă o ruptură; jos primește zona sigură a sistemului. */
  footer: { width: '100%', paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  header: { gap: 6, paddingTop: 8 },
  eyrow: { color: palette.goldDark, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: palette.ink, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: palette.card, borderColor: palette.border, borderWidth: 1, borderRadius: 18, padding: 18, gap: 10, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 16, elevation: 3 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: palette.ink, fontSize: 19, fontWeight: '800' },
  primaryButton: { backgroundColor: palette.gold, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonText: { color: palette.ink, fontSize: 16, fontWeight: '700' },
  secondaryButton: { backgroundColor: palette.blueSoft, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryButtonText: { color: palette.blue, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
