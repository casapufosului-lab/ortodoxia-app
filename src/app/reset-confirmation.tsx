import { router } from 'expo-router';
import { Card, PageHeader, PrimaryButton, Screen } from '@/components/mvp-ui';

export default function ResetConfirmationScreen() {
  return (
    <Screen>
      <PageHeader
        title="Verifică emailul"
        subtitle="Am trimis instrucțiunile pentru resetarea parolei."
      />
      <Card>
        <PageHeader
          title="Mesaj trimis"
          subtitle="Deschide mesajul primit și apasă linkul de resetare. Verifică și folderul Spam sau Promotions."
        />
        <PrimaryButton label="Înapoi la autentificare" onPress={() => router.replace('/auth')} />
      </Card>
    </Screen>
  );
}
