import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette } from '@/constants/palette';

export default function TermsScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Termeni și condiții</Text>
        <Text style={styles.meta}>Versiune: 1.0 — [DATA DE COMPLETAT]</Text>

        <Text style={styles.h2}>1. Operator și acceptare</Text>
        <Text style={styles.p}>[OPERATOR/ENTITATE LEGALĂ DE COMPLETAT]</Text>
        <Text style={styles.p}>[ADRESĂ DE SUPORT DE COMPLETAT]</Text>
        <Text style={styles.p}>Utilizarea aplicației Ortodoxia este condiționată de acceptarea prezentelor condiții. Dacă nu sunteți de acord, vă rugăm să nu utilizați aplicația.</Text>

        <Text style={styles.h2}>2. Eligibilitate</Text>
        <Text style={styles.p}>Aplicația este destinată persoanelor cu vârsta minimă necesară pentru a-și crea un cont pe platformele Apple App Store / Google Play. Persoanele minore trebuie să utilizeze aplicația cu acordul reprezentantului legal.</Text>

        <Text style={styles.h2}>3. Contul dumneavoastră</Text>
        <Text style={styles.p}>Sunteți responsabil pentru confidențialitatea credențialelor contului și pentru toate activitățile desfășurate prin contul dumneavoastră. Notificați-ne imediat la adresa de suport dacă suspectați o utilizare neautorizată.</Text>
        <Text style={styles.p}>Ștergerea contului este o acțiune separată de anularea abonamentului. Pentru detalii, consultați Politica de confidențialitate (secțiunea 8).</Text>

        <Text style={styles.h2}>4. Utilizare acceptabilă</Text>
        <Text style={styles.p}>Vă angajați să utilizați aplicația într-un mod onest și respectuos, fără a încerca să eludați limitele tehnice, să abuzați de funcționalitățile AI sau să prejudiciați alți utilizatori.</Text>

        <Text style={styles.h2}>5. Utilizare interzisă</Text>
        <Text style={styles.p}>Nu este permisă:</Text>
        <Text style={styles.li}>• încercarea de a accesa conturi sau date ale altor utilizatori;</Text>
        <Text style={styles.li}>• utilizarea aplicației în scopuri ilegale, ofensatoare, abuzive sau frauduloase;</Text>
        <Text style={styles.li}>• copierea, redistribuirea sau republicarea conținutului aplicației fără drept;</Text>
        <Text style={styles.li}>• eludarea mecanismelor de limitare a utilizării (de ex. a limitei zilnice de mesaje AI);</Text>
        <Text style={styles.li}>• introducerea deliberată de conținut care poate genera răspunsuri dăunătoare sau ilicite.</Text>

        <Text style={styles.h2}>6. Limitări ale conținutului AI</Text>
        <Text style={styles.p}>Răspunsurile generate de Chatul AI sunt generate automat de un model lingvistic. Acestea:</Text>
        <Text style={styles.li}>• pot conține erori sau inexactități;</Text>
        <Text style={styles.li}>• trebuie evaluate independent de către utilizator;</Text>
        <Text style={styles.li}>• nu reprezintă puncte de vedere oficiale ale Bisericii Ortodoxe sau ale vreunei autorități eclesiastice.</Text>

        <Text style={styles.h3}>6.1 AI nu înlocuiește profesioniștii</Text>
        <Text style={styles.p}>Chatul AI nu înlocuiește și nu se substituie:</Text>
        <Text style={styles.li}>• unui preot sau duhovnic — pentru îndrumare duhovnicească;</Text>
        <Text style={styles.li}>• unui medic — pentru diagnostic, tratament sau sfaturi medicale;</Text>
        <Text style={styles.li}>• unui avocat — pentru consultanță juridică;</Text>
        <Text style={styles.li}>• unui serviciu de urgență.</Text>
        <Text style={styles.p}>Pentru urgențe medicale, psihologice sau de siguranță, contactați imediat serviciile de urgență (112 în România, sau numărul corespunzător din țara dumneavoastră).</Text>

        <Text style={styles.h3}>6.2 Limitări privind conținutul religios</Text>
        <Text style={styles.p}>Explicațiile religioase generate de AI nu sunt hotărâri eclesiastice oficiale. Pentru aspecte doctrinare, canonice sau liturgice, consultați sursele bisericești oficiale (Sfânta Scriptură, scrierile Sfinților Părinți, indicațiile duhovnicului dumneavoastră).</Text>
        <Text style={styles.p}>Aplicația nu implică și nu pretinde girul sau susținerea vreunei autorități bisericești.</Text>

        <Text style={styles.h3}>6.3 Responsabilitatea dumneavoastră</Text>
        <Text style={styles.p}>Sunteți singurul responsabil pentru deciziile luate pe baza informațiilor generate de AI. Nu vă bazați exclusiv pe aceste răspunsuri pentru decizii importante privind sănătatea, viața spirituală, drepturile sau siguranța dumneavoastră.</Text>

        <Text style={styles.h2}>7. Conținut extern</Text>
        <Text style={styles.p}>Aplicația poate afișa transmisiuni live, linkuri sau citate editoriale provenind de la terțe părți. Acestea rămân sub responsabilitatea furnizorilor respectivi. Ortodoxia nu garantează acuratețea, disponibilitatea sau actualitatea conținutului extern.</Text>

        <Text style={styles.h2}>8. Abonamente</Text>
        <Text style={styles.p}>Funcționalitățile Premium sunt disponibile prin abonament lunar sau anual. Abonamentul se reînnoiește automat până la anulare.</Text>
        <Text style={styles.h3}>8.1 Plăți și reînnoire</Text>
        <Text style={styles.p}>Plățile sunt procesate de Apple App Store sau Google Play. Anularea reînnoirii automate se face din contul dumneavoastră de pe platforma respectivă (Setări → Abonamente).</Text>
        <Text style={styles.h3}>8.2 Anulare</Text>
        <Text style={styles.p}>Anularea oprește reînnoirea viitoare. Accesul la funcționalitățile Premium rămâne activ până la sfârșitul perioadei deja plătite.</Text>
        <Text style={styles.h3}>8.3 Dezinstalare</Text>
        <Text style={styles.p}>Dezinstalarea aplicației nu anulează abonamentul. Anularea se face doar din App Store / Google Play.</Text>
        <Text style={styles.h3}>8.4 Restituiri</Text>
        <Text style={styles.p}>Restituirile sunt gestionate de Apple / Google conform politicilor acestora. Ortodoxia nu oferă restituiri directe. Pentru solicitări de restituire, contactați platforma de unde ați efectuat achiziția.</Text>
        <Text style={styles.h3}>8.5 Restaurare</Text>
        <Text style={styles.p}>Funcția „Restaurează cumpărăturile" disponibilă în ecranul Premium reactivează drepturile de abonament existente, atunci când este suportat de platformă.</Text>

        <Text style={styles.h2}>9. Limitarea răspunderii</Text>
        <Text style={styles.p}>Aplicația este furnizată „așa cum este". În limita permisă de lege, Ortodoxia nu garantează că serviciul va fi neîntrerupt, lipsit de erori sau complet potrivit unui anumit scop. Nu ne asumăm răspunderea pentru daune indirecte, incidentale sau consecutive rezultate din utilizarea aplicației.</Text>

        <Text style={styles.h2}>10. Suspendare și restricționare</Text>
        <Text style={styles.p}>În caz de abuz, încălcare a acestor condiții sau solicitări din partea autorităților, ne rezervăm dreptul de a suspenda sau restrictiona accesul la cont sau la aplicație.</Text>

        <Text style={styles.h2}>11. Modificări</Text>
        <Text style={styles.p}>Ne rezervăm dreptul de a actualiza periodic acești termeni. Modificările semnificative vor fi comunicate prin aplicație sau prin e-mail.</Text>

        <Text style={styles.h2}>12. Legea aplicabilă</Text>
        <Text style={styles.p}>Prezentele condiții sunt guvernate de legile [JURISDICȚIA DE COMPLETAT]. Orice dispută va fi soluționată de instanțele competente din [LOCALITATE DE COMPLETAT].</Text>

        <Text style={styles.h2}>13. Contact</Text>
        <Text style={styles.p}>[ADRESĂ DE SUPORT DE COMPLETAT]</Text>
        <Text style={styles.p}>[URL PUBLIC AL TERMENILOR DE COMPLETAT]</Text>
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
  li: { color: palette.muted, fontSize: 14, lineHeight: 21 },
});
