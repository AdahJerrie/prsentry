// src/pages/PrList.jsx
import { useApi } from "../hooks/useApi";
import ExpandablePrCard from "../components/ExpandablePrCard";

export default function PrList() {
  const { data, loading, error } = useApi("/prs");

  if (loading) return <div className="min-h-screen p-8"><p className="text-text-secondary">Loading pull requests...</p></div>;
  if (error) return <div className="min-h-screen p-8"><p className="text-danger">Error: {error}</p></div>;

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold mb-6">Pull Requests</h1>
      <div className="space-y-3">
        {data.map((pr) => (
          <ExpandablePrCard key={pr.id} pr={pr} />
        ))}
      </div>
    </div>
  );
}