import { router } from 'expo-router';
import { Card, PageHeader, PrimaryButton, Screen } from '@/components/mvp-ui';
import { useLocalization } from '@/providers/localization-provider';

export default function ResetConfirmationScreen() {
  const { t } = useLocalization();
  return (
    <Screen>
      <PageHeader
        title={t('resetConfirmation.title')}
        subtitle={t('resetConfirmation.subtitle')}
      />
      <Card>
        <PageHeader
          title={t('resetConfirmation.cardTitle')}
          subtitle={t('resetConfirmation.cardSubtitle')}
        />
        <PrimaryButton label={t('resetConfirmation.backToLogin')} onPress={() => router.replace('/auth')} />
      </Card>
    </Screen>
  );
}
