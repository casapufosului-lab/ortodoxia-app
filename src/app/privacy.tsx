import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette } from '@/constants/palette';

export default function PrivacyScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Politica de confidențialitate</Text>
        <Text style={styles.meta}>Versiune: 1.0 — [DATA DE COMPLETAT]</Text>

        <Text style={styles.h2}>1. Operator</Text>
        <Text style={styles.p}>[OPERATOR/ENTITATE LEGALĂ DE COMPLETAT]</Text>
        <Text style={styles.p}>[ADRESĂ DE SUPORT DE COMPLETAT]</Text>
        <Text style={styles.p}>[ADRESĂ POȘTALĂ DE COMPLETAT]</Text>

        <Text style={styles.h2}>2. Ce date colectăm</Text>
        <Text style={styles.p}>Ortodoxia procesează următoarele categorii de date, strict în măsura în care funcționalitățile aplicației le utilizează.</Text>

        <Text style={styles.h3}>2.1 Date de autentificare</Text>
        <Text style={styles.p}>La crearea unui cont, colectăm adresa de e-mail și parola furnizate. Parola este stocată hash-uită (nu în plaintext) de către Supabase.</Text>

        <Text style={styles.h3}>2.2 Profil utilizator</Text>
        <Text style={styles.p}>Numele de afișare setat de utilizator este stocat în tabelul `profiles` din Supabase, asociat identificatorului unic al contului.</Text>

        <Text style={styles.h3}>2.3 Preferințe de regiune și calendar</Text>
        <Text style={styles.p}>Preferința de regiune și calendar liturgic este stocată local pe dispozitiv și nu este transmisă serverului în mod automat.</Text>

        <Text style={styles.h3}>2.4 Conversații AI</Text>
        <Text style={styles.p}>Când un utilizator autentificat trimite un mesaj către Chatul AI, conținutul mesajelor și răspunsurilor este stocat în tabelele `chat_threads` și `chat_messages` din Supabase, asociat contului.</Text>
        <Text style={styles.p}>Utilizarea zilnică a mesajelor AI este înregistrată în tabelul `usage_daily`. Pentru utilizatorii neautentificați se utilizează un identificator generat local; utilizarea este înregistrată în `guest_usage_daily`.</Text>
        <Text style={styles.p}>Nu introduceți informații personale sensibile în conversațiile AI. Mesajele reflectă ceea ce furnizați în mod voluntar.</Text>

        <Text style={styles.h3}>2.5 Preferințe de notificări</Text>
        <Text style={styles.p}>Dacă activați notificările, starea preferinței este stocată în tabelul `notification_preferences`. Un Expo Push Token este transmis și stocat server-side. Token-ul este regenerat de sistemul Expo și nu conține date personale.</Text>

        <Text style={styles.h3}>2.6 Abonamente și plăți</Text>
        <Text style={styles.p}>Plățile sunt gestionate de Apple App Store, Google Play și RevenueCat. Starea abonamentului este sincronizată printr-un webhook server-side și stocată în tabelul `subscriptions` din Supabase. Nu stocăm date de card bancar.</Text>

        <Text style={styles.h3}>2.7 Rugăciuni și preferințe</Text>
        <Text style={styles.p}>Rugăciunile sunt stocate în tabelul `prayers` din Supabase. Favoritele salvate sunt stocate în tabelul `favorites` asociat contului.</Text>

        <Text style={styles.h3}>2.8 Conținut audio generat de AI</Text>
        <Text style={styles.p}>La cerere, aplicația poate genera audio pentru o rugăciune folosind OpenAI text-to-speech. Fișierul rezultat este stocat în Supabase Storage. Generarea are loc pe server.</Text>

        <Text style={styles.h3}>2.9 Starea serviciilor LIVE</Text>
        <Text style={styles.p}>Pagina „Slujbe LIVE" afișează starea live a surselor video selectate. Verificarea este realizată pe server folosind YouTube Data API și este temporar cache-uită în tabelul `live_service_status_cache`. Nu sunt colectate date personale în legătură cu utilizarea acestei funcții.</Text>

        <Text style={styles.h3}>2.10 Loguri de erori</Text>
        <Text style={styles.p}>În cazul unor erori de conexiune, anumite loguri pot conține informații despre cererea eșuată. Aceste loguri nu conțin date personale în mod deliberat și nu sunt folosite în scopuri de analiză sau urmărire.</Text>

        <Text style={styles.h2}>3. Ce date NU colectăm</Text>
        <Text style={styles.p}>Ortodoxia nu folosește servicii de analiză (analytics), raportare a erorilor (crash reporting) sau urmărire a utilizatorilor (tracking). Nu colectăm date din cameră, microfon, fotografii sau locație.</Text>

        <Text style={styles.h2}>4. Terți care procesează date</Text>
        <Text style={styles.p}>Datele sunt procesate prin intermediul următoarelor servicii terțe:</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.th}>Serviciu</Text>
            <Text style={styles.th}>Scop</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>Supabase</Text>
            <Text style={styles.td}>Bază de date, autentificare, stocare fișiere</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>OpenAI</Text>
            <Text style={styles.td}>Răspunsuri AI și conținut audio</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>RevenueCat</Text>
            <Text style={styles.td}>Gestionarea abonamentelor</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>Apple App Store / Google Play</Text>
            <Text style={styles.td}>Plăți și drepturi de abonament</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>YouTube Data API</Text>
            <Text style={styles.td}>Verificarea stării live</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>Expo / React Native</Text>
            <Text style={styles.td}>Platforma aplicației; Expo Push</Text>
          </View>
        </View>

        <Text style={styles.h2}>5. Conținut extern</Text>
        <Text style={styles.p}>Aplicația poate afișa sau lega către conținut extern — transmisiuni live și resurse editoriale. Ortodoxia nu este responsabilă pentru conținutul sau practicile de confidențialitate ale acestor servicii externe.</Text>

        <Text style={styles.h2}>6. Securitate</Text>
        <Text style={styles.p}>Datele sunt transmise prin HTTPS/TLS. Parolele sunt hash-uite. Cheile API sunt păstrate exclusiv server-side. Nicio măsură de securitate nu oferă o garanție absolută.</Text>

        <Text style={styles.h2}>7. Drepturile dumneavoastră</Text>
        <Text style={styles.p}>Este posibil să aveți dreptul de a accesa, rectifica sau șterge datele dumneavoastră. Contactați operatorul: [ADRESĂ DE SUPORT DE COMPLETAT]</Text>

        <Text style={styles.h2}>8. Ștergerea contului vs. anularea abonamentului</Text>
        <Text style={styles.p}><Text style={styles.bold}>Ștergerea contului</Text> elimină profilul și datele asociate din Supabase. Contul nu mai poate fi recuperat.</Text>
        <Text style={styles.p}><Text style={styles.bold}>Anularea abonamentului</Text> (din App Store / Google Play) oprește doar reînnoirea automată. Drepturile Premium rămân valabile până la sfârșitul perioadei deja plătite.</Text>
        <Text style={styles.p}>Dezinstalarea aplicației NU anulează abonamentul.</Text>

        <Text style={styles.h2}>9. Modificări ale politicii</Text>
        <Text style={styles.p}>Această politică poate fi actualizată periodic. Modificările semnificative vor fi comunicate prin aplicație sau prin e-mail.</Text>

        <Text style={styles.h2}>10. Contact</Text>
        <Text style={styles.p}>[ADRESĂ DE SUPORT DE COMPLETAT]</Text>
        <Text style={styles.p}>[URL PUBLIC AL POLITICII DE COMPLETAT]</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 60, gap: 4 },
  h1: { color: palette.ink, fontSize: 28, fontWeight: '800', paddingTop: 12, paddingBottom: 4 },
  meta: { color: palette.muted, fontSize: 13, marginBottom: 16 },
  h2: { color: palette.ink, fontSize: 18, fontWeight: '800', marginTop: 18, marginBottom: 6 },
  h3: { color: palette.ink, fontSize: 15, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  p: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  bold: { fontWeight: '700', color: palette.ink },
  table: { marginTop: 8, gap: 1 },
  tableHeader: { flexDirection: 'row', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: palette.line },
  tableRow: { flexDirection: 'row', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: palette.line },
  th: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: '700' },
  td: { flex: 1, color: palette.muted, fontSize: 13, lineHeight: 19 },
});

