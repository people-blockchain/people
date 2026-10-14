import { notFound } from "next/navigation";
import { PredictApp } from "../../PredictApp";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,17}$/.test(id)) notFound();
  return <PredictApp view="event" marketId={id} />;
}
