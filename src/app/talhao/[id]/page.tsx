import { TalhaoPage } from '@/components/talhao/TalhaoPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TalhaoPage id={id} />;
}
