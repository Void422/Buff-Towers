import { TowerDashboard } from "@/components/TowerDashboard";
import { getTowerSnapshot } from "@/lib/tower-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await getTowerSnapshot();

  return <TowerDashboard initialSnapshot={snapshot} />;
}

